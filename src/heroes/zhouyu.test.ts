// ============================================================
// 周瑜 — 英姿 / 反间
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';

import { freshGame, giveHand } from '../test-utils.js';

import { drawPhase, playPhase } from '../gameFlow.js';

import { activeSkillRegistry, registerSkills, skillRegistry } from '../skills.js';
import { triggerSystem } from '../events/index.js';

import { CardType } from '../types.js';

const zhouyuHeroes = ['刘备', '周瑜', '孙权'];

afterEach(() => triggerSystem.clear());

describe('英姿（周瑜技能）', () => {
  it('skillRegistry 已注册英姿', () => {
    expect(skillRegistry.get('英姿')).toBeDefined();
  });

  it('摸牌阶段 → 正常 2 张 + 英姿 1 张', async () => {
    registerSkills();
    const g = freshGame({}, zhouyuHeroes);
    const zhouyu = g.state.players[1];
    const before = zhouyu.hand.length;

    await drawPhase(g, { player: zhouyu });

    expect(zhouyu.hand.length).toBe(before + 3);
  });

  it('非周瑜摸牌阶段 → 只摸 2 张', async () => {
    registerSkills();
    const g = freshGame({}, zhouyuHeroes);
    const liubei = g.state.players[0];
    const before = liubei.hand.length;

    await drawPhase(g, { player: liubei });

    expect(liubei.hand.length).toBe(before + 2);
  });
});

describe('反间（周瑜主动技能）', () => {
  it('activeSkillRegistry 已注册反间', () => {
    expect(activeSkillRegistry.get('反间')).toBeDefined();
  });

  it('交给目标 1 张牌并造成 1 点伤害', async () => {
    registerSkills();
    const g = freshGame({}, zhouyuHeroes);
    const zhouyu = g.state.players[1];
    const target = g.state.players[0];
    giveHand(zhouyu, CardType.Shan); // 不可出 → 触发主动技能
    const givenId = zhouyu.hand[0].id;
    const hpBefore = target.hp;

    await playPhase(g, { player: zhouyu });

    expect(target.hp).toBe(hpBefore - 1);
    expect(zhouyu.hand.length).toBe(0);
    expect(target.hand.map((c) => c.id)).toContain(givenId);
    expect(g.state.discardPile.length).toBe(0); // 牌到了目标手牌
  });
});
