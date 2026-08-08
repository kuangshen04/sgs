// ============================================================
// 三国杀最小原型 — cardActions.ts 单元测试（牌移动原语）
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from './test-utils.js';

import {
  discardCards, drawCards, getCardArea, giveCards, moveCards, peekTop, playFromHand, reshuffle,
} from './cardActions.js';

import type { CardMoveEventData } from './events/index.js';
import { CardType } from './types.js';

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

  it('摸牌中途牌堆空 → 洗入弃牌堆继续摸', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    player.hand = [];
    g.state.deck = [makeUniqueCard(CardType.Sha)];       // 牌堆只剩 1 张
    g.state.discardPile = [makeUniqueCard(CardType.Tao), makeUniqueCard(CardType.Shan)];

    await drawCards(g, { target: player, count: 2 });

    expect(player.hand.length).toBe(2); // 第 1 张摸完，洗入弃牌堆再摸第 2 张
  });
});

describe('peekTop / reshuffle', () => {
  it('peekTop 查看牌堆顶且不移动', () => {
    const g = freshGame();
    const deck = g.state.deck;

    expect(peekTop(g, 2)).toEqual(deck.slice(-2));
    expect(g.state.deck).toEqual(deck); // 未改变
  });

  it('peekTop 不足 n 张返回全部', () => {
    const g = freshGame();
    g.state.deck = [makeUniqueCard(CardType.Sha)];

    expect(peekTop(g, 5)).toHaveLength(1);
  });

  it('reshuffle：弃牌堆全部洗入牌堆，产生一次 reshuffle 移动事件', async () => {
    const g = freshGame();
    const a = makeUniqueCard(CardType.Sha);
    const b = makeUniqueCard(CardType.Tao);
    g.state.deck = [];
    g.state.discardPile = [a, b];
    const captured = { reshuffled: false };
    g.triggerSystem.on('cardMove.after', async (event) => {
      if ((event.data as CardMoveEventData).reason === 'reshuffle') {
        captured.reshuffled = true;
      }
    });

    await reshuffle(g);

    expect(captured.reshuffled).toBe(true);
    expect(g.state.discardPile).toHaveLength(0);
    expect(g.state.deck).toHaveLength(2);
    expect(g.state.deck).toEqual(expect.arrayContaining([a, b]));
  });
});

// ============================================================
// playFromHand — 打出原语
// ============================================================

describe('playFromHand', () => {
  it('把牌从手牌移入弃牌堆', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha, CardType.Tao);
    const card = player.hand[0];

    await playFromHand(g, player, card);

    expect(player.hand.map((c) => c.type)).toEqual([CardType.Tao]);
    expect(g.state.discardPile).toContain(card);
  });

  it('牌不在手牌 → 不重复入弃牌堆', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Tao);
    const phantom = makeUniqueCard(CardType.Sha);

    await playFromHand(g, player, phantom);

    expect(g.state.discardPile).not.toContain(phantom);
  });
});

// ============================================================
// giveCards — 交给原语（手牌区 ↔ 手牌区）
// ============================================================

describe('giveCards', () => {
  it('把牌从 from 手牌移入 to 手牌', async () => {
    const g = freshGame();
    const from = g.state.players[0];
    const to = g.state.players[1];
    giveHand(from, CardType.Sha, CardType.Tao);
    const card = from.hand[0];

    await giveCards(g, from, to, [card]);

    expect(from.hand.map((c) => c.type)).toEqual([CardType.Tao]);
    expect(to.hand).toContain(card);
    expect(g.state.discardPile.length).toBe(0); // 不经过弃牌堆
  });

  it('牌不在 from 手牌 → 跳过，不入 to 手牌', async () => {
    const g = freshGame();
    const from = g.state.players[0];
    const to = g.state.players[1];
    giveHand(from, CardType.Tao);
    const phantom = makeUniqueCard(CardType.Sha);

    await giveCards(g, from, to, [phantom]);

    expect(from.hand.length).toBe(1);
    expect(to.hand.length).toBe(0);
  });
});

// ============================================================
// discardCards — 弃置原语（手牌 → 弃牌堆）
// ============================================================

describe('discardCards', () => {
  it('把一组牌从手牌移入弃牌堆', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha, CardType.Tao);
    const card = player.hand[0];

    await discardCards(g, player, [card]);

    expect(player.hand.map((c) => c.type)).toEqual([CardType.Tao]);
    expect(g.state.discardPile).toContain(card);
  });

  it('返回实际移除的牌，不在手牌的牌自动跳过', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha, CardType.Tao);
    const card = player.hand[0];
    const phantom = makeUniqueCard(CardType.Shan);

    const removed = await discardCards(g, player, [card, phantom]);

    expect(removed).toEqual([card]);
    expect(player.hand.length).toBe(1);
    expect(g.state.discardPile).not.toContain(phantom);
  });

  it('空数组 → 无操作', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);

    expect(await discardCards(g, player, [])).toEqual([]);
    expect(player.hand.length).toBe(1);
    expect(g.state.discardPile.length).toBe(0);
  });
});

// ============================================================
// moveCards — 统一移动原语（from 由引擎派生）
// ============================================================

