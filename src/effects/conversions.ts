// ============================================================
// 转化牌规则 — 查询面（注册在容器的规则集里：`container.skills.register`）
//
// 转化效果自己托管"选源牌 → 派生 UsedCard → 选目标"的选择计划；
// playChoices 只负责把它作为 action 候选接入。
// ============================================================

import type { Game } from '../game.js';
import type { Player } from '../types.js';
import { effectOwnedBy } from './effects.js';
import type { ConversionEffect } from './effects.js';

/** 收集玩家拥有的转化效果（武将技能 + 装备武器，如武圣/龙胆/奇袭/丈八蛇矛） */
export function collectConversionEffects(game: Game, player: Player): ConversionEffect[] {
  return game.ruleSet.skills.conversions().filter((e) => effectOwnedBy(game, e, player));
}

export type { ConversionEffect } from './effects.js';
