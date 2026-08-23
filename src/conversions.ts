// ============================================================
// 三国杀最小原型 — 转化牌规则
// 转化牌技能自己托管“选源牌 → 派生 UsedCard → 选目标”的选择计划；
// playChoices 只负责把它作为 action 候选接入。
// ============================================================

import type { Game } from './game.js';
import { CardType } from './types.js';
import type { Player, UsedCard } from './types.js';
import type { SelectionAnswers, SelectionPlan } from './selection.js';

export interface ConversionDef {
  name: string;
  toType: CardType;
  /** 规则：有符合条件源牌 && 效果牌规则合法（如杀的次数/范围） */
  canUse: (game: Game, player: Player, shaUsed: boolean) => boolean;
  /** 完整选择计划：源牌步 + 目标步（内部按源牌派生 UsedCard） */
  selectionPlan: (game: Game, player: Player) => SelectionPlan;
  /** 确认后将答案解码为可直接交给 useCard 的虚拟牌与目标 */
  resolve: (answers: SelectionAnswers) => { card: UsedCard; targets: Player[] };
  ai: {
    shouldUse: (game: Game, player: Player, shaUsed: boolean) => boolean;
    usePriority: number;
  };
}

const _defs = new Map<string, ConversionDef>();

/** 装备在对应栏位时提供的转化规则 */
const WEAPON_CONVERSIONS: Partial<Record<CardType, string>> = {
  [CardType.ZhangBaSheMao]: '丈八蛇矛',
};

export const conversionRegistry = {
  register(def: ConversionDef): void {
    _defs.set(def.name, def);
  },
  get(name: string): ConversionDef | undefined {
    return _defs.get(name);
  },
  all(): IterableIterator<ConversionDef> {
    return _defs.values();
  },
};

/** 收集玩家拥有的转化规则（武将技能 + 装备武器） */
export function collectConversions(player: Player): ConversionDef[] {
  const defs: ConversionDef[] = [];
  for (const skill of player.hero.skills ?? []) {
    const def = conversionRegistry.get(skill);
    if (def) defs.push(def);
  }
  const weapon = player.equipment.weapon;
  if (weapon) {
    const name = WEAPON_CONVERSIONS[weapon.type];
    const def = name ? conversionRegistry.get(name) : undefined;
    if (def && !defs.includes(def)) defs.push(def);
  }
  return defs;
}
