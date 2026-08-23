// ============================================================
// 三国杀最小原型 — 出牌阶段选择编排单元测试
// SelectionSession 的第一个真实例子：动作选择（牌 + 技能）
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand } from './test-utils.js';

import { choosePlayAction } from './playChoices.js';

import { CardType } from './types.js';

describe('choosePlayAction', () => {
  it('手牌只有杀 → 选杀并带合法目标', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Sha);

    const result = await choosePlayAction(g, player, false, new Set());

    expect(result?.kind).toBe('card');
    if (result?.kind === 'card') {
      expect(result.card.type).toBe(CardType.Sha);
      expect(result.targets.length).toBe(1);
    }
  });

  it('孙权只有不可出牌 → 选制衡技能', async () => {
    const g = freshGame({}, ['刘备', '孙权', '曹操']);
    const sunquan = g.state.players[1];
    giveHand(sunquan, CardType.Shan, CardType.WuXie);

    const result = await choosePlayAction(g, sunquan, false, new Set());

    expect(result?.kind).toBe('skill');
    if (result?.kind === 'skill') {
      expect(result.skill.name).toBe('制衡');
    }
  });

  it('有可出牌时牌优先于技能', async () => {
    const g = freshGame({}, ['刘备', '孙权', '曹操']);
    const sunquan = g.state.players[1];
    const target = g.state.players[0];
    giveHand(sunquan, CardType.Sha);

    const result = await choosePlayAction(g, sunquan, false, new Set());

    expect(result?.kind).toBe('card');
    if (result?.kind === 'card') {
      expect(result.card.type).toBe(CardType.Sha);
      expect(result.targets).toContain(target);
    }
  });

  it('无可用牌且无可用技能 → null', async () => {
    const g = freshGame({}, ['刘备', '曹操', '孙权']);
    const liubei = g.state.players[0];

    expect(await choosePlayAction(g, liubei, false, new Set())).toBeNull();
  });

  it('桃受伤时目标优先自己', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    player.hp = 2;
    giveHand(player, CardType.Tao);

    const result = await choosePlayAction(g, player, false, new Set());

    expect(result?.kind).toBe('card');
    if (result?.kind === 'card') {
      expect(result.targets).toEqual([player]);
    }
  });
});
