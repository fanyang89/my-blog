---
date: 2024-08-25
article: false
timeline: false
category:
  - 碎碎念
---

# 碎碎念

## 如何打印 Java GC log

```bash
java -jar ./gclog-1.0-SNAPSHOT.jar \
-XX:+UseGCLogFileRotation -XX:NumberOfGCLogFiles=5 -XX:GCLogFileSize=10K \
-XX:+PrintGCDetails -XX:+PrintGCDateStamps -Xloggc:/tmp/gc-%t.log \
-XX:+UseG1GC -XX:MaxGCPauseMillis=200
```

## 顺序一致性 vs 线性一致性

Zab 保证的是顺序一致性语义，Raft 保证的则是线性一致性语义。尽管他们都可以算强一致性，但顺序一致性并无时间维度的约束，所以可能并不满足现实世界的时序。也就是说，在现实世界中，顺序一致性是可能返回旧数据的。

对于一个分布式协调服务，可能返回旧数据实际上是比较坑爹的一件事，尽管 ZooKeeper 保证了单客户端 FIFO 的顺序，但有些场景还是有一些受限的。因此在这一点上，我认为 etcd 保证的线性一致性是更好的，ZooKeeper 的顺序一致性有时候会有坑，这一点 PingCAP 的 CTO 也在知乎的”分布式之美”圆桌会谈上吐槽过。

[Zookeeper 论文阅读](https://tanxinyu.work/zookeeper-thesis/)

## ZooKeeper 是否能够保证线性一致性？
很多人可能会觉得既然 ZooKeeper 支持线性一致性写，那么也可以通过 sync + read 来支持线性一致性读，理论上这样是可以支持线性一致性读的，但在 ZooKeeper 真正的实现中是不能严格满足线性一致性的，具体可以参照 Jepsen 中的讨论。不能严格满足线性一致性的根据原因就是 ZooKeeper 在实现过程中并没有将 sync 当做一个空写日志去执行，而是直接让 leader 返回一个 zxid 给 follower，然而此时的 leader 并没有像 raft 那样通过 read index 发起一轮心跳或 lease read 的方式来确保自己一定是 leader，从而可能在网络分区脑裂的 corner case 下返回旧数据，因此无法在严格意义上满足线性一致性。
当然，这种 corner case 在实际中很少见，而且也应该可以修复，所以从技术上来讲，ZooKeeper 应该是可以用 sync + read 来支持线性一致性读的。

[Zookeeper 论文阅读](https://tanxinyu.work/zookeeper-thesis/)

## Nginx 报告 http 499

在未明确指定的情况下其超时时间均默认为 60s。简单来说只有在 upstream 处理请求耗时超过 60s 的情况下 Nginx 才能判定其 Gateway Timeout 并按照 504 处理。

然而客户端设置的 HTTP 请求超时时间其实只有 15s：这其中还包括外网数据传输的时间。

于是问题来了：每一个服务端处理耗时超过 15s 的请求，nginx 由于还没达到 60s 的超时阈值不会判定 504 ，而客户端则会由于超过本地的 15s 超时时间直接断开连接，nginx 于是就会记录为 499。

## 移除所有的 `ZooKeeperServer not running` 日志

```bash
fd 'zookeeper.log.*' -x sd '[^\n]*ZooKeeperServer not running\n' '' {}
```
