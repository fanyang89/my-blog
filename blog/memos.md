---
date: 2024-08-25
article: false
timeline: false
category:
  - 碎碎念
---

# 碎碎念

## Nginx 报告 http 499

在未明确指定的情况下其超时时间均默认为 60s。简单来说只有在 upstream 处理请求耗时超过 60s 的情况下 Nginx 才能判定其 Gateway Timeout 并按照 504 处理。

然而客户端设置的 HTTP 请求超时时间其实只有 15s：这其中还包括外网数据传输的时间。

于是问题来了：每一个服务端处理耗时超过 15s 的请求，nginx 由于还没达到 60s 的超时阈值不会判定 504 ，而客户端则会由于超过本地的 15s 超时时间直接断开连接，nginx 于是就会记录为 499。

## 移除所有的 `ZooKeeperServer not running` 日志

```bash
fd 'zookeeper.log.*' -x sd '[^\n]*ZooKeeperServer not running\n' '' {}
```
