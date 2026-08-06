// ============================================================
// 孙尚香 — 结姻
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand } from '../test-utils.js';

import { playPhase } from '../gameFlow.js';

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
