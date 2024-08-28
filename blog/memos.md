---
date: 2024-08-25
article: false
timeline: false
category:
  - 碎碎念
---

# 碎碎念

## Raft multi-DC

- [Arbiter (tie-breaker) DC](https://github.com/scylladb/scylladb/issues/15360)
- [add support for zero-token nodes](https://github.com/scylladb/scylladb/pull/19684)

## `git-lfs` 使用

Install `git-lfs`:

```bash
git lfs install  # per-use install
```

Commit large file:

```bash
git lfs track "*.iso"
git add .gitattributes
git add file.iso
git commit -m "Add disk image"
git push
```

## `git` 查询 commit 包含指定关键字

```bash
git log -S '<your-query-keyword>' --format='%h %s' --source --all
```

## `kopia` 迁移快照

```bash
kopia snapshot migrate --source-config ./repository.config --all
```

## `kopia` 配置文件位置

By default, the configuration file is located in your home directory under:
- `%APPDATA%\kopia\repository.config` on Windows
- `$HOME/Library/Application Support/kopia/repository.config` on macOS
- `$HOME/.config/kopia/repository.config` on Linux

## `Meilisearch` 支持 large payload

```bash
# cat meilisearch.conf
MEILI_ENV=development
MEILI_HTTP_ADDR=0.0.0.0:7700
MEILI_NO_ANALYTICS=no
MEILI_HTTP_PAYLOAD_SIZE_LIMIT=1Gb
```

## 使用 `nftables` 模拟丢包

```bash
# drop packet where dport == 3888
sudo nft create table ip filter
sudo nft add chain ip filter input { type filter hook input priority 0 \; }
sudo nft add rule ip filter input tcp dport 3888 counter drop

# restore
sudo nft list chain ip filter input
sudo nft delete rule ip filter input handle n
```

## 运行 `node-exporter`

```yaml
# docker-compose.yaml
version: '3.8'
services:
  node_exporter:
    image: quay.io/prometheus/node-exporter:latest
    container_name: node-exporter
    command:
      - '--path.rootfs=/host'
    network_mode: host
    pid: host
    restart: unless-stopped
    volumes:
      - '/:/host:ro,rslave'
```

## 配置 npm registry

```bash
npm set registry https://registry.npmmirror.com # 注册模块镜像
npm set disturl https://npmmirror.com/mirrors/node # node-gyp 编译依赖的 node 源码镜像

# optional
npm set sass_binary_site https://registry.npmmirror.com/mirrors/node-sass # node-sass 二进制包镜像
npm set electron_mirror https://registry.npmmirror.com/mirrors/electron/ # electron 二进制包镜像
npm set puppeteer_download_host https://registry.npmmirror.com/mirrors # puppeteer 二进制包镜像
npm set chromedriver_cdnurl https://registry.npmmirror.com/mirrors/chromedriver # chromedriver 二进制包镜像
npm set operadriver_cdnurl https://registry.npmmirror.com/mirrors/operadriver # operadriver 二进制包镜像
npm set phantomjs_cdnurl https://registry.npmmirror.com/mirrors/phantomjs # phantomjs 二进制包镜像
npm set selenium_cdnurl https://registry.npmmirror.com/mirrors/selenium # selenium 二进制包镜像
npm set node_inspector_cdnurl https://registry.npmmirror.com/mirrors/node-inspector # node-inspector 二进制包镜像
npm set sentrycli_cdnurl https://registry.npmmirror.com/mirrors/sentry-cli # sentry-cli
```

## 二分查找 MTU

```bash
ping -M do -s 1472 -c 1 <ip>
```

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
