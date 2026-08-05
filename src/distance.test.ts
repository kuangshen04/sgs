// ============================================================
// 三国杀最小原型 — distance.ts 单元测试
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, makeUniqueCard } from './test-utils.js';

import { seatDistance, distanceTo, attackRange } from './distance.js';

import { CardType } from './types.js';

const fourPlayers = ['刘备', '曹操', '孙权', '郭嘉'];

describe('seatDistance', () => {
  it('3 人局：任意两人距离为 1', () => {
    const g = freshGame({}, ['刘备', '曹操', '孙权']);
    const [a, b, c] = g.state.players;
    expect(seatDistance(g.state.players, a, b)).toBe(1);
    expect(seatDistance(g.state.players, a, c)).toBe(1);
  });

  it('4 人局：相邻为 1，对位（索引差 2）为 2', () => {
    const g = freshGame({}, fourPlayers);
    const [a, b, c] = g.state.players;
    expect(seatDistance(g.state.players, a, b)).toBe(1);
    expect(seatDistance(g.state.players, a, c)).toBe(2);
    expect(seatDistance(g.state.players, c, a)).toBe(2);
  });

  it('2 人局：距离为 1', () => {
    const g = freshGame({}, ['刘备', '曹操']);
    const [a, b] = g.state.players;
    expect(seatDistance(g.state.players, a, b)).toBe(1);
  });
});

describe('distanceTo', () => {
  it('无修正时等于座位距离', () => {
    const g = freshGame({}, fourPlayers);
    const [a, , c] = g.state.players;
    expect(distanceTo(g.state.players, a, c)).toBe(2);
  });

  it('进攻马：来源距离-1', () => {
    const g = freshGame({}, fourPlayers);
    const [a, , c] = g.state.players;
    a.equipment.offensiveHorse = makeUniqueCard(CardType.ChiTu);
    expect(distanceTo(g.state.players, a, c)).toBe(1);
  });

  it('防御马：目标被接近距离+1', () => {
    const g = freshGame({}, fourPlayers);
    const [a, , c] = g.state.players;
    c.equipment.defensiveHorse = makeUniqueCard(CardType.JueYing);
    expect(distanceTo(g.state.players, a, c)).toBe(3);
  });

  it('多来源叠加且最低为 1（马术 + 进攻马 = -2）', () => {
    const g = freshGame({}, ['马超', '曹操', '孙权', '郭嘉']);
    const [machao, , c] = g.state.players;
    machao.equipment.offensiveHorse = makeUniqueCard(CardType.ChiTu);
    // 座位 2 - 马术 1 - 进攻马 1 = 0 → clamp 1
    expect(distanceTo(g.state.players, machao, c)).toBe(1);
  });
});

describe('attackRange', () => {
  it('无武器为 1', () => {
    const g = freshGame({}, fourPlayers);
    expect(attackRange(g.state.players[0])).toBe(1);
  });

  it('装备武器取卡牌攻击范围（诸葛连弩 1）', () => {
    const g = freshGame({}, fourPlayers);
    const p = g.state.players[0];
    p.equipment.weapon = makeUniqueCard(CardType.ZhugeLianNu);
    expect(attackRange(p)).toBe(1);
  });
});
