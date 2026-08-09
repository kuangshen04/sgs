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

describe('无双②（决斗）', () => {
  it('吕布使用决斗 → 对方每次响应需两张杀', async () => {
    const g = freshGame({}, lvbuHeroes);
    registerSkills(g);
    const lvbu = g.state.players[0];
    const target = g.state.players[1];
    giveHand(lvbu, CardType.JueDou);
    giveHand(target, CardType.Sha, CardType.Tao); // 只有一张杀
    const hpBefore = target.hp;

    await useCard(g, { player: lvbu, card: lvbu.hand[0], targets: [target] });

    // 目标需出两张杀，只有一张 → 目标先响应失败 → 目标受伤
    expect(target.hp).toBe(hpBefore - 1);
    expect(target.hand.length).toBe(1); // 剩桃，杀已打出
  });

  it('吕布是决斗目标 → 自己每次响应只需一张杀，对方需两张', async () => {
    const g = freshGame({}, lvbuHeroes);
    registerSkills(g);
    const liubei = g.state.players[1];
    const lvbu = g.state.players[0];
    giveHand(liubei, CardType.JueDou);
    giveHand(lvbu, CardType.Sha, CardType.Tao); // 只有一张杀
    const lvbuHpBefore = lvbu.hp;
    const liubeiHpBefore = liubei.hp;

    await useCard(g, { player: liubei, card: liubei.hand[0], targets: [lvbu] });

    // 吕布作为目标只需一张杀（对手刘备没有无双）→ 成功响应；
    // 轮到刘备响应时需两张（对手吕布有无双）→ 无杀失败受伤
    expect(lvbu.hp).toBe(lvbuHpBefore);
    expect(liubei.hp).toBe(liubeiHpBefore - 1);
    expect(lvbu.hand.length).toBe(1); // 剩桃
  });

  it('双方都有两张杀 → 先耗尽的一方失败', async () => {
    const g = freshGame({}, lvbuHeroes);
    registerSkills(g);
    const lvbu = g.state.players[0];
    const target = g.state.players[1];
    giveHand(lvbu, CardType.JueDou, CardType.Sha, CardType.Sha, CardType.Sha, CardType.Sha);
    giveHand(target, CardType.Sha, CardType.Sha, CardType.Tao);
    const hpBefore = target.hp;

    await useCard(g, { player: lvbu, card: lvbu.hand[0], targets: [target] });

    // 第1轮 target 需两张（对手吕布）；第2轮 lvbu 只需一张（对手刘备无无双）；
    // 第3轮 target 需两张 → 无杀失败受伤
    expect(target.hp).toBe(hpBefore - 1);
    expect(target.hand.length).toBe(1); // 剩桃
    expect(lvbu.hand.length).toBe(3);   // 剩三张杀
  });

  it('双方都是吕布 → 双方每次响应都需两张杀', async () => {
    const g = freshGame({}, ['吕布', '吕布', '孙权']);
    registerSkills(g);
    const lvbuA = g.state.players[0];
    const lvbuB = g.state.players[1];
    giveHand(lvbuA, CardType.JueDou, CardType.Sha, CardType.Sha, CardType.Tao);
    giveHand(lvbuB, CardType.Sha, CardType.Sha, CardType.Tao);
    const hpBefore = lvbuB.hp;

    await useCard(g, { player: lvbuA, card: lvbuA.hand[0], targets: [lvbuB] });

    // 第1轮 B 需两张（对手 A 是吕布）；第2轮 A 也需两张（对手 B 是吕布）；
    // 第3轮 B 需两张 → 无杀失败受伤；双方各剩一张桃
    expect(lvbuB.hp).toBe(hpBefore - 1);
    expect(lvbuB.hand.length).toBe(1);
    expect(lvbuA.hand.length).toBe(1);
  });
});
