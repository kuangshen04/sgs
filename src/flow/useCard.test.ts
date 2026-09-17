// ============================================================
// useCard — 目标阶段 + 单目标生效事件（演进 3.6 U1）
//
// 锁定结构：逐目标依次 cardEffect（before → 内容 → after）；
// 引擎在内容前检查 nullified / cancelled ⇒ 跳过内容；
// onAction(before/after) 承担整张牌的开幕/收尾（五谷亮牌一次）。
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand } from '../test-utils.js';
import { useCard } from './useCard.js';
import { EventType } from '../events/index.js';
import type { CardEffectEventData } from '../events/index.js';
import { CardType } from '../types.js';

describe('useCard：逐目标单目标生效事件', () => {
  it('多目标牌：目标按顺序各产生一次 cardEffect（before → after 成对）', async () => {
    const g = freshGame();
    const [user, p2, p3] = g.state.players;
    giveHand(user, CardType.NanMan);
    giveHand(p2);
    giveHand(p3);
    const log: string[] = [];
    g.triggerSystem.on(`${EventType.CardEffect}.before`, (e) => {
      log.push(`before:${(e.data as CardEffectEventData).to?.name ?? '-'}`);
    });
    g.triggerSystem.on(`${EventType.CardEffect}.after`, (e) => {
      log.push(`after:${(e.data as CardEffectEventData).to?.name ?? '-'}`);
    });

    await useCard(g, { player: user, card: user.hand.cards[0], targets: [p2, p3] });

    expect(log).toEqual([
      `before:${p2.name}`, `after:${p2.name}`,
      `before:${p3.name}`, `after:${p3.name}`,
    ]);
  });

  it('内容在 before 与 after 之间执行（伤害发生在两个时点之间）', async () => {
    const g = freshGame();
    const [user, p2] = g.state.players;
    giveHand(user, CardType.NanMan);
    giveHand(p2); // 无杀 → 受伤
    const hpLog: number[] = [];
    g.triggerSystem.on(`${EventType.CardEffect}.before`, (e) => {
      hpLog.push((e.data as CardEffectEventData).to!.hp);
    });
    g.triggerSystem.on(`${EventType.CardEffect}.after`, (e) => {
      hpLog.push((e.data as CardEffectEventData).to!.hp);
    });
    const hpBefore = p2.hp;

    await useCard(g, { player: user, card: user.hand.cards[0], targets: [p2] });

    expect(hpLog).toEqual([hpBefore, hpBefore - 1]); // 内容（伤害）在两个时点之间
  });

  it('cardEffect.before 置 nullified → 该目标的内容跳过（其他目标照常）', async () => {
    const g = freshGame();
    const [user, p2, p3] = g.state.players;
    giveHand(user, CardType.NanMan);
    giveHand(p2);
    giveHand(p3);
    g.triggerSystem.on(`${EventType.CardEffect}.before`, (e) => {
      const data = e.data as CardEffectEventData;
      if (data.to === p2) data.nullified = true; // 引擎语义：无效 ⇒ 跳过内容
    });
    const hp2 = p2.hp;
    const hp3 = p3.hp;

    await useCard(g, { player: user, card: user.hand.cards[0], targets: [p2, p3] });

    expect(p2.hp).toBe(hp2);     // 无效：内容未执行
    expect(p3.hp).toBe(hp3 - 1); // 其他目标照常
  });

  it('cardEffect.before 置 cancelled → 该目标的内容跳过（南蛮仍进弃牌堆）', async () => {
    const g = freshGame();
    const [user, p2] = g.state.players;
    giveHand(user, CardType.NanMan);
    giveHand(p2);
    const card = user.hand.cards[0];
    g.triggerSystem.on(`${EventType.CardEffect}.before`, (e) => {
      (e.data as CardEffectEventData).cancelled = true;
    });
    const hp2 = p2.hp;

    await useCard(g, { player: user, card, targets: [p2] });

    expect(p2.hp).toBe(hp2);
    expect(g.state.discardPile.cards).toContain(card);
  });
});

describe('useCard：onAction（整张牌的开幕 / 收尾）', () => {
  it('五谷丰登：亮牌一次（onAction.before），逐目标各取一张，剩余进弃牌堆', async () => {
    const g = freshGame();
    const [user, p2, p3] = g.state.players;
    giveHand(user, CardType.WuGu);
    const card = user.hand.cards[0];
    giveHand(p2);
    giveHand(p3);
    // 牌堆顶三张（供亮牌）
    const revealed = ['♥', '♠', '♣'].map((suit, i) =>
      // makeUniqueCard 由 test-utils 提供，这里直接用牌堆内的牌
      ({ id: 5000 + i, type: CardType.Sha, name: '杀', suit, number: i + 1 }));
    g.state.deck.replaceAll(revealed);

    await useCard(g, { player: user, card, targets: [user, p2, p3] });

    // 亮出的牌被三名角色各取一张（AI 默认取牌池第一个）
    expect(g.state.deck.cards).toHaveLength(0);
    expect(g.state.processing.cards).toHaveLength(0); // 牌池已清空
    const owners = [user, p2, p3].map((p) => p.hand.cards.filter(
      (c) => revealed.some((r) => r.id === c.id),
    ).length);
    expect(owners).toEqual([1, 1, 1]);
    expect(g.state.discardPile.cards).toContain(card);
  });
});
