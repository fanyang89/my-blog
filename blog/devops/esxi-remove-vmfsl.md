---
date: 2024-08-24 16:50:00
category:
  - DevOps
tag:
  - ESXi
---

# ESXi 7.0 安装时移除 VMFSL

在 ESXi 7.0 之后，安装的时候会自动创建一个很大的 VMFSL 分区：

![分区图](/images/vmfsl-example.png)

安装 ESXi 时，在引导后按 `Shift+O`，并输入

```
autoPartitionOSDataSize=8192
```

然后回车，就好啦。
