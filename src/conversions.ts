// ============================================================
// 转化牌规则 — 查询面（注册请用 effects.ts 的 defineSkill/registerBareEffect）
//
// 转化效果自己托管"选源牌 → 派生 UsedCard → 选目标"的选择计划；
// playChoices 只负责把它作为 action 候选接入。
// ============================================================

import type { Player } from './types.js';
import { conversionEffects, effectOwnedBy } from './effects.js';
import type { ConversionEffect } from './effects.js';

/** 收集玩家拥有的转化效果（武将技能 + 装备武器，如武圣/龙胆/奇袭/丈八蛇矛） */
export function collectConversionEffects(player: Player): ConversionEffect[] {
  return conversionEffects().filter((e) => effectOwnedBy(e, player));
}

export type { ConversionEffect } from './effects.js';
