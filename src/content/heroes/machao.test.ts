// ============================================================
// 马超 — 马术 / 铁骑
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from '../../test-utils.js';

import { useCard } from '../../flow/useCard.js';

import { effectRegistry } from '../../effects/persistentEffects.js';


import { CardType } from '../../types.js';

describe('马术（马超锁定技）', () => {
  it('effectRegistry：马超拥有 offensiveDistance，普通角色没有', () => {
    const g = freshGame({}, ['刘备', '马超', '孙权']);
    expect(effectRegistry.has(g, g.state.players[1], 'offensiveDistance')).toBe(true);
    expect(effectRegistry.has(g, g.state.players[0], 'offensiveDistance')).toBe(false);
  });
});

describe('铁骑（马超触发技能）', () => {
  it('判定为红色 → 目标有闪也命中', async () => {
    const g = freshGame({}, ['马超', '刘备', '孙权']);
    const machao = g.state.players[0];
    const target = g.state.players[1];
    giveHand(machao, CardType.Sha);
    giveHand(target, CardType.Shan);
    g.state.deck.add(makeUniqueCard(CardType.Sha, '♥', 1)); // 判定牌：红桃
    const hpBefore = target.hp;

    await useCard(g, { player: machao, card: machao.hand.cards[0], targets: [target] });

    expect(target.hp).toBe(hpBefore - 1); // 不可闪避，命中
    expect(target.hand.cards.length).toBe(1);   // 闪未打出
  });

  it('判定为黑色 → 目标可出闪抵消', async () => {
    const g = freshGame({}, ['马超', '刘备', '孙权']);
    const machao = g.state.players[0];
    const target = g.state.players[1];
    giveHand(machao, CardType.Sha);
    giveHand(target, CardType.Shan);
    g.state.deck.add(makeUniqueCard(CardType.Sha, '♠', 1)); // 判定牌：黑桃
    const hpBefore = target.hp;

    await useCard(g, { player: machao, card: machao.hand.cards[0], targets: [target] });

    expect(target.hp).toBe(hpBefore);     // 闪抵消
    expect(target.hand.cards.length).toBe(0);
  });

  it('多目标杀：不可响应是**每目标**的位（只对判定成功的目标生效）', async () => {
    const g = freshGame({}, ['马超', '刘备', '孙权']);
    const machao = g.state.players[0];
    const p2 = g.state.players[1];
    const p3 = g.state.players[2];
    giveHand(machao, CardType.Sha);
    giveHand(p2, CardType.Shan);
    giveHand(p3, CardType.Shan);
    // 牌堆顶（数组尾）为第一次判定：红桃 → p2 不可响应当前杀；随后黑桃 → p3 可响应
    g.state.deck.add(makeUniqueCard(CardType.Sha, '♠', 1));
    g.state.deck.add(makeUniqueCard(CardType.Sha, '♥', 1));
    const hp2 = p2.hp;
    const hp3 = p3.hp;

    await useCard(g, {
      player: machao, card: machao.hand.cards[0], targets: [p2, p3],
    });

    expect(p2.hp).toBe(hp2 - 1);          // 铁骑判定红 → 不可闪避（闪留在手里）
    expect(p2.hand.cards.length).toBe(1);
    expect(p3.hp).toBe(hp3);              // 判定黑 → 正常出闪抵消（不再被前一目标的位污染）
    expect(p3.hand.cards.length).toBe(0);
  });
});
