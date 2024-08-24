---
date: 2024-08-24
tag:
  - linux
  - io
  - test
---

# dm-delay 模拟慢速磁盘

## 速查

```bash
# 创建一个 10G 大小的 ram disk
sudo modprobe brd rd_nr=1 rd_size=1048576
sudo blockdev --getsize /dev/ram0

# 创建 delayed dm，延迟为 500ms
export RAM_SIZE=$(blockdev --getsize /dev/ram0)
echo "0 $RAM_SIZE delay /dev/ram0 0 500" | sudo dmsetup create delayed

# 重新加载参数
echo "0 $RAM_SIZE delay /dev/ram0 0 500" | sudo dmsetup reload delayed
```

## delayed 参数

```bash
<device> <offset> <delay> [<write_device> <write_offset> <write_delay> [<flush_device> <flush_offset> <flush_delay>]]
```

## 暂停 I/O

```bash
sudo dmsetup suspend /dev/dm-0
sudo dmsetup resume  /dev/dm-0
```

## 检查 delayed 设备的 I/O 延迟

```bash
fio --name a --filename=/dev/dm-0 --bs=4k --rw=randread --ioengine=libaio --direct=1 --iodepth=1 --numjobs=1 --time_based=1 --runtime=10
fio --name a --filename=/dev/dm-0 --bs=4k --rw=randread --ioengine=sync --direct=1 --iodepth=1 --numjobs=1 --time_based=1 --runtime=10
```
