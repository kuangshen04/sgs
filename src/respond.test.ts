// ============================================================
// 三国杀最小原型 — respond.ts 单元测试（杀 → 闪响应流程）
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from './test-utils.js';

import { resolveShaResponse } from './respond.js';

import type { ShaCancelledEventData } from './events/index.js';

import { CardType } from './types.js';
import type { ShaMarks } from './types.js';

describe('resolveShaResponse', () => {
  it('目标有闪 → 出闪并抵消（触发 shaCancelled）', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const defender = g.state.players[1];
    const sha = makeUniqueCard(CardType.Sha);
    giveHand(defender, CardType.Shan);
    const marks: ShaMarks = {};
    const captured = { data: null as ShaCancelledEventData | null };
    g.triggerSystem.on('shaCancelled.after', async (event) => {
      captured.data = event.data as ShaCancelledEventData;
    });

    const cancelled = await resolveShaResponse(g, attacker, defender, sha, marks);

    expect(cancelled).toBe(true);
    expect(defender.hand.length).toBe(0);
    expect(captured.data?.attacker).toBe(attacker);
    expect(captured.data?.defender).toBe(defender);
    expect(captured.data?.shanCount).toBe(1);
  });

  it('目标无闪 → 未抵消（不发 shaCancelled）', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const defender = g.state.players[1];
    const sha = makeUniqueCard(CardType.Sha);
    const marks: ShaMarks = {};
    const captured = { fired: false };
    g.triggerSystem.on('shaCancelled.after', async () => { captured.fired = true; });

    const cancelled = await resolveShaResponse(g, attacker, defender, sha, marks);

    expect(cancelled).toBe(false);
    expect(captured.fired).toBe(false);
  });

  it('无双（shanRequired=2）：两张闪都出才抵消，逐张询问', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const defender = g.state.players[1];
    const sha = makeUniqueCard(CardType.Sha);
    giveHand(defender, CardType.Shan, CardType.Shan);
    const marks: ShaMarks = { shanRequired: 2 };

    const cancelled = await resolveShaResponse(g, attacker, defender, sha, marks);

    expect(cancelled).toBe(true);
    expect(defender.hand.length).toBe(0);
  });

  it('无双：只出一张闪 → 未抵消（已出的闪不返还）', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const defender = g.state.players[1];
    const sha = makeUniqueCard(CardType.Sha);
    giveHand(defender, CardType.Shan, CardType.Tao); // 只有一张闪
    const marks: ShaMarks = { shanRequired: 2 };

    const cancelled = await resolveShaResponse(g, attacker, defender, sha, marks);

    expect(cancelled).toBe(false);
    expect(defender.hand.length).toBe(1); // 只剩桃，闪已打出
  });

  it('铁骑（unavoidable）：跳过响应，未抵消', async () => {
    const g = freshGame();
    const attacker = g.state.players[0];
    const defender = g.state.players[1];
    const sha = makeUniqueCard(CardType.Sha);
    giveHand(defender, CardType.Shan);
    const marks: ShaMarks = { unavoidable: true };
    const captured = { fired: false };
    g.triggerSystem.on('shaCancelled.after', async () => { captured.fired = true; });

    const cancelled = await resolveShaResponse(g, attacker, defender, sha, marks);

    expect(cancelled).toBe(false);
    expect(defender.hand.length).toBe(1); // 闪没被打出
    expect(captured.fired).toBe(false);
  });
});
