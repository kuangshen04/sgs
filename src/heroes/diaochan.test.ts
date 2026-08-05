// ============================================================
// 貂蝉 — 闭月
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame } from '../test-utils.js';

import { endPhase, turn } from '../gameFlow.js';

import { registerSkills, skillRegistry } from '../skills.js';

const diaochanHeroes = ['刘备', '貂蝉', '孙权'];

describe('闭月（貂蝉技能）', () => {
  it('skillRegistry 已注册闭月', () => {
    expect(skillRegistry.get('闭月')).toBeDefined();
  });

  it('结束阶段 → 摸 1 张牌', async () => {
    const g = freshGame({}, diaochanHeroes);
    registerSkills(g);
    const diaochan = g.state.players[1];
    const before = diaochan.hand.length;

    await endPhase(g, { player: diaochan });

    expect(diaochan.hand.length).toBe(before + 1);
  });

  it('回合结束 → 摸 1 张牌', async () => {
    const g = freshGame({}, diaochanHeroes);
    registerSkills(g);
    g.deciders.cardDecide = () => null; // 出牌阶段不出牌，保证结果确定
    const diaochan = g.state.players[1];
    const before = diaochan.hand.length;

    await turn(g, { player: diaochan });

    // 摸牌阶段 2 张 + 闭月 1 张
    expect(diaochan.hand.length).toBe(before + 3);
  });

  it('非貂蝉回合 → 不触发闭月', async () => {
    const g = freshGame({}, diaochanHeroes);
    registerSkills(g);
    g.deciders.cardDecide = () => null; // 出牌阶段不出牌，保证结果确定
    const liubei = g.state.players[0];
    const before = liubei.hand.length;

    await turn(g, { player: liubei });

    // 只有摸牌阶段 2 张
    expect(liubei.hand.length).toBe(before + 2);
  });
});
