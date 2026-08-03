// ============================================================
// 三国杀最小原型 — gameFlow.ts 单元测试
// 阶段流程：出牌阶段（playPhase）
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand } from './test-utils.js';

import { playPhase } from './gameFlow.js';

import { CardType } from './types.js';

// ============================================================
// playPhase — 循环 choose + useCard（默认 AI，不注入 decider）
// ============================================================

describe('playPhase', () => {
  it('有杀出杀 → 循环打出', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const target = g.state.players[1];
    giveHand(player, CardType.Sha);
    const hpBefore = target.hp;

    await playPhase(g, { player, round: 1 });

    // 默认 AI 出杀
    expect(player.hand.length).toBe(0);
    expect(target.hp).toBe(hpBefore - 1);
  });

  it('无可用牌 → 不出牌', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    giveHand(player, CardType.Shan); // 闪不可主动使用

    await playPhase(g, { player, round: 1 });

    expect(player.hand.length).toBe(1);
  });

  it('多张可用牌 → 按优先级循环打出', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const target = g.state.players[1];
    giveHand(player, CardType.JueDou, CardType.Sha);
    const hpBefore = target.hp;

    await playPhase(g, { player, round: 1 });

    // 默认 AI：决斗(70) → 杀(60)，两轮循环
    expect(target.hp).toBe(hpBefore - 2);
    expect(player.hand.length).toBe(0);
  });
});
