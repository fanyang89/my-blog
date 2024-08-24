---
date: 2024-08-24 17:05:00
category:
  - consensus
  - filesystem
tag:
  - raft
  - parallel-raft
---

# PolarFS: An Ultra-low Latency and Failure Resilient Distributed File System for Shared Storage Cloud Database

<a href="/html/polarfs/polarfs.html" target="_blank">点击这里打开 PPT</a>

## 综述

PolarFS 是一种具有超低延迟和高可用性的分布式文件系统，专为 PolarDB 数据库服务而设计。

- PolarFS 采用轻量级网络协议栈和用户空间 I/O 协议栈 ， 充 分 利 用 了 RDMA 、 NVMe 和 SPDK 等新兴技术。通过这种方式，PolarFS 的端到端延迟大幅降低，我们的实验表明，PolarFS 的写入延迟与固态硬盘上的本地文件系统相当接近。
- 为了在保持副本一致性的同时最大化 PolarFS 的 I/O 吞吐量，我们开发了 ParallelRaft，这是一种从 Raft 发展而来的共识协议，基于乱序 I/O 实现并打破了Raft 严格的序列化限制。

## 引言

- 存算分离。使得架构更加灵活
  - 计算节点和存储节点可以使用不同类型的服务器硬件。例如计算节点无需再考虑内存大小与磁盘容量的比例
  - 集群中存储节点上的磁盘可以形成一个存储池，从而降低了磁盘碎片、节点间磁盘使用不平衡和空间浪费的风险
  - 由于数据全部存储在存储集群上，计算节点上没有状态，可以更容易地执行数据库迁移
- 当前的云平台难以充分利用 RDMA 和 NVMe SSD 等新兴硬件能力
  - 一些广泛使用的开源分布式文件系统（如 HDFS 和 Ceph）的延迟远远高于本地磁盘。当使用最新的 PCIe SSD 时，性能差距甚至可以达到数量级。在CPU和内存配置相同的情况下，在这些存储系统上正常运行的 MySQL 等关系数据库的性能比在本地 PCIe SSD 上的性能差很多
  - 为了解决这个问题，云厂商提供了实例存储（instance store）。实例存储使用本地 SSD。
    - 缺点：容量有限。无法容忍硬件故障，数据库必须自行管理数据复制。使用通用文件系统（xfs、btrfs），使用 RDMA 和 PCIe SSD 时，内核空间和用户空间之间的消息传递成本影响 I/O 吞吐。不能支持 share-everything 架构。
- PolarFS 通过以下机制提供超低延迟，高吞吐和高可用。
  - RDMA、NVMe SSD，用户空间实现的网络栈和 I/O 栈
  - 提供类似 POSIX 的文件系统 API。链接到数据库程序中，取代 OS 提供的接口，将所有的 I/O 路径保留在用户空间。
  - PolarFS 数据平面的 I/O 模型也是为了消除锁、避免关键数据路径的上下文切换而设计的：消除非必要的内存拷贝，大量使用 DMA 在住内存和 RDMA NIC/NVMe 磁盘之间传输数据
  - 结果：PolarFS 的端到端延迟与 SSD 上的本地文件系统相当接近。
- Raft 在超低延迟硬件上，严重阻碍 PolarFS 的 I/O 扩展性。开发 ParallelRaft：
  - 允许乱序 log ACK、Commit 和 Apply
  - 结果：显著提高 PolarFS 并发性能。

- 在 PolarFS 的基础上实现了 PolarDB。

- 主节点、只读节点。主节点可读写，只读节点只提供读。主节点和只读节点通过 PolarFS 共享同个数据库目录下的 redo log 和数据文件。
- PolarFS 提供如下特性支持 PolarDB：
  - 同步文件元数据的修改（文件截断、扩大、创建和删除）。所有的修改对于只读节点是可见的。
  - 一致性级别：文件元数据：序列化。
  - 网络分区。PolarFS 可以确保只有真正的主节点可以提供服务，防止数据损坏。

![PolarFS 架构](/images/polarfs/figure-1.png)

## 背景

- NVMe
  - 以低于 100μs 的延迟提供 50w IOPS。最新的 3D XPoint 固态硬盘甚至能将 I/O 延迟降至 10us 左右。
  - 传统的 I/O 堆栈成为瓶颈。仅完成一个 4KB 的 I/O 请求就需要执行约 2w 条指令
