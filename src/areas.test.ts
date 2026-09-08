// ============================================================
// 三国杀最小原型 — areas.ts 单元测试（玩家三区）
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, giveHand, makeUniqueCard, equipAt } from './test-utils.js';

import { cardsInAreas, hasCardsInAreas } from './areas.js';

import { CardType } from './types.js';

describe('区域枚举', () => {
  it('cardsInAreas 汇总手牌 + 装备区 + 判定区', () => {
    const g = freshGame();
    const p = g.state.players[0];
    giveHand(p, CardType.Sha, CardType.Tao);
    equipAt(g, p, makeUniqueCard(CardType.ZhugeLianNu));
    p.judgment.add(makeUniqueCard(CardType.LeBu));

    expect(cardsInAreas(p).length).toBe(4);
  });

  it('hasCardsInAreas：装备区/判定区有牌也算', () => {
    const g = freshGame();
    const p = g.state.players[0];
    expect(hasCardsInAreas(p)).toBe(false);

    // 判定区有牌也算
    p.judgment.add(makeUniqueCard(CardType.LeBu));
    expect(hasCardsInAreas(p)).toBe(true);

    // 装备区有牌也算（先清掉判定区，避免干扰）
    p.judgment.clear();
    equipAt(g, p, makeUniqueCard(CardType.BaGuaZhen));
    expect(hasCardsInAreas(p)).toBe(true);
  });
});
