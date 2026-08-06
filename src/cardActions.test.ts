// ============================================================
// 三国杀最小原型 — cardActions.ts 单元测试（牌移动原语）
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from './test-utils.js';

import { discardCards, drawCards, giveCards, moveCards, playFromHand } from './cardActions.js';

import { CardType } from './types.js';
import type { Card } from './types.js';

describe('drawCards', () => {
  it('摸 2 张牌', async () => {
    const g = freshGame();
    const target = g.state.players[0];
    const before = target.hand.length;
    await drawCards(g, { target, count: 2 });
    expect(target.hand.length).toBe(before + 2);
  });

  it('牌堆空时自动洗入弃牌堆', async () => {
    const g = freshGame();
    // 把牌堆移到弃牌堆
    g.state.discardPile.push(...g.state.deck.splice(0));
    const target = g.state.players[0];
    await drawCards(g, { target, count: 1 });
    expect(target.hand.length).toBe(1);
    // 弃牌堆被洗回牌堆，牌堆数 = 原弃牌堆 - 1
    expect(g.state.deck.length).toBeGreaterThan(0);
  });
});

// ============================================================
// playFromHand — 打出原语
// ============================================================

describe('playFromHand', () => {
  it('把牌从手牌移入弃牌堆', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha, CardType.Tao);
    const card = player.hand[0];

    playFromHand(g, player, card);

    expect(player.hand.map((c) => c.type)).toEqual([CardType.Tao]);
    expect(g.state.discardPile).toContain(card);
  });

  it('牌不在手牌 → 不重复入弃牌堆', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Tao);
    const phantom = makeUniqueCard(CardType.Sha);

    playFromHand(g, player, phantom);

    expect(g.state.discardPile).not.toContain(phantom);
  });
});

// ============================================================
// giveCards — 交给原语（手牌区 ↔ 手牌区）
// ============================================================

describe('giveCards', () => {
  it('把牌从 from 手牌移入 to 手牌', () => {
    const g = freshGame();
    const from = g.state.players[0];
    const to = g.state.players[1];
    giveHand(from, CardType.Sha, CardType.Tao);
    const card = from.hand[0];

    giveCards(from, to, [card]);

    expect(from.hand.map((c) => c.type)).toEqual([CardType.Tao]);
    expect(to.hand).toContain(card);
    expect(g.state.discardPile.length).toBe(0); // 不经过弃牌堆
  });

  it('牌不在 from 手牌 → 跳过，不入 to 手牌', () => {
    const g = freshGame();
    const from = g.state.players[0];
    const to = g.state.players[1];
    giveHand(from, CardType.Tao);
    const phantom = makeUniqueCard(CardType.Sha);

    giveCards(from, to, [phantom]);

    expect(from.hand.length).toBe(1);
    expect(to.hand.length).toBe(0);
  });
});

// ============================================================
// discardCards — 弃置原语（手牌 → 弃牌堆）
// ============================================================

describe('discardCards', () => {
  it('把一组牌从手牌移入弃牌堆', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha, CardType.Tao);
    const card = player.hand[0];

    discardCards(g, player, [card]);

    expect(player.hand.map((c) => c.type)).toEqual([CardType.Tao]);
    expect(g.state.discardPile).toContain(card);
  });

  it('返回实际移除的牌，不在手牌的牌自动跳过', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha, CardType.Tao);
    const card = player.hand[0];
    const phantom = makeUniqueCard(CardType.Shan);

    const removed = discardCards(g, player, [card, phantom]);

    expect(removed).toEqual([card]);
    expect(player.hand.length).toBe(1);
    expect(g.state.discardPile).not.toContain(phantom);
  });

  it('空数组 → 无操作', () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);

    expect(discardCards(g, player, [])).toEqual([]);
    expect(player.hand.length).toBe(1);
    expect(g.state.discardPile.length).toBe(0);
  });
});

// ============================================================
// moveCards — 底层移动原语（纯数组级）
// ============================================================

describe('moveCards', () => {
  it('把 cards 中实际位于 from 的牌移到 to，返回实际移走的牌', () => {
    const g = freshGame();
    const from = g.state.players[0];
    const to: Card[] = [];
    giveHand(from, CardType.Sha, CardType.Tao);
    const card = from.hand[0];

    const moved = moveCards(from.hand, to, [card]);

    expect(moved).toEqual([card]);
    expect(from.hand.length).toBe(1);
    expect(to).toEqual([card]);
  });

  it('不在 from 中的牌自动跳过', () => {
    const from: Card[] = [makeUniqueCard(CardType.Sha)];
    const to: Card[] = [];
    const phantom = makeUniqueCard(CardType.Tao);

    const moved = moveCards(from, to, [phantom]);

    expect(moved).toEqual([]);
    expect(from.length).toBe(1);
    expect(to.length).toBe(0);
  });

  it('多张牌保持原顺序', () => {
    const a = makeUniqueCard(CardType.Sha);
    const b = makeUniqueCard(CardType.Tao);
    const from = [a, b];
    const to: Card[] = [];

    const moved = moveCards(from, to, [a, b]);

    expect(moved).toEqual([a, b]);
    expect(to).toEqual([a, b]);
  });
});
