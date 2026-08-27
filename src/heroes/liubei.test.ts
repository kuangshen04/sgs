// ============================================================
// 刘备 — 仁德
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from '../test-utils.js';

import { playPhase } from '../gameFlow.js';
import { useCard } from '../cardActions.js';

import { activeSkillRegistry, registerSkills } from '../skills.js';

import { CardType } from '../types.js';

const liubeiHeroes = ['刘备', '曹操', '孙权'];

describe('仁德（刘备主动技能）', () => {
  it('activeSkillRegistry 已注册仁德', () => {
    expect(activeSkillRegistry.get('仁德')).toBeDefined();
  });

  it('交给目标 2 张牌并回复 1 点体力', async () => {
    const g = freshGame({}, liubeiHeroes);
    registerSkills(g);
    const liubei = g.state.players[0];
    const target = g.state.players[1];
    liubei.hp = 3; // 受伤
    giveHand(liubei, CardType.Shan, CardType.WuXie); // 不可出 → 触发主动技能
    const givenIds = liubei.hand.map((c) => c.id);

    await playPhase(g, { player: liubei });

    expect(liubei.hp).toBe(4);
    expect(liubei.hand.length).toBe(0);
    expect(target.hand.map((c) => c.id).sort((a, b) => a - b))
      .toEqual([...givenIds].sort((a, b) => a - b));
    expect(g.state.discardPile.length).toBe(0); // 牌到了目标手牌，不是弃牌堆
  });

  it('满血时不发动（AI 策略：交牌换血不划算）', async () => {
    const g = freshGame({}, liubeiHeroes);
    registerSkills(g);
    const liubei = g.state.players[0];
    giveHand(liubei, CardType.Shan, CardType.WuXie);
    const skill = activeSkillRegistry.get('仁德')!;
    const ctx = { shaUsed: false, usedSkills: new Set<string>(), hasCardOption: false };

    expect(skill.canUse(g, liubei, ctx)).toBe(true);        // 规则：合法
    expect(skill.ai.shouldUse(g, liubei, ctx)).toBe(false);  // AI：不该用
  });
});

describe('激将（刘备主公技）', () => {
  it('蜀盟友代打杀（决斗）', async () => {
    const g = freshGame({}, ['刘备', '关羽', '曹操']);
    registerSkills(g);
    const liubei = g.state.players[0];
    const guanyu = g.state.players[1];
    const caocao = g.state.players[2];
    liubei.hand = [];
    guanyu.hand = [makeUniqueCard(CardType.Sha)];
    caocao.hand = [makeUniqueCard(CardType.JueDou)];
    const hpBefore = caocao.hp;

    await useCard(g, { player: caocao, card: caocao.hand[0], targets: [liubei] });

    expect(caocao.hp).toBe(hpBefore - 1); // 刘备代打成功，曹操无杀受伤
    expect(liubei.hp).toBe(4);
    expect(guanyu.hand.length).toBe(0); // 关羽的杀被代打消耗
  });

  it('出牌阶段可借蜀盟友的杀', async () => {
    const g = freshGame({}, ['刘备', '孙权', '关羽']);
    registerSkills(g);
    const liubei = g.state.players[0];
    const sunquan = g.state.players[1];
    const guanyu = g.state.players[2];
    liubei.hand = [];
    guanyu.hand = [makeUniqueCard(CardType.Sha)];
    const hpBefore = sunquan.hp;

    await playPhase(g, { player: liubei });

    expect(sunquan.hp).toBe(hpBefore - 1);
    expect(guanyu.hand.length).toBe(0); // 关羽的杀被借走
    expect(liubei.hand.length).toBe(0);
  });
});
