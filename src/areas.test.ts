// ============================================================
// 三国杀最小原型 — areas.ts 单元测试（玩家三区）
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from './test-utils.js';

import {
  cardsInAreas,
  hasCardsInAreas,
  selectCardFromAreas,
} from './areas.js';

import { CardType } from './types.js';

describe('区域枚举', () => {
  it('cardsInAreas 汇总手牌 + 装备区 + 判定区', () => {
    const g = freshGame();
    const p = g.state.players[0];
    giveHand(p, CardType.Sha, CardType.Tao);
    p.equipment.weapon = makeUniqueCard(CardType.ZhugeLianNu);
    p.judgment.push(makeUniqueCard(CardType.LeBu));

    expect(cardsInAreas(p).length).toBe(4);
  });

  it('hasCardsInAreas：装备区/判定区有牌也算', () => {
    const g = freshGame();
    const p = g.state.players[0];
    expect(hasCardsInAreas(p)).toBe(false);

    p.equipment.armor = makeUniqueCard(CardType.BaGuaZhen);
    expect(hasCardsInAreas(p)).toBe(true);

    p.equipment.armor = undefined;
    p.judgment.push(makeUniqueCard(CardType.LeBu));
    expect(hasCardsInAreas(p)).toBe(true);
  });
});

describe('selectCardFromAreas', () => {
  it('区域内无牌 → null', () => {
    const g = freshGame();
    expect(selectCardFromAreas(g.state.players[0])).toBeNull();
  });

  it('指定区域过滤（只从装备区选）', () => {
    const g = freshGame();
    const p = g.state.players[0];
    giveHand(p, CardType.Sha);
    const weapon = makeUniqueCard(CardType.ZhugeLianNu);
    p.equipment.weapon = weapon;

    const card = selectCardFromAreas(p, { areas: ['equipment'] });
    expect(card).toBe(weapon);
  });
});
