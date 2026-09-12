// ============================================================
// 张辽 — 突袭
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand } from '../../test-utils.js';

import { drawPhase } from '../../flow/gameFlow.js';

import { skillRegistry } from '../../effects/effects.js';

import { CardType } from '../../types.js';

describe('突袭（张辽技能）', () => {
  it('skillRegistry 已注册突袭', () => {
    expect(skillRegistry.get('突袭')).toBeDefined();
  });

  it('摸牌阶段：摸牌数改为 0，随机获得其他角色手牌', async () => {
    const g = freshGame({}, ['刘备', '张辽', '孙权']);
    const zhangliao = g.state.players[1];
    const p1 = g.state.players[0];
    const p2 = g.state.players[2];
    giveHand(p1, CardType.Sha);
    giveHand(p2, CardType.Tao);
    const deckBefore = g.state.deck.cards.length;

    await drawPhase(g, { player: zhangliao });

    expect(zhangliao.hand.cards.length).toBe(2); // 各获得一张
    expect(p1.hand.cards.length).toBe(0);
    expect(p2.hand.cards.length).toBe(0);
    expect(g.state.deck.cards.length).toBe(deckBefore); // 未摸牌
  });
});
