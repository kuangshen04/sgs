// ============================================================
// 郭嘉 — 遗计 / 天妒
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from '../test-utils.js';

import { damage } from '../life.js';
import { judge } from '../cardActions.js';

import { registerSkills, skillRegistry } from '../skills.js';

import { CardType } from '../types.js';

const guojiaHeroes = ['刘备', '郭嘉', '孙权'];

describe('遗计（郭嘉技能）', () => {
  it('skillRegistry 已注册遗计', () => {
    expect(skillRegistry.get('遗计')).toBeDefined();
  });

  it('郭嘉受到 1 点伤害 → 摸 2 张牌', async () => {
    const g = freshGame({}, guojiaHeroes);
    registerSkills(g);
    const guojia = g.state.players[1];
    const before = guojia.hand.length;

    await damage(g, { target: guojia, source: g.state.players[0], amount: 1 });

    expect(guojia.hand.length).toBe(before + 2);
  });

  it('郭嘉受到 2 点伤害 → 摸 4 张牌', async () => {
    const g = freshGame({}, guojiaHeroes);
    registerSkills(g);
    const guojia = g.state.players[1];
    const before = guojia.hand.length;

    await damage(g, { target: guojia, source: g.state.players[0], amount: 2 });

    expect(guojia.hand.length).toBe(before + 4);
  });

  it('非郭嘉受伤 → 不触发', async () => {
    const g = freshGame({}, guojiaHeroes);
    registerSkills(g);
    const liubei = g.state.players[0];
    const before = liubei.hand.length;

    await damage(g, { target: liubei, source: g.state.players[1], amount: 1 });

    expect(liubei.hand.length).toBe(before);
  });

  it('未调用 registerSkills → 不触发', async () => {
    const g = freshGame({}, guojiaHeroes);
    const guojia = g.state.players[1];
    const before = guojia.hand.length;

    await damage(g, { target: guojia, source: g.state.players[0], amount: 1 });

    expect(guojia.hand.length).toBe(before);
  });
});

describe('天妒（郭嘉技能）', () => {
  it('skillRegistry 已注册天妒', () => {
    expect(skillRegistry.get('天妒')).toBeDefined();
  });

  it('郭嘉判定后获得判定牌', async () => {
    const g = freshGame({}, guojiaHeroes);
    registerSkills(g);
    const guojia = g.state.players[1];
    const judgeCard = makeUniqueCard(CardType.Sha, '♠', 5);
    g.state.deck = [judgeCard];

    const card = await judge(g, guojia);

    expect(card.id).toBe(judgeCard.id);
    expect(guojia.hand.map((c) => c.id)).toContain(judgeCard.id); // 天妒拿回判定牌
    expect(g.state.discardPile.find((c) => c.id === judgeCard.id)).toBeUndefined();
  });

  it('非郭嘉判定 → 不获得判定牌', async () => {
    const g = freshGame({}, guojiaHeroes);
    registerSkills(g);
    const liubei = g.state.players[0];
    const judgeCard = makeUniqueCard(CardType.Sha, '♠', 5);
    g.state.deck = [judgeCard];

    await judge(g, liubei);

    expect(liubei.hand.length).toBe(0);
    expect(g.state.discardPile.find((c) => c.id === judgeCard.id)).toBeDefined(); // 判定牌留在弃牌堆
  });
});
