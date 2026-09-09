// ============================================================
// 三国杀最小原型 — cardActions.ts 单元测试（牌移动原语）
// 阶段 2：区域为受控容器 CardArea（cards 只读视图/容器方法写），索引随容器同步。
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard, equipAt } from './test-utils.js';

import {
  discardCards, drawCards, getCardArea, giveCards, moveCards, peekTop, playFromHand, reshuffle,
  takeTop, takeBottom, putTop, putBottom, findInDeck, findInDeckAndDiscard,
} from './cardActions.js';

import type { CardMoveEventData } from './events/index.js';
import { CardType } from './types.js';

describe('drawCards', () => {
  it('摸 2 张牌', async () => {
    const g = freshGame();
    const target = g.state.players[0];
    const before = target.hand.cards.length;
    await drawCards(g, { target, count: 2 });
    expect(target.hand.cards.length).toBe(before + 2);
  });

  it('牌堆空时自动洗入弃牌堆', async () => {
    const g = freshGame();
    // 把牌堆移到弃牌堆（容器收口；测试置场）
    const all = [...g.state.deck.cards];
    g.state.deck.clear();
    g.state.discardPile.addAll(all);
    const target = g.state.players[0];
    await drawCards(g, { target, count: 1 });
    expect(target.hand.cards.length).toBe(1);
    // 弃牌堆被洗回牌堆，牌堆数 > 0
    expect(g.state.deck.cards.length).toBeGreaterThan(0);
  });

  it('摸牌中途牌堆空 → 洗入弃牌堆继续摸', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    player.hand.clear();
    g.state.deck.replaceAll([makeUniqueCard(CardType.Sha)]); // 牌堆只剩 1 张
    g.state.discardPile.replaceAll([makeUniqueCard(CardType.Tao), makeUniqueCard(CardType.Shan)]);

    await drawCards(g, { target: player, count: 2 });

    expect(player.hand.cards.length).toBe(2); // 第 1 张摸完，洗入弃牌堆再摸第 2 张
  });
});

describe('peekTop / reshuffle', () => {
  it('peekTop 查看牌堆顶且不移动', () => {
    const g = freshGame();
    const deck = g.state.deck;

    expect(peekTop(g, 2)).toEqual(deck.cards.slice(-2));
    expect(g.state.deck.cards).toEqual(deck.cards); // 未改变
  });

  it('peekTop 不足 n 张返回全部', () => {
    const g = freshGame();
    g.state.deck.replaceAll([makeUniqueCard(CardType.Sha)]);

    expect(peekTop(g, 5)).toHaveLength(1);
  });

  it('reshuffle：弃牌堆全部洗入牌堆，产生一次 reshuffle 移动事件', async () => {
    const g = freshGame();
    const a = makeUniqueCard(CardType.Sha);
    const b = makeUniqueCard(CardType.Tao);
    g.state.deck.clear();
    g.state.discardPile.replaceAll([a, b]);
    const captured = { reshuffled: false };
    g.triggerSystem.on('cardMove.after', async (event) => {
      if ((event.data as CardMoveEventData).reason === 'reshuffle') {
        captured.reshuffled = true;
      }
    });

    await reshuffle(g);

    expect(captured.reshuffled).toBe(true);
    expect(g.state.discardPile.cards).toHaveLength(0);
    expect(g.state.deck.cards).toHaveLength(2);
    expect(g.state.deck.cards).toEqual(expect.arrayContaining([a, b]));
  });
});

