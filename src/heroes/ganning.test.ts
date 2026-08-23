// ============================================================
// 甘宁 — 奇袭（转化牌）
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame } from '../test-utils.js';

import { playPhase } from '../gameFlow.js';
import { choosePlayAction } from '../playChoices.js';
import { registerSkills } from '../skills.js';
import { conversionRegistry } from '../conversions.js';
import { heroRegistry } from '../heroRegistry.js';

import { CardType } from '../types.js';

describe('奇袭（甘宁转化牌）', () => {
  it('conversionRegistry 已注册奇袭，heroRegistry 已注册甘宁', () => {
    expect(conversionRegistry.get('奇袭')).toBeDefined();
    expect(heroRegistry.get('甘宁')?.skills).toContain('奇袭');
  });

  it('choosePlayAction：黑牌当过河拆桥，返回 UsedCard 与合法目标', async () => {
    const g = freshGame({}, ['甘宁', '刘备', '孙权']);
    const ganning = g.state.players[0];
    const liubei = g.state.players[1];
    const black = { id: 9010, type: CardType.Shan, name: '闪', suit: '♠', number: 5 };
    ganning.hand = [black];
    liubei.hand = [{ id: 9011, type: CardType.Tao, name: '桃', suit: '♥', number: 2 }];

    const result = await choosePlayAction(g, ganning, false, new Set());

    expect(result?.kind).toBe('card');
    if (result?.kind === 'card') {
      expect(result.card.type).toBe(CardType.GuoHe);
      expect(result.card.physicalCards[0].id).toBe(black.id);
      expect(result.targets).toEqual([liubei]);
    }
  });

  it('出牌阶段：黑牌当过河拆桥，目标一张牌进弃牌堆', async () => {
    const g = freshGame({}, ['甘宁', '刘备', '孙权']);
    registerSkills(g);
    const ganning = g.state.players[0];
    const liubei = g.state.players[1];
    const black = { id: 9012, type: CardType.Shan, name: '闪', suit: '♣', number: 6 };
    const tao = { id: 9013, type: CardType.Tao, name: '桃', suit: '♥', number: 3 };
    ganning.hand = [black];
    liubei.hand = [tao];

    await playPhase(g, { player: ganning });

    expect(liubei.hand.length).toBe(0);
    expect(g.state.discardPile).toContain(black);
    expect(g.state.discardPile).toContain(tao);
    expect(ganning.hand.length).toBe(0);
  });
});
