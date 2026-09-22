// ============================================================
// 牌面显示 —— **临时住处**
//
// 三个助手只做"把规则数据渲染成文本/emoji"，属于**前端/显示关注点**，却被
// `position`（判定日志）、`flow`（流程日志）、`content`（卡牌日志）各层直接调用；
// 其中 `cardEmoji` 还要读 `game.ruleSet`（未注册 → ❓）。
//
// 想与 `flow/display.ts` 归到一起，但 `position/cardActions.ts` 也用它们 →
// 会形成 `position → flow` 的反向依赖。这说明**前端需要一个明确的渲染接口**
// （引擎产出结构化数据、前端渲染，而不是各层直接打印）：见 `docs/TODO.md`
// 的"前端/显示接口"讨论项。在此之前先留在 `rules/` 这个临时目录里。
//
// （`asUsedCard` 已归位到 `position/usedCards.ts`，与 `deriveCardFace` 同处。）
// ============================================================

import type { CardType } from '../types.js';
import type { Game } from '../game.js';

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
