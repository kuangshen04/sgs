// ============================================================
// 事件系统 — 历史范围查询
//
// DFS 时间戳法（演进 2.2）：game.history 为 append-only 数组，
// 事件 id == 数组下标；严格栈纪律保证父事件的子树在数组中连续。
// 范围查询 = "从某个边界事件之后到现在" 的线性扫描——边界（回合/轮次/阶段/整局）
// 本身是事件，由调用方用 getParent 定位后作为 boundary 传入。
// 按类型索引/二分等性能手段等真实性能信号再上（演进 5.2）。
// ============================================================

import type { Game } from '../game.js';
import type { GameEvent } from './GameEvent.js';

/**
 * 在 (boundary.id, 当前] 的已入史事件里找第一个满足谓词的，无命中返回 null。
 *
 * - boundary 为 null 时从局首（id 0）开始扫——供"无边界上下文"（如直接调用
 *   某阶段的测试）作缺省：退化为整局范围。
 * - 扫描含数组尾端"进行中"的事件（endId 尚未定稿）；谓词如需排除未完成事件，
 *   自行加 `e.endId !== undefined` 过滤。
 * - 从旧到新返回第一个命中（范围查询甜点：无双/克己/奸雄等"范围内是否发生过 X"）。
 */
export function findEventSince(
  game: Game,
  boundary: GameEvent | null,
  predicate: (event: GameEvent<any>) => boolean,
): GameEvent<any> | null {
  const from = boundary ? boundary.id + 1 : 0;
  const history = game.history;
  for (let i = from; i < history.length; i++) {
    if (predicate(history[i])) return history[i];
  }
  return null;
}
