---
date: 2024-03-28
category:
  - storage
tag:
  - ceph
---

# Ceph 本地存储引擎的十年演进

[论文原文](https://www.usenix.org/system/files/login/articles/spring20_02_aghayev.pdf)

## 摘要

过去十年，Ceph 同其他分布式存储系统一样，将本地文件系统作为存储后端。但从 Ceph 发展的经验来看，本地文件系统带来了极大的代价。

1. 很难实现零开销事务机制
2. 元数据在本地级别的性能显著影响系统的性能表现
3. 支持存储新硬件的速度极为缓慢

为了解决这些问题，Ceph 实现了 BlueStore。BlueStore 在用户态运行，控制整个 IO stack。

特性：

- 支持 EC
- 实现了编码数据的快速覆写和内联压缩
- 降低了性能抖动，避免了文件系统的性能缺陷

## 大纲

1. Ceph 的存储后端演进
2. Ceph 架构
3. Ceph 对存储后端的需求
4. FileStore：基于本地文件系统开发存储后端
5. 尝试基于裸设备开发存储后端 NewStore
6. 从头来过的 BlueStore
    - BlueStore 设计
    - BlueStore 特性
    - 开发 BlueStore 时遇到的挑战
    - 使用 BlueStore 带来的收益

## Ceph 的存储后端演进

ObjectStore 的第一个实现是 EBOFS（Extent and B-Tree-based Object File System）。2008 年，Btrfs 具有了吸引人的特性，比如事务，去重，校验和压缩。EBOFS 缺乏这些特性。因此，EBOFS 被基于 Btrfs 的 FileStore 替换了。

### EBOFS

在 FileStore 中，一个对象集被映射到目录中，对象的数据存储于文件中。一开始，对象 attributes 存储于 xattrs（POSIX extended file attributes），但当 attributes 达到 xattrs 的数量和容量上限后，就被转移到了 LevelDB。FileStore 作为生产级别的存储后端数年之久，在这个过程中，Btrfs 一直处于不稳定的状态，被数据和元数据碎片问题严重困扰。与此同时，由于 ObjectStore 接口发生了很大变化，所以切回 EBOFS 变得不切实际。于是，FileStore 被移植到 XFS，ext4 和 ZFS。其中基于 XFS 的 FileStore 成为事实上的存储后端，因为其具有更好的扩展性，元数据性能也更好。

虽然 FileStore on XFS 是稳定的，但仍然被元数据碎片困扰，没有充分发挥硬件的潜力。由于 XFS 不支持本地事务，导致 Ceph 团队实现了一个 userspace WAL。这个 WAL 执行完整的 journaling，限制了 read-modify-write 的速度（这是 Ceph 典型的工作负载）。此外，由于 XFS 不支持 COW，快照时进行的大量克隆操作显著变慢。

NewStore 是解决基于文件系统的存储后端导致的元数据问题的首次尝试。NewStore 把元数据保存在 RocksDB，而对象数据本身保存在文件中。RocksDB 也被用来实现 WAL。由于结合了数据和元数据日志，使得 read-modify-write 效率提高。然而将对象数据存储为文件，并在一个具有 journaling 的文件系统上运行 RocksDB 带来了很高的一致性开销。于是 BlueStore 应运而生。

## Ceph 架构

![Ceph 架构图](/images/ceph/figure-1.png)

上图是 Ceph 的架构图。Ceph 的核心是 RADOS（Reliable Autonomic Distributed Object Store，可靠自主的分布式对象存储）。RADOS 可以扩展到成千上万的 OSD（Object-based Storage Devices），提供自愈，自管理，基于副本的强一致对象存储。

librados 提供了操作 RADOS 里对象和对象集的事务接口。Ceph 提供了开箱即用的使用 librados 实现的三种服务：

- RADOS Gateway（RGW）
- RADOS Block Device（RBD）
- CephFS，实现 POSIX 语义的分布式文件系统
- 类似于 Amazon EBS 的虚拟块存储
- 与 Amazon S3 类似的对象存储

RADOS 里的对象存储于名为 Pool 的逻辑分区。Pool 可以通过副本或 EC 来提供冗余性。 在 Pool 中，对象在 PG（placement groups，放置组）间被分片。PG 根据副本因子（replication factor）被 CRUSH 算法（一种伪随机数据分配算法）映射到多个 OSD 中。客户端使用 CRUSH 来确定包含给定对象的 OSD，从而消除了对中心化元数据服务的需求。PG 和 CRUSH 在客户端和 OSD 之间形成了一个中间层，允许在 OSD 之间迁移对象以适应集群和 workload 的变化。

在 RADOS 集群的每个节点中，每个本地存储设备都有一个独立的 Ceph OSD daemon。每个 OSD 处理来自 librados 的 IO 请求，并且与其他 OSD 协作，以进行副本复制，更新 EC，迁移数据，recover 等操作。数据通过 OSD 内部的 ObjectStore 持久化到本地硬件上，ObjectStore 提供了对象和对象集的抽象，一组用于检查数据的原语，用于更新数据的事务。事务把对对象和对象集进行的一组基本操作组合为一个原子操作。每个 OSD 可以使用不同的 ObjectStore 实现。

## 在本地文件系统上构建存储后端很困难

### 快速的元数据操作

本地文件系统中元数据操作的低效率是分布式文件系统不断努力的根源。

FileStore 主要元数据挑战之一： 大型目录上缓慢的目录枚举 `readdir` 操作，并且返回的结果缺少顺序。

RADOS 中的对象根据其名称的哈希值映射到 PG，并按哈希顺序枚举。 枚举对于诸如清理，恢复或 librados 调用 list objects 时是必须的。

对于长名称的对象（如 RGW 经常如此），FileStore 可以使用 xattrs 来解决本地文件系统中文件名长度的限制，这可能需要使用 stat 调用来确定对象名称。

FileStore 遵循一种普遍采用的解决慢枚举问题的方法：创建具有 large fan-out 的目录层次结构，将对象分布在各个目录中，然后在读取后对选定目录的内容进行排序。

为了快速对它们进行排序并限制潜在的 stat 调用的开销，通过在目录中的条目数增加时拆分目录，将目录保持较小（几百个条目）。由于两个主要原因，这个过程在大规模时很昂贵。首先，一次处理数百万个inode 会降低目录项缓存（dentry cache）的效率，从而导致磁盘上有许多小 IO。其次，XFS 将子目录放置在不同的 allocation groups 中，以确保将来的目录条目有足够的空间放置在一起； 因此，随着对象数量的增加，目录内容会扩展，并且由于查找而导致拆分操作会花费更长的时间。所以，当所有 Ceph OSD 一起开始 splitting，性能会受到影响。 这是一个众所周知的问题，多年来一直影响着许多Ceph用户。

为了证明这种效果，我们配置了一个 16 节点的 Ceph 集群，其中大约有建议数量的 PG 的一半，增加每个 PG 的负载并加速拆分，并在 RADOS 层插入数百万个 4 KiB对象，队列深度为 128 。图 4 显示了拆分对全闪集群的 FileStore 的影响。

虽然第一个 splitting 在图表中不明显，但第二个 splitting 会导致急剧下降，在此期间，扫描具有数百万个条目的，具有很大深度的目录层次结构，甚至创建更深层次的结构。这会导致全固态硬盘上 7 分钟的吞吐量下降，而全 HDD 集群（未展出）上 120 分钟的吞吐量下降。

### 其他挑战

许多公共和私有云都依靠像 Ceph 这样的分布式存储系统来提供存储服务。如果没有对 IO stack 的完全控制，则分布式文件系统很难执行存储延迟 SLO（服务等级目标）。

基于文件系统的存储后端中高请求延迟的原因之一是 OS page cache。 为了改善用户体验，大多数操作系统都使用 write-back 来实现页面缓存。在该策略中，一旦将数据缓存在内存中并且将对应的页面标记为 ditry page，写操作就会完成。在 IO 活动很少的系统上，dirty page 会定期写回磁盘，以同步磁盘上和内存中的数据副本。 另一方面，在繁忙的系统上，回写行为由一组复杂的策略控制，这些策略可以在任意时间触发写操作。因此，尽管 write-back 为系统负载较轻的用户提供了很好的响应性，但使繁忙的存储后端实现稳定的延迟变得很复杂。 即使定期使用 fsync，FileStore 也无法限制滞后的 inode 元数据回写量，从而导致性能不一致。

基于文件系统的后端的另一个挑战是实现与 COW（例如快照）配合的操作。 如果备份文件系统支持 COW，则可以有效地实现这些操作。 但即使支持 COW，文件系统也可能有其他缺点，例如 FileStore on Btrfs 中的碎片问题。

## 基于本地文件系统的存储后端优劣势

### 优势

- 将数据持久化和数据块的分配等等复杂的问题委托给文件系统处理，降低了复杂度
- 提供了类 POSIX 接口和抽象
- 支持标准工具的使用（比如 `ls`，`find`）

### 劣势

#### **基于现有的文件系统难以实现高效的事务机制**

- 虽然已经有大量工作致力于向文件系统中引入事务的机制，但可能有如下缺点
  - 高开销
  - 功能上的局限性
  - 接口本身以及实现的复杂度

Ceph 采用了一种方式：利用文件系统有限的内部事务机制，在用户态实现 WAL，或者采用支持事务的 kv，但性能都差强人意

#### **本地文件系统的元数据性能严重影响系统的整体性能**

Ceph 需要面对的一个挑战是，如何快速地枚举文件夹中数百万项的内容，如何保证返回的结果有序。

基于 Btrfs 和 XFS 的后端存储往往都会有这样的问题，同时用于分配元数据负载的目录分割操作与系统策略其实是有一定冲突的，整个系统的性能会受到元数据性能的影响。

#### **新型存储器件的支持**

文件系统日趋成熟带来的影响就是，显得更加的保守和死板，不能较好地适配现在很多摒弃了块接口的新型存储器件。面向数据中心的新型存储器件往往都需要在原有应用程序接口层面做较大的修改。

诸如为了提升容量， HDD 正在向 SMR 过渡，同时支持 Zone Interface

为了减小 SSD 中由于 FTL 造成的 IO 尾延迟，引入了 Zoned Namespace SSD 技术，支持 Zone Interface；

云计算和云存储供应商也在调整他们的软件栈来适配 Zone 设备。分布式文件系统在这方面目前缺乏较好的支持。

## BlueStore 开发目标及其特性

### 开发目标

Ceph 团队重新设计了 BlueStore 以解决基于文件系统的存储后端遇到的问题。

BlueStore 的开发目标如下：

- 快速的元数据操作
- 对象写入没有一致性导致的额外开销
- 支持 COW
- 没有 journaling 导致的双写（double-writes）
- 针对 HDD 和 SSD 优化 IO pattern

BlueStore 在两年内实现了上述的所有目标，并成为了 Ceph 的默认存储后端。

与通用的 POSIX 文件系统需要十年时间才能成熟相比，BlueStore 能快速成熟是由两个因素导致的：

- BlueStore 实现了一个小而专的接口，而不是完整的 POSIX IO 接口
- BlueStore 在用户态运行，可以使用经过测试验证的高性能第三方 IO 库

由于 BlueStore 对 IO stack 的完整控制，一些额外的特性得以被实现。

### **特性**

- 使用 KV 存储元数据（如 bitmap），从而避免磁盘格式的变化，同时减小了实现的复杂度
- 通过精细的接口设计，优化克隆操作并减小范围引用计数的开销
- 引入自定义的 BlueFS 文件系统使 RocksDB 运行的更快。引入一个空间分配器，使得磁盘上每 1 TB 的数据只需要使用约 35 MB 的内存

### BlueStore 架构

![Ceph 架构图](/images/ceph/bluestore.png)

BlueStore 直接在裸盘上运行。BlueStore 内部的 space allocator 决定了新数据存放的位置，并使用 direct IO 异步落盘。BlueStore 内部的元数据和用户对象的元数据存储在 RocksDB 中，RocksDB 运行在 BlueFS 之上。BlueFS 是为 RocksDB 量身定制的用户态文件系统。BlueStore space allocator 和 BlueFS 定期通信以平衡空余空间。

## BlueFS 和 RocksDB

BlueStore 通过把元数据存于 RocksDB 实现了快速的元数据操作。而第二个目标，没有一致性带来的额外开销通过两个更改实现：

1. 数据直接写入磁盘，实现了一次 cache flush 就能进行数据写入
2. 修改 RocksDB，在一个环形缓冲区内重用 WAL 文件，实现了一次 cache flush 就能进行元数据写入。这个改动被主线 RocksDB upstream 并入

### BlueFS 实现

RocksDB 将自身对于文件系统的需求，提取为 Env 接口。BlueFS 在用户态实现了 Env 接口。而 RocksDB 需要的一些基础 syscall 也被 BlueFS 实现，比如 `open`，`mkdir` 和 `pwrite` 等。

BlueFS 基于 extent，并支持 journaling。BlueFS 为每个文件维护一个 inode，其中包括分配给文件的 extent 列表。

Superblock 以固定偏移量存储，其中包含 journal inode。Journal 具有所有文件系统元数据的唯一副本，这些元数据会在 mount 时被加载到内存。每个元数据操作（创建目录，创建文件，分配 extent）都会同时更新在内存和磁盘上的 journal。Journal 并不存储在固定的位置，journal extents 会与 file extents 交错。Journal 达到配置指定的尺寸时，会被 compact 并写入一个新的位置。这样的设计之所以能 work，是因为大文件和定期 compaction 会在任意时间点限制元数据容量。

### BlueFS 磁盘布局

![BlueFS 磁盘布局](/images/ceph/bluefs-disk-layout.png)

### 元数据的组织

BlueStore 会在 RocksDB 中保持多个 namespace，每个 namespace 都会存储不同类型的元数据。比如对象信息存储在 O namespace，block 分配元数据存储在 B namespace，集合元数据存储于 C namespace。每个集合映射到一个 PG，并表示一个 Pool namespace。

集合的名字包括 pool id 和一个在集合对象间共享的前缀。

比如，`C12.e4-6` 表示 pool 12 中的集合，这些对象的 hash value 以 `e4` 的 6 个有效位开头（`111001`）。因此对象 `O12.e532` （`111001 0100110010`）是该集合的成员，而 `O12.e832` （`111010 0000110010`）不是。

这样的元数据组织允许我们仅通过改变有效位的数量，就能把数百万个对象拆分为多个集合。例如，将增加新的 OSD 到集群以增加集群容量，或由于故障而从集群中移除 OSD 时，必须进行集合拆分操作才能在 OSD 间重新平衡数据。而在 FileStore 中，集合拆分通过重命名目录实现，具有昂贵开销。

### 数据链路和空间分配

BlueStore 支持 COW。对于一个大于最小分配尺寸（HDD 为 64 KiB，SSD 为 16 KiB）的写入请求，数据会被 写入到一个新分配的 extent。一旦数据被持久化，对应的元数据就被插入到 RocksDB。

这允许 BlueStore 提供高效的克隆操作。克隆的实现就可以简化为增加对应 extent 的引用计数，并将对应 extent 的写重定向到新的 extent。这避免了如下场景的双写 journal：

- 对象写入
- 进行大于最小分配尺寸时的部分覆写

对于一个小于最小分配尺寸的写入请求，首先将数据和元数据插入 RocksDB 作为 future IO 的承诺，然后在事务提交后进行异步落盘。这样的延迟写入机制有两个目的：

- 将小写入批量执行以提高效率。因为新数据的写入需要两个 IO，而插入到 RocksDB 只需要一个 IO
- 这是根据设备类型进行的优化。对于一个在大型对象上发生的 64 KiB 或者更小的 HDD 覆盖写，这样的异步执行可以避免在 read 过程中进行 seek，而就地覆写只会在小于 16 KiB 的 SSD 写入时发生。

#### 空间分配

BlueStore 使用两个模块分配空间：FreeList Manager 和 the Allocator。FreeList Manager 负责持久化地表示当前磁盘使用的部分，相应的数据存储于 RocksDB。

FreeList Manager 的第一个实现将使用中的区域表示为 `offset: length` 的形式，这么做的缺点在于事务必须进行序列化：old key 必须在 new key 插入前被删除，否则会导致 FreeList 的不一致。

第二种实现基于 bitmap，分配与释放操作可以使用 RocksDB 的 merge operator 来翻转 block 对应的位，消除对于事务序列化的需要。RocksDB 提供的 merge operator 执行一个延迟的原子 read-modify-write 操作，该操作不会更改语义，避免了点查询的开销。

The Allocator 负责为新数据分配空间。它在内存中维护一份 FreeList 的列表，并且在分配时通知 FreeList Manager。The Allocator 的第一版实现是基于 extent 的，将空闲 extent 基于二的次幂进行划分。随着磁盘使用率的上升，这种设计容易产生碎片。第二版实现使用了索引的层次结构，该结构位于每个 block 的 one bit 表示上，以跟踪块的整个区域。

通过分别查询 higher index 和 lower index，可以有效地找到 large extent 和 small extent。此实现的固定内存使用为：每 TB 容量占用 35 MiB。

#### 缓存

由于 BlueStore 在 userspace 中实现，使用 direct IO 直接访问磁盘，因为无法利用 OS page cache。因此 BlueStore 使用抗扫描 2Q 算法（the scan resistant 2Q algorithm）在 userspace 实现了 write-through cache。缓存被分片以实现并行，使用了与 OSD 相同的分片方案，将请求分成了跨多核的集合。这避免了 false sharing（伪共享），从而使得处理给定客户端请求的同一 CPU context 访问相应的 2Q 数据结构。

### BlueStore 带来的新特性

此前缺少这些特性的原因是高效的实现需要完整控制 IO stack。

### 节约空间的 checksum

Ceph 每天都会清理元数据，每周都会清理数据。虽然进行了清理，但如果副本间的数据不一致，也很难确定哪个是损坏的副本。因此 checksum 对于定期处理 PB 级别的分布式存储是必不可少的，几乎肯定会发生位翻转。

大多数本地文件系统不支持 checksum。但像 Btrfs 这样实现了 checksum 的文件系统，在 4 KiB 的级别上计算 checksum，使得覆写成为可能。对于 10 TiB 数据，存储所有 4 KiB block 的 32 bits checksum，会带来 10 GiB checksum 元数据，导致做快速校验时很难 cache checksum。

另一方面，存储在分布式文件系统上的数据大多数是只读的，所以可以以一个更大的粒度计算 checksum。BlueStore 会对每次写入计算 checksum，每次读取时校验 checksum。BlueStore 支持多种 checksum 算法，crc32c 被默认使用。原因是 crc32c 的实现在 x86 和 ARM 架构上得到了充分优化， 对于检测随机位错误来说足够高效。通过对 IO stack 的完全控制， BlueStore 可以根据 IO hint 来选择 checksum block size。比如来自兼容 S3 的 RGW 服务的写入，那么这些对象是只读的，可以在 block size=128 KiB 的情况下计算 checksum。如果 IO hint 表示需要压缩对象，那么可以在压缩后再计算 checksum，从而显著降低 checksum metadata 的总大小。

### EC 编码数据的覆写

Ceph 自 2004 年起，通过 FileStore 支持 EC pool。然而直到启用 BlueStore，EC pool 只支持对象的 append 和 delete，而覆写实在是过于缓慢，导致系统不稳定。因此，EC pool 的使用在 RGW 上被限制了，而在 RBD 和 CephFS 上只有 replicated pool 被使用。

为了避免 “RAID write hole” 问题，即多步数据更新可能导致系统进入不一致状态，Ceph 在 EC pool 上进行覆写使用了两阶段提交。首先，所有存储 EC pool 的 OSD 都会复制该 chunk，以便失败时进行回滚。在所有的 OSD 接收到新内容，并且覆写了相应 chunk，旧 chunk 的备份会被抛弃。在 FileStore on XFS 上，阶段 1 非常昂贵，每个 OSD 都需要真正地复制 chunk。而 BlueStore 支持 COW，避免了整个 chunk 的复制。

### 透明压缩

透明压缩对于横向扩展分布式文件系统来说至关重要，因为进行三副本会增加存储成本。BlueStore 实现了透明压缩，写入的数据在存储前会被自动压缩。为了获得更好的压缩效果，需要压缩所有的 128 KiB chunk，并且压缩在对象被整个写入时效果最好。对于部分覆写，BlueStore 将新数据放置于另一个独立的位置，并且更新元数据以指向新数据。当压缩后的对象由于多次部分覆写变得过于碎片化，BlueStore 会重新读取整个对象，压缩后进行重写。然而实际上，BlueStore 使用 hint 和简单的启发式方法，来压缩那些不太可能被多次覆写的对象。

### 新设备

尽管进行了多次尝试，但由于其向后不兼容的接口，本地文件系统仍然无法利用 SMR 盘的容量优势，并且不太可能实现高性能。但是支持这些 denser drives 对于分布式文件系统的横向扩展来说，非常重要，因为这降低了存储成本。

由于不受本地文件系统基于 block 的设计限制，BlueStore 可以自由探索新颖的接口和数据布局。比如：

- 最近移植了 RocksDB 和 BlueFS，使其在 host-managed SMR drives 上运行
- Ceph 社区在探索一个新的存储后端，结合了 pmem 和具有新接口的 NVMe SSD（ZNS SSD 和 KV SSD）

## 开发 BlueStore 的挑战

### 调整 Cache 大小和 writeback

操作系统会根据应用程序的内存使用情况动态增加或减小页面缓存的大小，从而充分利用机器内存。 OS 将 dirty page 写回后台磁盘，以免对前台 IO 产生不利影响，在应用程序需要时可以快速重用内存。

基于本地文件系统的存储后端会自动继承 OS 页面缓存的优势。而在 BlueStore 中，缓存大小是一个需要手动调整的配置项。

### KV 的效率

Ceph 团队的经验表明，将所有元数据转移到有序 kv（如 RocksDB）中，可以显着提高元数据操作的效率。当然使用 kv 也带来了问题：

- 在 OSD 中使用 NVMe SSD 时，RocksDB 的 compaction 和高写入放大是主要的性能限制来源
- 由于 RocksDB 被当做黑盒使用，因此需要序列化和复制数据，这会消耗 CPU 时间
- RocksDB 有自己的线程模型，限制了自定义 sharding 的能力

### CPU 和内存效率

现代编译器在内存中对齐和填充基本数据类型，以便CPU可以高效地获取数据，从而提高性能。 对于具有复杂结构体的应用程序，默认布局可能会浪费大量内存。很多应用程序正确地忽略这个问题，因为他们分配短暂存在的数据结构。

但一个绕过了 OS page cache 的存储后端，持续运行并控制着机器上几乎所有的内存，因此 Ceph team 花费了很多精力使得存储于 RocksDB 的数据结构变得紧凑，来降低元数据总大小，降低 compaction 开销。主要技巧是使用可变长差分编码（delta and variable-integer encoding）。

另一个观察到的结果是，使用高端 NVMe SSD 时，workload 越来越受到 CPU 的限制。对于下一代存储后端，Ceph 社区在探索降低 CPU 消耗的方式，比如最小化数据序列化和反序列化，并使用 [shared-nothing 的 SeaStar Framework](http://seastar.io/shared-nothing/) 来避免锁导致的上下文切换。

## 评价 BlueStore

本节比较 FileStore 和 BlueStore 的性能。测试包括：

- RADOS 对象写入吞吐量
- RBD 上随机写、顺序写和顺序读的端到端吞吐
- RBD device 上的 EC pool 随机写性能

测试集群包括 16 节点，使用 Cisco Nexus 3264-Q 64-port QSFP + 40GbE 交换机。

每节点配置：

- Intel Xeon E5-2698Bv3 ，16-core，2GHz
- 64 GiB RAM
- Intel P3600 NVMe SSD，400 GB
- Seagate ST4000NM0023 HDD，4TB，7200 RPM
- Mellanox MCX314A-BCCT 40GbE NIC
- Linux kernel 4.15 on Ubuntu 18.04
- Ceph v12.2.11，默认参数

<略>

## 结论

分布式文件系统开发和通常采用本地文件系统作为存储后端。 然后试图使通用文件系统抽象符合他们的需要，带来了意料之外的极大复杂度。这种俗成的约定核心在于，从头开发存储后端是一个艰巨的过程，类似于开发一个需要十年才能成熟的新文件系统。

但是根据 Ceph team 的经验，这种约定是不可靠的。此外我们发现从头开发的存储后端可以：

1. 降低了使用通用文件系统作为存储后端带来的性能损耗
2. 使用向后兼容的新型硬件成为可能
3. 从 IO stack 的完整控制中获得了新特性

我们希望这篇经验之谈能在存储从业者和研究员之间，就设计分布式文件系统及其存储后端的新方式展开讨论。

## 附录

### btrfs

#### Delay allocation

延迟分配技术能够减少磁盘碎片。在 Linux 内核中，为了提高效率，很多操作都会延迟。

在文件系统中，小块空间频繁的分配和释放会造成碎片。延迟分配是这样一种技术，当用户需要磁盘空间时，先将数据保存在内存中。并将磁盘分配需求发送给磁盘空间分配器，磁盘空间分配器并不立即分配真正的磁盘空间。只是记录下这个请求便返回。磁盘空间分配请求可能很频繁，所以在延迟分配的一段时间内，磁盘分配器可以收到很多的分配请求，一些请求也许可以合并，一些请求在这段延迟期间甚至可能被取消。通过这样的“等待”，往往能够减少不必要的分配，也有可能将多个小的分配请求合并为一个大的请求，从而提高 IO 效率。

#### Inline file

系统中往往存在大量的小文件，比如几百个字节或者更小。如果为其分配单独的数据 block，便会引起内部碎片，浪费磁盘空间。 btrfs 将小文件的内容保存在元数据中，不再额外分配存放文件数据的磁盘块。改善了内部碎片问题，也增加了文件的访问效率。
