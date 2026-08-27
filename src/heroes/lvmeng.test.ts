// ============================================================
// 吕蒙 — 克己
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand } from '../test-utils.js';

import { discardPhase } from '../gameFlow.js';
import { registerSkills, skillRegistry } from '../skills.js';
import { heroRegistry } from '../heroRegistry.js';

import { CardType } from '../types.js';

describe('克己（吕蒙）', () => {
  it('skillRegistry 已注册克己，heroRegistry 已注册吕蒙', () => {
    expect(skillRegistry.get('克己')).toBeDefined();
    expect(heroRegistry.get('吕蒙')?.skills).toContain('克己');
  });

  it('本回合未用杀 → 跳过弃牌阶段', async () => {
    const g = freshGame({}, ['吕蒙', '刘备', '孙权']);
    registerSkills(g);
    const lv = g.state.players[0];
    lv.hp = 4;
    giveHand(lv, CardType.Shan, CardType.Shan, CardType.Shan, CardType.Shan, CardType.Shan);

    await discardPhase(g, { player: lv });

    expect(lv.hand.length).toBe(5); // 未弃牌
  });

  it('本回合用过杀 → 正常弃牌', async () => {
    const g = freshGame({}, ['吕蒙', '刘备', '孙权']);
    registerSkills(g);
    const lv = g.state.players[0];
    lv.hp = 4;
    lv.usedShaThisTurn = true;
    giveHand(lv, CardType.Shan, CardType.Shan, CardType.Shan, CardType.Shan, CardType.Shan);

    await discardPhase(g, { player: lv });

    expect(lv.hand.length).toBe(4); // 弃到上限
  });
});
