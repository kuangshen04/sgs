// ============================================================
// 华佗 — 青囊
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand } from '../test-utils.js';

import { playPhase } from '../gameFlow.js';

import { activeSkillRegistry, registerSkills } from '../skills.js';

import { CardType } from '../types.js';

describe('青囊（华佗主动技能）', () => {
  it('activeSkillRegistry 已注册青囊', () => {
    expect(activeSkillRegistry.get('青囊')).toBeDefined();
  });

  it('自己受伤时出牌阶段 → 弃 1 张手牌回复 1 点体力', async () => {
    const g = freshGame({}, ['华佗', '刘备', '孙权']);
    registerSkills(g);
    const huatuo = g.state.players[0];
    huatuo.hp = 2;
    giveHand(huatuo, CardType.Shan); // 不可出 → 触发主动技能

    await playPhase(g, { player: huatuo });

    expect(huatuo.hp).toBe(3);
    expect(huatuo.hand.length).toBe(0); // 弃了 1 张
  });

  it('AI 只给自己回血：自己满血时即使他人受伤也不发动', async () => {
    const g = freshGame({}, ['华佗', '刘备', '孙权']);
    registerSkills(g);
    const huatuo = g.state.players[0];
    const liubei = g.state.players[1];
    liubei.hp = 1; // 他人受伤
    giveHand(huatuo, CardType.Shan);

    await playPhase(g, { player: huatuo });

    expect(huatuo.hand.length).toBe(1); // 未发动
    expect(liubei.hp).toBe(1);
  });
});
