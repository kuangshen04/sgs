// ============================================================
// 常驻效果 — 查询面（注册在容器的规则集里：`container.skills.registerBareEffect`）
//
// 常驻效果 = 规则决策点对玩家效果数值的查询（多来源叠加求和）。
// 来源：技能（咆哮/马术/空城…）或装备（诸葛连弩/马匹），归属判定由 effects.ts 统一做。
// 归属要读 UC（装备失效/进出即时生效），故查询统一带 game（adr/0003）。
// 临时效果（如裸衣的回合内 buff）不并入规则集，仍走手动 trigger 注册/注销。
// ============================================================

import type { Game } from '../game.js';
import type { Player } from '../types.js';
import { effectOwnedBy } from './effects.js';

export const effectRegistry = {
  /** 玩家在某类效果上的总修正值（多来源叠加求和；只计归属成立的效果） */
  sum(game: Game, player: Player, key: string): number {
    let total = 0;
    for (const e of game.ruleSet.skills.persistentOf(key)) {
      if (effectOwnedBy(game, e, player)) total += e.value(player);
    }
    return total;
  },
  /** 是否拥有某类效果（sum > 0 即视为拥有） */
  has(game: Game, player: Player, key: string): boolean {
    return effectRegistry.sum(game, player, key) > 0;
  },
};
