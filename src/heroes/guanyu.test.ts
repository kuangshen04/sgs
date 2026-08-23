// ============================================================
// 关羽 — 武圣（转化牌）
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame } from '../test-utils.js';

import { playPhase } from '../gameFlow.js';
import { choosePlayAction } from '../playChoices.js';
import { registerSkills } from '../skills.js';
import { conversionRegistry } from '../conversions.js';
import { heroRegistry } from '../heroRegistry.js';

import { CardType } from '../types.js';

describe('武圣（关羽转化牌）', () => {
  it('conversionRegistry 已注册武圣，heroRegistry 已注册关羽', () => {
    expect(conversionRegistry.get('武圣')).toBeDefined();
    expect(heroRegistry.get('关羽')?.skills).toContain('武圣');
  });

  it('choosePlayAction：红牌当杀，返回 UsedCard 与合法目标', async () => {
    const g = freshGame({}, ['关羽', '刘备', '孙权']);
    const guanyu = g.state.players[0];
    guanyu.hand = [{ id: 9001, type: CardType.Shan, name: '闪', suit: '♥', number: 3 }];

    const result = await choosePlayAction(g, guanyu, false, new Set());

    expect(result?.kind).toBe('card');
    if (result?.kind === 'card') {
      expect(result.card.type).toBe(CardType.Sha);
      expect(result.card.physicalCards[0].suit).toBe('♥');
      expect(result.targets.length).toBe(1);
    }
  });

  it('出牌阶段：红牌当杀，造成伤害，实体牌回弃牌堆', async () => {
    const g = freshGame({}, ['关羽', '刘备', '孙权']);
    registerSkills(g);
    const guanyu = g.state.players[0];
    const target = g.state.players[1]; // 默认 AI：第一个其他存活角色（刘备）
    const red = { id: 9002, type: CardType.Shan, name: '闪', suit: '♦', number: 7 };
    guanyu.hand = [red];
    const hpBefore = target.hp;

    await playPhase(g, { player: guanyu });

    expect(target.hp).toBe(hpBefore - 1);
    expect(guanyu.hand.length).toBe(0);
    expect(g.state.processing.length).toBe(0);
    expect(g.state.discardPile).toContain(red);
  });

  it('奸雄获得武圣对应的实体源牌', async () => {
    const g = freshGame({}, ['关羽', '曹操', '孙权']);
    registerSkills(g);
    const guanyu = g.state.players[0];
    const caocao = g.state.players[1];
    const red = { id: 9003, type: CardType.Shan, name: '闪', suit: '♥', number: 9 };
    guanyu.hand = [red];
    const hpBefore = caocao.hp;

    await playPhase(g, { player: guanyu });

    expect(caocao.hp).toBe(hpBefore - 1);
    expect(caocao.hand.map((c) => c.id)).toContain(red.id);
    expect(g.state.discardPile).not.toContain(red);
    expect(g.state.processing.length).toBe(0);
  });

  it('没有红色牌时武圣不作为动作候选', async () => {
    const g = freshGame({}, ['关羽', '刘备', '孙权']);
    const guanyu = g.state.players[0];
    guanyu.hand = [{ id: 9004, type: CardType.Shan, name: '闪', suit: '♠', number: 1 }];

    expect(await choosePlayAction(g, guanyu, false, new Set())).toBeNull();
  });
});
