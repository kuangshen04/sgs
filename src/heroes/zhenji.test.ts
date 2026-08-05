// ============================================================
// 甄宓 — 洛神
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, makeUniqueCard } from '../test-utils.js';

import { preparePhase } from '../gameFlow.js';

import { registerSkills, skillRegistry } from '../skills.js';

import { CardType } from '../types.js';

describe('洛神（甄宓技能）', () => {
  it('skillRegistry 已注册洛神', () => {
    expect(skillRegistry.get('洛神')).toBeDefined();
  });

  it('连续判定黑色 → 获得判定牌，红色停止', async () => {
    const g = freshGame({}, ['刘备', '甄宓', '孙权']);
    registerSkills(g);
    const zhenji = g.state.players[1];
    const black1 = makeUniqueCard(CardType.JueDou, '♣', 7);
    const black2 = makeUniqueCard(CardType.Sha, '♠', 5);
    const red = makeUniqueCard(CardType.Shan, '♥', 1);
    g.state.deck = [red, black2, black1]; // pop 顺序：black1 → black2 → red

    await preparePhase(g, { player: zhenji });

    expect(zhenji.hand.map((c) => c.id).sort((a, b) => a - b))
      .toEqual([black1.id, black2.id].sort((a, b) => a - b));
    expect(g.state.discardPile.find((c) => c.id === red.id)).toBeDefined(); // 红色判定牌留弃牌堆
    expect(g.state.deck.length).toBe(0); // 三张都被判定
  });

  it('判定为红色 → 不获得', async () => {
    const g = freshGame({}, ['刘备', '甄宓', '孙权']);
    registerSkills(g);
    const zhenji = g.state.players[1];
    const red = makeUniqueCard(CardType.Shan, '♥', 1);
    g.state.deck = [red];

    await preparePhase(g, { player: zhenji });

    expect(zhenji.hand.length).toBe(0);
    expect(g.state.discardPile.find((c) => c.id === red.id)).toBeDefined();
  });
});
