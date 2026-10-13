# 进行中的模块重构决策

本目录记录粗模块不兼容重构期间已经讨论清楚、但尚未全部落地的目标决策，与
`docs/adr/0001–0011` 描述的旧实现现状分开。

这些文件采用 `Rxxx` 临时编号：

- 它们是本轮实现的约束，不是当前源码现状说明；
- 实现进度与剩余批次统一记在 `../../TODO.md`，不在各决策文件里藏待办；
- 重构完成后，逐篇核对实际落地结果，再合并、改号或拆分成正式 ADR；
- 若重构中推翻某项决定，保留原文并标注被哪篇 R 文档取代。

## 清单

| 编号 | 标题 | 状态 | 目标位置 |
|---|---|---|---|
| [R000](R000-重构总纲.md) | MVP 粗模块：外/里交互、联结模块与不兼容重构 | 边界已定，迁移待做 | 迁移期 `src/mvp/`；完成后 `src/` |
| [R001](R001-Event模块.md) | Event：Kind / HookPoint / scope / 历史 / 所有者执行权 | MVP 已落地 | `src/mvp/event/` |
| [R002](R002-Selection模块.md) | Selection：静态选择步骤、可回溯会话与 Controller | 已由 R003 取代，未落地 | — |
| [R003](R003-Selection模块-Frame与回溯边界.md) | Selection：Frame、answerKey、Plan 与 Controller | MVP 已落地 | `src/mvp/selection/` |
| [R004](R004-Player模块.md) | Player：nominal ID、最小身份与外置状态 | MVP 已落地 | `src/mvp/player/` |
| [R005](R005-Seating模块.md) | Seating：可变座次数组、1-based 座位号与逆时针快照 | MVP 已落地 | `src/mvp/seating/` |
| [R006](R006-Card模块.md) | Card：CardArea 位置、严格单牌原子移动与批量事件 | 边界已定，待实现 | `src/mvp/card/` |
