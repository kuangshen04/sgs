// ============================================================
// 吕布 — 无双
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand } from '../test-utils.js';

import { useCard } from '../cardActions.js';

import { registerSkills, skillRegistry } from '../skills.js';

import { CardType } from '../types.js';

const lvbuHeroes = ['吕布', '刘备', '孙权'];

describe('无双（吕布锁定技）', () => {
  it('skillRegistry 已注册无双', () => {
    expect(skillRegistry.get('无双')).toBeDefined();
  });

  it('吕布使用杀 → 目标需两张闪：只有一张则命中', async () => {
    const g = freshGame({}, lvbuHeroes);
    registerSkills(g);
    const lvbu = g.state.players[0];
    const target = g.state.players[1];
    giveHand(lvbu, CardType.Sha);
    giveHand(target, CardType.Shan, CardType.Tao); // 只有一张闪
    const hpBefore = target.hp;

    await useCard(g, { player: lvbu, card: lvbu.hand[0], targets: [target] });

    expect(target.hp).toBe(hpBefore - 1); // 无双命中
    expect(target.hand.length).toBe(1);   // 闪已打出，剩桃
  });

  it('目标有两张闪 → 抵消', async () => {
    const g = freshGame({}, lvbuHeroes);
    registerSkills(g);
    const lvbu = g.state.players[0];
    const target = g.state.players[1];
    giveHand(lvbu, CardType.Sha);
    giveHand(target, CardType.Shan, CardType.Shan);
    const hpBefore = target.hp;

    await useCard(g, { player: lvbu, card: lvbu.hand[0], targets: [target] });

    expect(target.hp).toBe(hpBefore);       // 两张闪抵消
    expect(target.hand.length).toBe(0);
  });

  it('非吕布使用杀 → 一张闪即可抵消', async () => {
    const g = freshGame({}, lvbuHeroes);
    registerSkills(g);
    const liubei = g.state.players[1];
    const target = g.state.players[0]; // 吕布
    giveHand(liubei, CardType.Sha);
    giveHand(target, CardType.Shan);
    const hpBefore = target.hp;

    await useCard(g, { player: liubei, card: liubei.hand[0], targets: [target] });

    expect(target.hp).toBe(hpBefore); // 一张闪抵消
    expect(target.hand.length).toBe(0);
  });
});
