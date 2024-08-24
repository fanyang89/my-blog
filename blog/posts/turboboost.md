---
date: 2024-08-25
category:
  - hardware
  - hdd
---

# Seagate TurboBoost and Advanced Write Caching

传统的 HDD 以较慢的响应时间来应对较高的工作负载

- 在 200 IOPS 时，硬盘阵列可能提供 5 毫秒的响应
- 在 600 IOPS 时，延迟可能飙升至 40 毫秒甚至更高。

## TurboBoost

TurboBoost 是在传统硬盘中加入 NAND 闪存，集成了

- 传统的多段式缓存
- 少量的 eMLC NAND，其特点是比消费级 MLC 的耐用性要强得多

适量的 NAND 能够满足价值需求，以足够低的成本提供最大的性能优势
 
![](/images/seagate/76d4e14c25b23afca9840d8ce905fbd3.png)

## NVC：non-volatile cache

Back electromotive force（back EMF）指与电机线圈在磁场中运动产生的电流方向相反的电压。HDD 可以在断电后立即利用反电动势，将 DRAM 中的数据写入 NVC Flash 中。有了 NVC 保护的写缓存，在享受到性能好处的同时，仍然可以与关闭 write cache 同等的保护。

内置的 NOR Flash 大小：2M

![](/images/seagate/5b267ab31853330f53d9e3be9dab501f.png)
