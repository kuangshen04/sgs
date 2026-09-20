// ============================================================
// 牌面（身份与显示）— 叶子层助手：position / flow / decision / content 共用
//
// 这些助手原先住在 `content/cardRegistry.ts`，于是"引擎 import content"里
// 大部分其实是这一类**引擎件**。搬到叶子层后，引擎侧对 `content/` 的引用只剩
// 真正的规则依赖（现为 0：内容只通过规则集进入）。
// ============================================================

import { colorOfSuit } from '../types.js';
import type { Card, CardType, UsedCard } from '../types.js';
import type { Game } from '../game.js';

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

/** 卡牌类型 → emoji（读本局规则集：未注册 → ❓） */
export function cardEmoji(game: Game, type: CardType): string {
  return game.ruleSet.cards.get(type)?.emoji ?? '❓';
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
