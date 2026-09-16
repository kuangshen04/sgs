// ============================================================
// 三国杀最小原型 — 卡牌工具（targetFilter 辅助函数）
// 规则层查询统一带 game（演进 9.5）：这些辅助函数也按 (game, user, allPlayers) 签名。
// ============================================================

import type { Game } from '../../game.js';
import type { Player } from '../../types.js';

/** 其他存活玩家 */
export function otherAlive(_game: Game, user: Player, all: Player[]): Player[] {
  return all.filter((p) => p !== user && p.alive);
}

/** 有手牌的其他存活角色（区域内先只看手牌） */
export function otherAliveWithCards(_game: Game, user: Player, all: Player[]): Player[] {
  return all.filter((p) => p !== user && p.alive && p.hand.cards.length > 0);
}

/** 全体存活角色（含自己，桃园结义用） */
export function allAlive(_game: Game, _user: Player, all: Player[]): Player[] {
  return all.filter((p) => p.alive);
}
