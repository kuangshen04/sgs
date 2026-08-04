// ============================================================
// 三国杀最小原型 — gameFlow.ts 单元测试
// 阶段流程：出牌阶段（playPhase）
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from './test-utils.js';

import { judgePhase, playPhase } from './gameFlow.js';

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

// ============================================================
// judgePhase — 判定阶段（延时锦囊结算）
// ============================================================

describe('judgePhase', () => {
  it('判定为红桃 → 乐不思蜀无事，进弃牌堆', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const lebu = makeUniqueCard(CardType.LeBu);
    player.judgment.push(lebu);
    g.state.deck = [makeUniqueCard(CardType.Tao, '♥', 2)]; // 判定：红桃

    await judgePhase(g, { player, round: 1 });

    expect(player.skipPlayPhase).toBeFalsy();
    expect(player.judgment.length).toBe(0);
    expect(g.state.discardPile.find((c) => c.id === lebu.id)).toBeDefined();
  });

  it('判定为非红桃 → 跳过出牌阶段', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const lebu = makeUniqueCard(CardType.LeBu);
    player.judgment.push(lebu);
    g.state.deck = [makeUniqueCard(CardType.JueDou, '♠', 5)]; // 判定：非红桃

    await judgePhase(g, { player, round: 1 });

    expect(player.skipPlayPhase).toBe(true);
    expect(player.judgment.length).toBe(0);
  });

  it('判定前被无懈 → 判定牌无效，不判定', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const lebu = makeUniqueCard(CardType.LeBu);
    player.judgment.push(lebu);
    giveHand(player, CardType.WuXie); // 被判定者出无懈保护自己
    const deckCard = makeUniqueCard(CardType.Sha, '♠', 5);
    g.state.deck = [deckCard];

    await judgePhase(g, { player, round: 1 });

    expect(player.skipPlayPhase).toBeFalsy();   // 未生效
    expect(player.judgment.length).toBe(0);     // 乐不思蜀被弃置
    expect(g.state.discardPile.find((c) => c.id === lebu.id)).toBeDefined();
    expect(g.state.deck).toContain(deckCard);   // 未判定，牌堆未动
    expect(player.hand.length).toBe(0);         // 无懈已打出
  });

  it('skipPlayPhase 标记 → playPhase 直接跳过', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    player.skipPlayPhase = true;
    giveHand(player, CardType.Sha);

    await playPhase(g, { player, round: 1 });

    expect(player.hand.length).toBe(1); // 未出牌
  });

  it('闪电判定为黑桃2~9 → 受到 3 点伤害', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const shandian = makeUniqueCard(CardType.ShanDian);
    player.judgment.push(shandian);
    g.state.deck = [makeUniqueCard(CardType.JueDou, '♠', 5)]; // 黑桃5
    const hpBefore = player.hp;

    await judgePhase(g, { player, round: 1 });

    expect(player.hp).toBe(hpBefore - 3);
    expect(player.judgment.length).toBe(0);
    expect(g.state.discardPile.find((c) => c.id === shandian.id)).toBeDefined();
  });

  it('闪电判定非黑桃2~9 → 移到下家判定区', async () => {
    const g = freshGame();
    const player = g.state.players[0];
    const next = g.state.players[1];
    const shandian = makeUniqueCard(CardType.ShanDian);
    player.judgment.push(shandian);
    g.state.deck = [makeUniqueCard(CardType.Tao, '♥', 5)]; // 红桃 → 不爆

    await judgePhase(g, { player, round: 1 });

    expect(player.judgment.length).toBe(0);
    expect(next.judgment.map((c) => c.id)).toContain(shandian.id);
    expect(g.state.discardPile.find((c) => c.id === shandian.id)).toBeUndefined();
  });
});
