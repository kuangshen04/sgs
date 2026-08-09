// ============================================================
// 马超 — 马术 / 铁骑
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from '../test-utils.js';

import { useCard } from '../cardActions.js';

import { effectRegistry } from '../persistentEffects.js';

import { registerSkills, skillRegistry } from '../skills.js';

import { CardType } from '../types.js';

describe('马术（马超锁定技）', () => {
  it('effectRegistry：马超拥有 offensiveDistance，普通角色没有', () => {
    const g = freshGame({}, ['刘备', '马超', '孙权']);
    expect(effectRegistry.has(g.state.players[1], 'offensiveDistance')).toBe(true);
    expect(effectRegistry.has(g.state.players[0], 'offensiveDistance')).toBe(false);
  });
});

describe('铁骑（马超触发技能）', () => {
  it('判定为红色 → 目标有闪也命中', async () => {
    const g = freshGame({}, ['马超', '刘备', '孙权']);
    registerSkills(g);
    const machao = g.state.players[0];
    const target = g.state.players[1];
    giveHand(machao, CardType.Sha);
    giveHand(target, CardType.Shan);
    g.state.deck.push(makeUniqueCard(CardType.Sha, '♥', 1)); // 判定牌：红桃
    const hpBefore = target.hp;

    await useCard(g, { player: machao, card: machao.hand[0], targets: [target] });

    expect(target.hp).toBe(hpBefore - 1); // 不可闪避，命中
    expect(target.hand.length).toBe(1);   // 闪未打出
  });

  it('判定为黑色 → 目标可出闪抵消', async () => {
    const g = freshGame({}, ['马超', '刘备', '孙权']);
    registerSkills(g);
    const machao = g.state.players[0];
    const target = g.state.players[1];
    giveHand(machao, CardType.Sha);
    giveHand(target, CardType.Shan);
    g.state.deck.push(makeUniqueCard(CardType.Sha, '♠', 1)); // 判定牌：黑桃
    const hpBefore = target.hp;

    await useCard(g, { player: machao, card: machao.hand[0], targets: [target] });

    expect(target.hp).toBe(hpBefore);     // 闪抵消
    expect(target.hand.length).toBe(0);
  });
});
