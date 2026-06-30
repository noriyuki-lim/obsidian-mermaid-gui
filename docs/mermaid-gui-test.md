---
date: 2026-06-25 15:29
tags:
  - mermaid
---
```mermaid
flowchart TD
  n3{n3}
  subgraph sg_1 [sg_1]
    direction LR
    n2[n2]
    n6[n6]
  end
  n1 --> sg_1
  sg_1 --> n3
  n3 --> n5
  n3 --> n4
  n2 --> n6
```