- RDMA：提供低延迟通信机制。
  - 同交换机两节点传递 4K 需要 7us
  - PolarFS 在用户空间轮询 CQ，消除了上下文切换

## 架构

PolarFS 主要由两层组成：

- 上层管理文件系统元数据并提供文件系统 API。文件系统层支持卷中的文件管理，并负责文件系统元数据并发访问的互斥和同步
- 下层是存储管理。存储层负责存储节点的所有磁盘资源，并为每个数据库实例提供一个数据库卷

![存储层抽象](/images/polarfs/figure-2.png)

- libpfs。提供类似 POSIX 的文件系统 API
- PolarSwitch，驻留在计算节点上，将 I/O 重定向到 ChunkServer 上。
- ChunkServer，部署在存储节点上，提供 I/O 服务。
- PolarCtrl，控制平面。包括一组微服务作为主控，和在计算与存储节点上部署的 agent。使用 MySQL 作为元数据存储。

## 文件系统层

提供一个共享的并行文件系统，为了多数据库节点并发访问而设计。例如对于 PolarDB，当数据库主节点执行一个创建表的 DDL 语句，会在 PolarFS 中创建一个新文件，只读节点可以之行 SELECT 语句访问文件。因此有必要维护文件系统元数据的一致性，并且序列化并发修改，避免元数据损坏。

### 存储层

存储层给文件系统层提供管理卷和访问卷的接口。

- 卷由一组 chunk 组成。Chunk 是数据分布的最小单元。
- 卷的大小从 10G 到 100T 不等，可以扩容。
- 卷可以以 512B 对齐随机访问。
- 单个 I/O 请求中对同个 chunk 的修改是原子的

### Chunk

- 单个 Chunk 不会跨越多个磁盘。
- 默认三副本。
- Chunk 可以在 ChunkServer 中自动迁移，避免热点。
- Chunk 大小是 10G。降低元数据量，简化元数据管理，可以缓存在 PolarSwitch 的内存中。
  - 缺点：是无法进一步分离一个 Chunk 上的热点。但由于数据块与服务器的比例较高（目前约为 1000:1），而通常数据库实例数量较多（数千个或更多），服务器之间具有数据块迁移能力，因此 PolarFS 可以在整个系统层面实现负载平衡。

### Block

- 一个 Chunk 分成若干个 Block。
- 一个 Block 大小是 64KB。
- Chunk LBA 与 Block 的映射表，以及每个空闲块的 Bitmap 都存储在 ChunkServer 本地。单个 Chunk 的映射表占用 640KB，可以放在 ChunkServer 内存中。

### PolarSwitch

PolarSwitch 是部署在计算节点的 Daemon，它负责I/O请求映射到具体的后端节点。数据库通过libpfs将I/O请求发送给 PolarSwitch，每个请求包含了数据库实例所在的Volume ID、起始偏移和长度。PolarSwitch 将其划分为对应的一到多个 Chunk，并将请求发往Chunk所属的ChunkServer完成访问。

### ChunkServer

ChunkServer 部署在后端存储节点上。一个存储节点可以有多个ChunkServer。每个ChunkServer绑定到一个CPU核，并管理一个独立的NVMe SSD 盘，因此ChunkServer之间没有资源争抢。

ChunkServer 负责 Chunk 内的资源映射和读写。每个Chunk都包括一个WAL，对Chunk的修改会先进Log再修改，保证数据的原子性和持久性。ChunkServer使用了3DXPoint SSD 和普通 NVMe SSD 混合型WAL buffer，Log会优先存放到更快的3DXPoint SSD 中。

ChunkServer 会复制写请求到对应的 Chunk 副本（其他 ChunkServer）上，我们通过自己定义的Parallel Raft一致性协议来保证Chunk副本之间在各类故障状况下数据正确同步和保障已Commit数据不丢失。

### PolarCtrl

PolarCtrl 是 PolarFS 集群的控制核心。其主要职责包括：