describe('牌堆原语', () => {
  it('takeTop：从牌堆顶取 N 张到目标', async () => {
    const g = freshGame();
    const a = makeUniqueCard(CardType.Sha);
    const b = makeUniqueCard(CardType.Tao);
    const c = makeUniqueCard(CardType.Shan);
    g.state.deck.replaceAll([a, b, c]);
    const player = g.state.players[0];

    await takeTop(g, 2, { player, zone: 'hand' }, 'draw');

    expect(player.hand.cards).toEqual([b, c]); // 顶 = 数组尾
    expect(g.state.deck.cards).toEqual([a]);
  });

  it('takeTop：牌堆空时自动洗入弃牌堆', async () => {
    const g = freshGame();
    const x = makeUniqueCard(CardType.Tao);
    g.state.deck.clear();
    g.state.discardPile.replaceAll([x]);
    const player = g.state.players[0];

    await takeTop(g, 1, { player, zone: 'hand' }, 'draw');

    expect(player.hand.cards).toEqual([x]);
    expect(g.state.deck.cards).toHaveLength(0);
  });

  it('takeBottom：从牌堆底取一张', async () => {
    const g = freshGame();
    const a = makeUniqueCard(CardType.Sha);
    const b = makeUniqueCard(CardType.Tao);
    g.state.deck.replaceAll([a, b]); // a 在底
    const player = g.state.players[0];

    await takeBottom(g, 1, { player, zone: 'hand' }, 'draw');

    expect(player.hand.cards).toEqual([a]);
    expect(g.state.deck.cards).toEqual([b]);
  });

  it('putTop / putBottom：把手牌放回牌堆顶 / 底', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const top = makeUniqueCard(CardType.Sha);
    const bottom = makeUniqueCard(CardType.Tao);
    g.state.deck.replaceAll([makeUniqueCard(CardType.Shan)]);
    player.hand.replaceAll([bottom, top]);

    await putBottom(g, [bottom]);
    await putTop(g, [top]);

    expect(g.state.deck.cards[0]).toBe(bottom); // 底
    expect(g.state.deck.cards[g.state.deck.cards.length - 1]).toBe(top); // 顶
  });

  it('findInDeck：从顶往下找第一张符合条件', () => {
    const g = freshGame();
    const a = makeUniqueCard(CardType.Sha);
    const b = makeUniqueCard(CardType.Tao);
    const c = makeUniqueCard(CardType.Shan);
    g.state.deck.replaceAll([a, b, c]);

    expect(findInDeck(g, (card) => card.type === CardType.Tao)).toBe(b);
    expect(findInDeck(g, (card) => card.type === CardType.JueDou)).toBeNull();
  });

  it('findInDeckAndDiscard：牌堆 + 弃牌堆，牌堆先', () => {
    const g = freshGame();
    const deckTao = makeUniqueCard(CardType.Tao);
    const deckSha = makeUniqueCard(CardType.Sha);
    const discardShan = makeUniqueCard(CardType.Shan);
    g.state.deck.replaceAll([deckSha, deckTao]);
    g.state.discardPile.replaceAll([discardShan]);

    const found = findInDeckAndDiscard(g, (card) => card.type === CardType.Shan);

    expect(found).toEqual([discardShan]);
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
    const card = player.hand.cards[0];

    await playFromHand(g, player, card);

    expect(player.hand.cards.map((c) => c.type)).toEqual([CardType.Tao]);
    expect(g.state.discardPile.cards).toContain(card);
  });

  it('牌不在手牌 → 不重复入弃牌堆', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Tao);
    const phantom = makeUniqueCard(CardType.Sha);

    await playFromHand(g, player, phantom);

    expect(g.state.discardPile.cards).not.toContain(phantom);
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
    const card = from.hand.cards[0];

    await giveCards(g, from, to, [card]);

    expect(from.hand.cards.map((c) => c.type)).toEqual([CardType.Tao]);
    expect(to.hand.cards).toContain(card);
    expect(g.state.discardPile.cards.length).toBe(0); // 不经过弃牌堆
  });

  it('牌不在 from 手牌 → 跳过，不入 to 手牌', async () => {
    const g = freshGame();
    const from = g.state.players[0];
    const to = g.state.players[1];
    giveHand(from, CardType.Tao);
    const phantom = makeUniqueCard(CardType.Sha);

    await giveCards(g, from, to, [phantom]);

    expect(from.hand.cards.length).toBe(1);
    expect(to.hand.cards.length).toBe(0);
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
    const card = player.hand.cards[0];

    await discardCards(g, player, [card]);

    expect(player.hand.cards.map((c) => c.type)).toEqual([CardType.Tao]);
    expect(g.state.discardPile.cards).toContain(card);
  });

  it('返回实际移除的牌，不在手牌的牌自动跳过', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha, CardType.Tao);
    const card = player.hand.cards[0];
    const phantom = makeUniqueCard(CardType.Shan);

    const removed = await discardCards(g, player, [card, phantom]);

    expect(removed).toEqual([card]);
    expect(player.hand.cards.length).toBe(1);
    expect(g.state.discardPile.cards).not.toContain(phantom);
  });

  it('空数组 → 无操作', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);

    expect(await discardCards(g, player, [])).toEqual([]);
    expect(player.hand.cards.length).toBe(1);
    expect(g.state.discardPile.cards.length).toBe(0);
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
    const card = player.hand.cards[0];
    expect(getCardArea(g, card)).toEqual({ player, zone: 'hand' });

    const moved = await moveCards(g, {
      to: { zone: 'discardPile' }, cards: [card], reason: 'discard',
    });

    expect(moved).toEqual([card]);
    expect(player.hand.cards.map((c) => c.id)).not.toContain(card.id);
    expect(g.state.discardPile.cards).toContain(card);
    expect(getCardArea(g, card)).toEqual({ zone: 'discardPile' });
  });

  it('from 派生：不传来源，从装备区移入手牌', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const eq = makeUniqueCard(CardType.QiLinGong);
    equipAt(g, player, eq);

    const moved = await moveCards(g, {
      to: { player, zone: 'hand' }, cards: [eq], reason: 'obtain',
    });

    expect(moved).toEqual([eq]);
    expect(player.equipment.weapon).toBeUndefined();
    expect(player.hand.cards).toContain(eq);
    expect(getCardArea(g, eq)).toEqual({ player, zone: 'hand' });
  });

  it('一次移动支持多张牌来自不同区域', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const handCard = makeUniqueCard(CardType.Sha);
    const eqCard = makeUniqueCard(CardType.QiLinGong);
    player.hand.replaceAll([handCard]);
    equipAt(g, player, eqCard);

    const moved = await moveCards(g, {
      to: { zone: 'discardPile' }, cards: [handCard, eqCard], reason: 'discard',
    });

    expect(moved).toEqual([handCard, eqCard]);
    expect(player.hand.cards.length).toBe(0);
    expect(player.equipment.weapon).toBeUndefined();
    expect(g.state.discardPile.cards).toEqual([handCard, eqCard]);
  });

  it('putBottom：放入牌堆底（toPosition 已剥离进牌堆原语）', async () => {
    const g = freshGame();
    const bottom = makeUniqueCard(CardType.Tao);
    const card = makeUniqueCard(CardType.Sha);
    g.state.deck.replaceAll([bottom, card]); // card 在牌堆顶

    await putBottom(g, [card], 'draw');

    expect(g.state.deck.cards[0]).toBe(card); // 底
    expect(g.state.deck.cards[1]).toBe(bottom);
  });

  it('位置确认由调用方负责：牌已不在原区域则不移动', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const other = g.state.players[1];
    const card = makeUniqueCard(CardType.ShanDian);
    player.judgment.replaceAll([card]);
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

    expect(other.judgment.cards).toContain(card); // 未被拖走
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
    expect(player.hand.cards.length).toBe(0);
  });

  it('事件数据：reason / fromAreas / to / mover 正确', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const card = makeUniqueCard(CardType.Sha);
    player.hand.replaceAll([card]);
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
