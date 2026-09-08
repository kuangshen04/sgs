// ============================================================
// 受控容器 CardArea + 集中索引（阶段 2）单元测试
// 唯一性（一牌一位置）/ 容器方法与索引同步 / 对账不变量
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from './test-utils.js';
import { getCardArea, moveCards } from './cardActions.js';
import { assertCardState, verifyCardState } from './cardAreaCheck.js';
import { CardType } from './types.js';

describe('CardArea 唯一性（一牌一位置）', () => {
  it('已在手牌的牌再次 add 到别处 → 抛错', () => {
    const g = freshGame();
    const p0 = g.state.players[0];
    const p1 = g.state.players[1];
    giveHand(p0, CardType.Sha);
    const card = p0.hand.cards[0];

    expect(() => p1.hand.add(card)).toThrow(/already/);
  });

  it('同容器重复 add 同一张 → 抛错', () => {
    const g = freshGame();
    const p0 = g.state.players[0];
    const card = makeUniqueCard(CardType.Sha);
    p0.hand.add(card);
    expect(() => p0.hand.add(card)).toThrow(/already/);
  });

  it('容器方法同步索引：removeById / removeLast / clear 后索引不再指向', () => {
    const g = freshGame();
    const p0 = g.state.players[0];
    giveHand(p0, CardType.Sha, CardType.Tao);
    const [sha, tao] = p0.hand.cards;

    expect(getCardArea(g, sha)).toEqual({ player: p0, zone: 'hand' });
    p0.hand.removeById(sha.id);
    expect(getCardArea(g, sha)).toBeNull();

    expect(p0.hand.removeLast()).toBe(tao);
    expect(getCardArea(g, tao)).toBeNull();
    expect(p0.hand.isEmpty).toBe(true);
  });

  it('replaceAll / insertAt 顺序与索引正确', () => {
    const g = freshGame();
    const p0 = g.state.players[0];
    const a = makeUniqueCard(CardType.Sha);
    const b = makeUniqueCard(CardType.Tao);
    const c = makeUniqueCard(CardType.Shan);
    p0.hand.replaceAll([a, b]);
    p0.hand.insertAt(1, c);

    expect(p0.hand.cards).toEqual([a, c, b]);
    expect(g.cardIndex.get(a.id)).toEqual({ player: p0, zone: 'hand' });
    expect(g.cardIndex.get(c.id)).toEqual({ player: p0, zone: 'hand' });
  });
});

describe('对账不变量 verifyCardState', () => {
  it('建局后无问题', () => {
    const g = freshGame();
    expect(verifyCardState(g)).toEqual([]);
  });

  it('真实移动后仍无问题（手牌→弃牌堆→摸回）', async () => {
    const g = freshGame();
    const p0 = g.state.players[0];
    giveHand(p0, CardType.Sha);
    const card = p0.hand.cards[0];

    await moveCards(g, { to: { zone: 'discardPile' }, cards: [card], reason: 'discard' });
    expect(verifyCardState(g)).toEqual([]);

    await moveCards(g, { to: { player: p0, zone: 'hand' }, cards: [card], reason: 'obtain' });
    expect(verifyCardState(g)).toEqual([]);
  });

  it('索引幽灵（无物理牌）会被检出', () => {
    const g = freshGame();
    const ghost = makeUniqueCard(CardType.Sha);
    g.cardIndex.set(ghost.id, { zone: 'deck' }); // 人为制造不一致

    expect(verifyCardState(g).some((s) => s.includes('索引幽灵'))).toBe(true);
    expect(() => assertCardState(g)).toThrow(/对账失败/);
  });

  it('索引与物理不一致（指错玩家）会被检出', () => {
    const g = freshGame();
    const p0 = g.state.players[0];
    const p1 = g.state.players[1];
    giveHand(p0, CardType.Sha);
    const card = p0.hand.cards[0];
    g.cardIndex.set(card.id, { player: p1, zone: 'hand' }); // 人为篡改

    expect(verifyCardState(g).some((s) => s.includes('不一致'))).toBe(true);
  });
});
