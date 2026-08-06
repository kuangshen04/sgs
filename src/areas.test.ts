// ============================================================
// 三国杀最小原型 — areas.ts 单元测试（玩家三区）
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard } from './test-utils.js';

import {
  cardsInAreas,
  hasCardsInAreas,
  selectCardFromAreas,
  takeCardFromAreas,
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

describe('takeCardFromAreas', () => {
  it('从手牌移除', () => {
    const g = freshGame();
    const p = g.state.players[0];
    giveHand(p, CardType.Sha, CardType.Tao);
    const card = p.hand[0];

    expect(takeCardFromAreas(p, card)).toBe(true);
    expect(p.hand).not.toContain(card);
  });

  it('从装备区移除（清空对应槽位）', () => {
    const g = freshGame();
    const p = g.state.players[0];
    const weapon = makeUniqueCard(CardType.ZhugeLianNu);
    p.equipment.weapon = weapon;

    expect(takeCardFromAreas(p, weapon)).toBe(true);
    expect(p.equipment.weapon).toBeUndefined();
  });

  it('从判定区移除', () => {
    const g = freshGame();
    const p = g.state.players[0];
    const lebu = makeUniqueCard(CardType.LeBu);
    p.judgment.push(lebu);

    expect(takeCardFromAreas(p, lebu)).toBe(true);
    expect(p.judgment).not.toContain(lebu);
  });

  it('牌不在任何区域 → 返回 false', () => {
    const g = freshGame();
    const p = g.state.players[0];
    const phantom = makeUniqueCard(CardType.Sha);

    expect(takeCardFromAreas(p, phantom)).toBe(false);
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
