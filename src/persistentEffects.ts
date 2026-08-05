// ============================================================
// 三国杀最小原型 — 常驻效果（基础设施）
// 常驻效果 = 规则决策点对玩家效果数值的查询（多来源叠加求和）。
// 来源：技能（咆哮/马术）或装备（诸葛连弩/马匹），在各武将/卡牌文件中注册。
// 临时效果（如裸衣的回合内 buff）不并入此注册表，走手动 trigger 注册/注销。
// ============================================================

import type { Player } from './types.js';

export interface PersistentEffect {
  /** 效果种类（决策点按 kind 求和/查询） */
  kind: string;
  /** 该来源对此效果的贡献值（同 kind 多来源叠加） */
  value: (player: Player) => number;
}

const _effects: PersistentEffect[] = [];

export const effectRegistry = {
  register(effect: PersistentEffect): void {
    _effects.push(effect);
  },
  /** 玩家在某类效果上的总修正值（多来源叠加求和） */
  sum(player: Player, kind: string): number {
    let total = 0;
    for (const e of _effects) {
      if (e.kind === kind) total += e.value(player);
    }
    return total;
  },
  /** 是否拥有某类效果（sum > 0 即视为拥有） */
  has(player: Player, kind: string): boolean {
    return effectRegistry.sum(player, kind) > 0;
  },
};
