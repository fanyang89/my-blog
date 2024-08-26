---
date: 2024-08-26
isOriginal: true
---

# 文件系统提供的 `rename` 操作是原子的吗？



## 参考链接

- [How can rename be atomic when disk sector writes are not?](https://superuser.com/questions/1674210/how-can-rename-be-atomic-when-disk-sector-writes-are-not)

  > When moving a file inside the same filesystem (rename), the system call is indeed atomic, but what is meant is that this is atomic with respect to the software environment.

- 
