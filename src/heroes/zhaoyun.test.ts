// ============================================================
// 赵云 — 龙胆①（闪当杀，转化牌）
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame } from '../test-utils.js';

import { playPhase } from '../gameFlow.js';
import { choosePlayAction } from '../playChoices.js';
import { registerSkills } from '../skills.js';
import { conversionRegistry } from '../conversions.js';
import { heroRegistry } from '../heroRegistry.js';

import { CardType } from '../types.js';

describe('龙胆①（赵云转化牌）', () => {
  it('conversionRegistry 已注册龙胆，heroRegistry 已注册赵云', () => {
    expect(conversionRegistry.get('龙胆')).toBeDefined();
    expect(heroRegistry.get('赵云')?.skills).toContain('龙胆');
  });

  it('choosePlayAction：闪当杀，返回 UsedCard 与合法目标', async () => {
    const g = freshGame({}, ['赵云', '刘备', '孙权']);
    const zhaoyun = g.state.players[0];
    const shan = { id: 9020, type: CardType.Shan, name: '闪', suit: '♦', number: 4 };
    zhaoyun.hand = [shan];

    const result = await choosePlayAction(g, zhaoyun, false, new Set());

    expect(result?.kind).toBe('card');
    if (result?.kind === 'card') {
      expect(result.card.type).toBe(CardType.Sha);
      expect(result.card.physicalCards[0].id).toBe(shan.id);
      expect(result.targets.length).toBe(1);
    }
  });

  it('出牌阶段：闪当杀，造成伤害，实体闪回弃牌堆', async () => {
    const g = freshGame({}, ['赵云', '刘备', '孙权']);
    registerSkills(g);
    const zhaoyun = g.state.players[0];
    const target = g.state.players[1];
    const shan = { id: 9021, type: CardType.Shan, name: '闪', suit: '♥', number: 8 };
    zhaoyun.hand = [shan];
    const hpBefore = target.hp;

    await playPhase(g, { player: zhaoyun });

    expect(target.hp).toBe(hpBefore - 1);
    expect(zhaoyun.hand.length).toBe(0);
    expect(g.state.discardPile).toContain(shan);
    expect(g.state.processing.length).toBe(0);
  });
});
