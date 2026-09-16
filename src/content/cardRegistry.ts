// ============================================================
// 三国杀最小原型 — 卡牌定义、注册表与牌堆
// ============================================================

import { Card, CardTag, CardType, Player, colorOfSuit } from '../types.js';
import type { UsedCard } from '../types.js';
import type { UsedCardInstance } from '../position/usedCards.js';
import type { Game } from '../game.js';
import type { GameEvent, UseCardEventData } from '../events/index.js';

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
  /**
   * 延时锦囊在判定阶段的结算效果（收到判定结果与该延时牌的 UC；可自行**迁移 UC**，如闪电移给下家）。
   * `judgeCard === null` = 本次被抵消（无判定牌、未执行效果）：延时牌仍在此决定收尾去向
   * （闪电按规则集依然流向合法下家；不处理则收尾进弃牌堆）。
   * 读规则读 UC（演进 3.5）：类型/名称/花色取 UC 自身的规则身份。
   */
  delayContent?: (game: Game, target: Player, judgeCard: Card | null, uc: UsedCardInstance) => Promise<void>;
  /** 攻击范围（装备牌中的武器） */
  range?: number;
  /** 卡牌标签（基本牌/锦囊牌等） */
  tags: CardTag[];
  /** 规则层面：出牌阶段是否合法可用（规则层查询统一带 game：读规则读 UC，演进 9.5） */
  canUse: (game: Game, player: Player, allPlayers: Player[], shaUsed: boolean) => boolean;
  /** 此牌可选择的合法目标列表（规则层面） */
  targetFilter: (game: Game, user: Player, allPlayers: Player[]) => Player[];
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

/**
 * 效果牌身份的显示文本（花色 + 点数）；无花色/无点数时对应部分留空。
 * 虚拟牌可能既无花色也无点数（无牌/多牌转化），避免打印成 "nullnull"。
 */
export function cardFaceText(card: { suit?: string | null; number?: number | null }): string {
  if (card.suit == null && card.number == null) return '';
  const num = card.number == null ? '' : displayNumber(card.number);
  return `${card.suit ?? ''}${num}`;
}

/** 把物理牌包装成 UsedCard（非转化牌：physicalCards = [card]，身份按实体牌推导）；已是 UsedCard 则原样返回 */
export function asUsedCard(card: Card | UsedCard): UsedCard {
  if ('physicalCards' in card) return card;
  return {
    type: card.type,
    name: card.name,
    suit: card.suit,
    number: card.number,
    color: colorOfSuit(card.suit),
    physicalCards: [card],
  };
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
