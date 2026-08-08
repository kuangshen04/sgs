// ============================================================
// 三国杀最小原型 — 卡牌工具（targetFilter 辅助函数）
// ============================================================

import type { Player } from '../types.js';

/** 其他存活玩家 */
export function otherAlive(user: Player, all: Player[]): Player[] {
  return all.filter((p) => p !== user && p.alive);
}

/** 有手牌的其他存活角色（区域内先只看手牌） */
export function otherAliveWithCards(user: Player, all: Player[]): Player[] {
  return all.filter((p) => p !== user && p.alive && p.hand.length > 0);
}

/** 全体存活角色（含自己，桃园结义用） */
export function allAlive(user: Player, all: Player[]): Player[] {
  return all.filter((p) => p.alive);
}