describe('moveCards（统一移动）', () => {
  it('手牌 → 弃牌堆：移动并同步位置查询', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha, CardType.Tao);
    const card = player.hand[0];
    expect(getCardArea(g, card)).toEqual({ player, zone: 'hand' });

    const moved = await moveCards(g, {
      to: { zone: 'discardPile' }, cards: [card], reason: 'discard',
    });

    expect(moved).toEqual([card]);
    expect(player.hand.map((c) => c.id)).not.toContain(card.id);
    expect(g.state.discardPile).toContain(card);
    expect(getCardArea(g, card)).toEqual({ zone: 'discardPile' });
  });

  it('from 派生：不传来源，从装备区移入手牌', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const eq = makeUniqueCard(CardType.QiLinGong);
    player.equipment.weapon = eq;

    const moved = await moveCards(g, {
      to: { player, zone: 'hand' }, cards: [eq], reason: 'obtain',
    });

    expect(moved).toEqual([eq]);
    expect(player.equipment.weapon).toBeUndefined();
    expect(player.hand).toContain(eq);
    expect(getCardArea(g, eq)).toEqual({ player, zone: 'hand' });
  });

  it('一次移动支持多张牌来自不同区域', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const handCard = makeUniqueCard(CardType.Sha);
    const eqCard = makeUniqueCard(CardType.QiLinGong);
    player.hand = [handCard];
    player.equipment.weapon = eqCard;

    const moved = await moveCards(g, {
      to: { zone: 'discardPile' }, cards: [handCard, eqCard], reason: 'discard',
    });

    expect(moved).toEqual([handCard, eqCard]);
    expect(player.hand.length).toBe(0);
    expect(player.equipment.weapon).toBeUndefined();
    expect(g.state.discardPile).toEqual([handCard, eqCard]);
  });

  it('toPosition bottom：放入牌堆底', async () => {
    const g = freshGame();
    const bottom = makeUniqueCard(CardType.Tao);
    const card = makeUniqueCard(CardType.Sha);
    g.state.deck = [bottom, card]; // card 在牌堆顶

    await moveCards(g, {
      to: { zone: 'deck' }, cards: [card], reason: 'draw', toPosition: 'bottom',
    });

    expect(g.state.deck[0]).toBe(card);   // 底
    expect(g.state.deck[1]).toBe(bottom);
  });

  it('位置确认由调用方负责：牌已不在原区域则不移动', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const other = g.state.players[1];
    const card = makeUniqueCard(CardType.ShanDian);
    player.judgment = [card];
    // 模拟闪电把牌转移到下家判定区
    await moveCards(g, {
      to: { player: other, zone: 'judgment' },
      cards: [card],
      reason: 'transfer',
    });

    // 调用方先确认牌仍在自己判定区，再结算；不在则跳过（替代 from 约束）
    const area = getCardArea(g, card);
    const stillInJudgment = !!area && 'player' in area
      && area.player === player && area.zone === 'judgment';
    if (stillInJudgment) {
      await moveCards(g, {
        to: { zone: 'discardPile' },
        cards: [card],
        reason: 'resolve',
      });
    }

    expect(other.judgment).toContain(card); // 未被拖走
  });

  it('空数组：不发事件，返回空', async () => {
    const g = freshGame();
    let fired = false;
    g.triggerSystem.on('cardMove.before', async () => { fired = true; });

    const moved = await moveCards(g, {
      to: { player: g.state.players[0], zone: 'hand' }, cards: [], reason: 'draw',
    });

    expect(moved).toEqual([]);
    expect(fired).toBe(false);
  });

  it('牌不在任何位置 → 跳过，返回空', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const phantom = makeUniqueCard(CardType.Sha);

    const moved = await moveCards(g, {
      to: { player, zone: 'hand' }, cards: [phantom], reason: 'obtain',
    });

    expect(moved).toEqual([]);
    expect(player.hand.length).toBe(0);
  });

  it('before prevent → 移动取消，牌留在原处', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const card = makeUniqueCard(CardType.Sha);
    player.hand = [card];
    g.triggerSystem.on('cardMove.before', async (event) => { event.prevent(); });

    const moved = await moveCards(g, {
      to: { zone: 'discardPile' }, cards: [card], reason: 'discard',
    });

    expect(moved).toEqual([]);
    expect(player.hand).toContain(card);
    expect(g.state.discardPile.length).toBe(0);
  });

  it('事件数据：reason / fromAreas / to / mover 正确', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const card = makeUniqueCard(CardType.Sha);
    player.hand = [card];
    const captured = { data: null as CardMoveEventData | null };
    g.triggerSystem.on('cardMove.after', async (event) => {
      captured.data = event.data as CardMoveEventData;
    });

    await moveCards(g, {
      to: { zone: 'discardPile' }, cards: [card], reason: 'discard', mover: player,
    });

    expect(captured.data?.reason).toBe('discard');
    expect(captured.data?.cards).toEqual([card]);
    expect(captured.data?.fromAreas).toEqual([{ player, zone: 'hand' }]);
    expect(captured.data?.to).toEqual({ zone: 'discardPile' });
    expect(captured.data?.mover).toBe(player);
  });
});
