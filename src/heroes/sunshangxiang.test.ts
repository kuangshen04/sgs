// ============================================================
// 孙尚香 — 结姻
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from '../test-utils.js';

import { playPhase } from '../gameFlow.js';

import { discardCards, equipCard, moveCards } from '../cardActions.js';

import { activeSkillRegistry, registerSkills } from '../skills.js';

import { CardType } from '../types.js';

const sunshangxiangHeroes = ['孙尚香', '刘备', '孙权'];

describe('结姻（孙尚香主动技能）', () => {
  it('activeSkillRegistry 已注册结姻', () => {
    expect(activeSkillRegistry.get('结姻')).toBeDefined();
  });

  it('弃两张手牌，自己与受伤的男性目标各回复 1 点体力', async () => {
    const g = freshGame({}, sunshangxiangHeroes);
    registerSkills(g);
    const sun = g.state.players[0];
    const target = g.state.players[1]; // 刘备（男）
    sun.hp = 2;
    target.hp = 2;
    giveHand(sun, CardType.Shan, CardType.Shan); // 闪不可主动出 → 触发结姻

    await playPhase(g, { player: sun });

    expect(sun.hp).toBe(3);
    expect(target.hp).toBe(3);
    expect(sun.hand.length).toBe(0); // 两张手牌被弃置
  });

  it('没有受伤的男性角色 → 规则不允许发动', async () => {
    const g = freshGame({}, sunshangxiangHeroes);
    registerSkills(g);
    const sun = g.state.players[0];
    const skill = activeSkillRegistry.get('结姻')!;
    giveHand(sun, CardType.Shan, CardType.Shan);
    const ctx = { shaUsed: false, usedSkills: new Set<string>(), cardChoice: null };

    expect(skill.canUse(g, sun, ctx)).toBe(false); // 刘备/孙权均满血
  });

  it('规则层面：已用过 → canUse 为 false（限一次）', () => {
    const g = freshGame({}, sunshangxiangHeroes);
    const sun = g.state.players[0];
    g.state.players[1].hp = 2; // 制造合法目标
    giveHand(sun, CardType.Shan, CardType.Shan);
    const skill = activeSkillRegistry.get('结姻')!;

    expect(
      skill.canUse(g, sun, { shaUsed: false, usedSkills: new Set(['结姻']), cardChoice: null }),
    ).toBe(false);
  });

  it('孙尚香满血但队友受伤 → AI 不发动（保守策略）', async () => {
    const g = freshGame({}, sunshangxiangHeroes);
    registerSkills(g);
    const sun = g.state.players[0];
    const target = g.state.players[1];
    target.hp = 2;
    giveHand(sun, CardType.Shan, CardType.Shan);
    const skill = activeSkillRegistry.get('结姻')!;

    expect(skill.canUse(g, sun, { shaUsed: false, usedSkills: new Set<string>(), cardChoice: null })).toBe(true);
    expect(
      skill.ai.shouldUse(g, sun, { shaUsed: false, usedSkills: new Set<string>(), cardChoice: null }),
    ).toBe(false); // 自己满血，AI 觉得不值

    await playPhase(g, { player: sun });

    expect(sun.hand.length).toBe(2); // 未发动
    expect(target.hp).toBe(2);
  });
});

describe('枭姬（孙尚香触发技能）', () => {
  it('失去装备区内的牌 → 摸两张', async () => {
    const g = freshGame({}, sunshangxiangHeroes);
    registerSkills(g);
    const sun = g.state.players[0];
    const weapon = makeUniqueCard(CardType.ZhugeLianNu);
    sun.equipment.weapon = weapon;
    const before = sun.hand.length;

    await moveCards(g, {
      to: { zone: 'discardPile' }, cards: [weapon], reason: 'discard',
    });

    expect(sun.equipment.weapon).toBeUndefined();
    expect(sun.hand.length).toBe(before + 2);
  });

  it('装备顶掉 → 旧装备失去触发枭姬', async () => {
    const g = freshGame({}, sunshangxiangHeroes);
    registerSkills(g);
    const sun = g.state.players[0];
    const oldWeapon = makeUniqueCard(CardType.QiLinGong);
    const newWeapon = makeUniqueCard(CardType.HanBingJian);
    sun.equipment.weapon = oldWeapon;
    sun.hand = [newWeapon];

    await equipCard(g, sun, newWeapon);

    expect(sun.equipment.weapon).toBe(newWeapon);
    // 初始 1（新武器）→ replace 触发枭姬摸 2（=3）→ equip 消耗新武器（=2）
    expect(sun.hand.length).toBe(2);
  });

  it('失去手牌 → 不触发枭姬', async () => {
    const g = freshGame({}, sunshangxiangHeroes);
    registerSkills(g);
    const sun = g.state.players[0];
    giveHand(sun, CardType.Sha);
    const before = sun.hand.length;

    await discardCards(g, sun, [sun.hand[0]]);

    expect(sun.hand.length).toBe(before - 1); // 只弃不摸
  });

  it('非孙尚香 → 不触发', async () => {
    const g = freshGame({}, sunshangxiangHeroes);
    registerSkills(g);
    const liubei = g.state.players[1];
    const weapon = makeUniqueCard(CardType.ZhugeLianNu);
    liubei.equipment.weapon = weapon;
    const before = liubei.hand.length;

    await moveCards(g, {
      to: { zone: 'discardPile' }, cards: [weapon], reason: 'discard',
    });

    expect(liubei.hand.length).toBe(before); // 无枭姬
  });
});
