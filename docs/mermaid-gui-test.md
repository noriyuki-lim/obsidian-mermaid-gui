---
date: 2026-06-25 15:29
tags:
  - mermaid
---
```mermaid
flowchart TD
  n1[開始]
  subgraph sg_1 [サブグラフ]
    direction LR
    n4[左]
    n5[中]
  end
  n4 --> n5
  n1 --> sg_1
```
