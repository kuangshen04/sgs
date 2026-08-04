// ============================================================
// 黄月英 — 集智
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';

import { freshGame, giveHand } from '../test-utils.js';

import { useCard } from '../cardActions.js';

import { registerSkills, skillRegistry } from '../skills.js';
import { triggerSystem } from '../events/index.js';

import { CardType } from '../types.js';

afterEach(() => triggerSystem.clear());

describe('集智（黄月英技能）', () => {
  it('skillRegistry 已注册集智', () => {
    expect(skillRegistry.get('集智')).toBeDefined();
  });

  it('使用普通锦囊 → 摸 1 张牌', async () => {
    registerSkills();
    const g = freshGame({}, ['刘备', '黄月英', '孙权']);
    const yueying = g.state.players[1];
    giveHand(yueying, CardType.WuZhong);
    const card = yueying.hand[0];

    await useCard(g, { player: yueying, card, targets: [yueying] });

    // 无中生有：用 1 摸 2，集智再摸 1 → 3 张
    expect(yueying.hand.length).toBe(3);
  });

  it('使用基本牌 → 不触发', async () => {
    registerSkills();
    const g = freshGame({}, ['刘备', '黄月英', '孙权']);
    const yueying = g.state.players[1];
    giveHand(yueying, CardType.Sha);
    const card = yueying.hand[0];

    await useCard(g, { player: yueying, card, targets: [g.state.players[0]] });

    expect(yueying.hand.length).toBe(0); // 杀已用，未摸牌
  });

  it('使用延时锦囊 → 不触发', async () => {
    registerSkills();
    const g = freshGame({}, ['刘备', '黄月英', '孙权']);
    const yueying = g.state.players[1];
    giveHand(yueying, CardType.LeBu);
    const card = yueying.hand[0];

    await useCard(g, { player: yueying, card, targets: [g.state.players[2]] });

    expect(yueying.hand.length).toBe(0); // 乐不思蜀置入判定区，未摸牌
  });
});
