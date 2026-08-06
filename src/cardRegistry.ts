// ============================================================
// 三国杀最小原型 — 卡牌定义、注册表与牌堆
// ============================================================

import { Card, CardTag, CardType, Player } from './types.js';
import type { Game } from './game.js';
import type { GameEvent, UseCardEventData } from './events/index.js';

// ============================================================
// 卡牌定义接口 & 注册表
// ============================================================

/** 卡牌效果函数 */
export type CardContentFn = (
  game: Game,
  data: UseCardEventData,
  event: GameEvent<UseCardEventData>,
) => Promise<void>;

/** 一张牌的完整定义（由 cards.ts 注册） */
export interface CardDef {
  type: CardType;
  name: string;
  emoji: string;
  content: CardContentFn;
  /** 延时锦囊在判定阶段的结算效果（收到判定结果与延时牌本身；可自行移动延时牌，如闪电移给下家） */
  delayContent?: (game: Game, target: Player, judgeCard: Card, card: Card) => Promise<void>;
  /** 攻击范围（装备牌中的武器） */
  range?: number;
  /** 装备触发效果（麒麟弓/寒冰剑等：装备在对应栏位时对事件响应） */
  equipTrigger?: {
    trigger: string;
    canTrigger?: (game: Game, event: GameEvent<any>, owner: Player) => boolean;
    content: (game: Game, event: GameEvent<any>, owner: Player) => Promise<void>;
  };
  /** 卡牌标签（基本牌/锦囊牌等） */
  tags: CardTag[];
  /** 规则层面：出牌阶段是否合法可用 */
  canUse: (player: Player, allPlayers: Player[], shaUsed: boolean) => boolean;
  /** 此牌可选择的合法目标列表（规则层面） */
  targetFilter: (user: Player, allPlayers: Player[]) => Player[];
  /** 目标数量约束（规则层面）：固定数 或 'all' 表示合法目标全部 */
  targetCount: number | 'all';
  ai: {
    /** AI 层面：当前是否应该使用（策略；规则合法 ≠ 现在应该用） */
    shouldUse: (player: Player, shaUsed: boolean) => boolean;
    usePriority: number;     // AI 使用优先级（越大越优先）
    discardPriority: number; // 弃牌优先级（越小越先弃）
  };
}

// --- 注册表 ---

const _defs = new Map<CardType, CardDef>();

export const cardRegistry = {
  register(def: CardDef): void {
    _defs.set(def.type, def);
  },
  get(type: CardType): CardDef | undefined {
    return _defs.get(type);
  },
  /** 遍历所有已注册的 CardDef */
  all(): IterableIterator<CardDef> {
    return _defs.values();
  },
};

// --- 从注册表派生的工具函数 ---

/** 卡牌类型 → emoji */
export function cardEmoji(type: CardType): string {
  return cardRegistry.get(type)?.emoji ?? '❓';
}

/** 卡牌点数 → 显示字符 */
export function displayNumber(n: number): string {
  switch (n) {
    case 1:  return 'A';
    case 11: return 'J';
    case 12: return 'Q';
    case 13: return 'K';
    default: return String(n);
  }
}

/** Fisher-Yates 洗牌 */
export function shuffle<T>(deck: T[]): T[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