1. 监控ChunkServer的健康状况，确定哪些ChunkServer有权属于PolarFS集群；
2. Volume创建及Chunk的布局管理（即Chunk分配到哪些ChunkServer）；
3. Volume至Chunk的元数据信息维护；
4. 向PolarSwitch推送元信息缓存更新；
5. 监控Volume和Chunk的I/O性能；
6. 周期性地发起副本内和副本间的CRC数据校验。

PolarCtrl 使用了一个关系数据库云服务用于管理上述 metadata。

## 一致性

在设计之初，我们考虑到实现的复杂性选择了 Raft。然而，一些缺陷很快就出现了。

Raft 的设计简单易懂，高度序列化。它的日志不允许在 Leader 和 Follower 上都有日志空洞：

- 这意味着 Log entry 由 Follower ACKed，Leader 提交，并顺序应用于所有副本
- 当写请求并发执行时，它们会按顺序提交。对于队列尾部的请求，在他之前的所有请求持久化并得到 ACK 之前，尾部的请求无法提交和响应，增加了平均延迟，降低了吞吐。我们观察到当 iodepth 从 8 增加到 32 时，吞吐量下降了一半。

Raft 不太适合使用多个连接在 Leader 和 Follower 之间传输日志的环境。当一个连接阻塞或者变慢时，日志条目会乱序到达 Follower，但是 Follower 必须按序接受日志条目：当前面丢失的日志条目到达之前，无法发送 ACK 通知 Leader 后面的日志已经持久化。当大多数 Follower 被这些丢失的日志条目阻塞时，Leader 就会陷入困境。

数据库等事务处理系统中，并发控制算法允许以交错和无序的方式执行事务，并且生成可序列化的结果。这些系统可以容忍传统存储语义产生的无序 I/O 完成，并且自己确保数据一致性。数据库并不关心底层存储的执行顺序，数据库的锁系统会保证在任何时间点，只有一个线程可以在某个页面上工作。当不同的线程在不同的页面上并发工作时，数据库只需要成功执行 I/O，而顺序并不重要。在 PolarFS 中放宽了 Raft 的一些限制，从而开发出一种更适合高并发的共识协议。

我们采用与 Raft 相同的问题分解方法，将 ParallelRaft 分成更小的部分：日志复制、领导者选举和 Catch-up。

## 乱序日志复制

Leader 向 Follower 发送日志条目后，Follower 需要 ACK 该日志条目，以告知该日志条目已被接收和持久化。这个 ACK 还隐含着前面的所有日志都已经被接收和持久化。当一个 Leader 提交日志条目，并且广播这个事件时，也承认了前面所有的日志条目都已经提交。

ParallelRaft 打破了这个限制，乱序执行这些步骤。因此 ParallelRaft 中一个日志条目被确认提交后，并不意味着在这个日志之前的所有日志都已经被成功提交。

这里的乱序日志执行遵循这样的规则：如果日志条目的写入范围互不重叠，并且日志条目没有冲突，那么他们可以按照任何顺序执行。这里的一个前提是 ParallelRaft 可以读取到日志中的 LBA 范围，来发现冲突。

### 乱序 ACK

在 ParallelRaft 中，一旦日志持久化，就可以返回 ACK。不需要等待之前的日志条目持久化。

### 乱序 Commit

ParallelRaft 中，日志条目可以在大多数副本确认后立即提交。这种提交语义对于存储系统来说是可以接受的，因为存储系统通常不承诺像事务处理系统那样的强一致性语义。例如 ，NVMe 不会检查读取或写入命令的 LBA 以确保并发命令之间的任何类型的排序，也不保证这些命令的完成顺序。

### 应用存在空洞的日志到状态机

由于日志复制和提交可以乱序，日志中会存在空洞。如果前面的日志仍然缺失，如何安全的应用日志？这里引入了一个叫做 look behind buffer 的数据结构。LBB 包含了前 N 个日志条目修改过的 LBA，N 也就是能容忍的最大空洞大小。

通过 LBB，Follower 可以判断某个日志条目是否冲突，这意味着该日志条目修改的 LBA 与前面的日志条目重叠。如果不重叠，就可以安全的应用，否则就应该加入到待处理列表中，等到洞被补齐才能应用。根据我们在 PolarFS 中使用 RDMA 网络的经验，对其 I/O 并发来说，设置 N 为 2已经足够好。
