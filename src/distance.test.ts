// ============================================================
// 三国杀最小原型 — distance.ts 单元测试
// ============================================================

import { describe, it, expect } from 'vitest';

import { freshGame, makeUniqueCard } from './test-utils.js';

import { cardRegistry } from './cardRegistry.js';
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

  it.each([
    [CardType.QingGangJian, 2],
    [CardType.QingLongYanYueDao, 3],
    [CardType.ZhangBaSheMao, 3],
    [CardType.GuanShiFu, 3],
    [CardType.FangTianHuaJi, 4],
  ] as const)('白板武器 %s 攻击范围 %i', (type, range) => {
    const g = freshGame({}, fourPlayers);
    const p = g.state.players[0];
    p.equipment.weapon = makeUniqueCard(type);
    expect(attackRange(p)).toBe(range);
  });
});

describe('杀的 targetFilter 与攻击范围', () => {
  const fourPlayers = ['刘备', '曹操', '孙权', '郭嘉'];

  const shaDef = () => cardRegistry.get(CardType.Sha)!;

  it('无武器（攻击范围 1）：杀不到对位（距离 2）目标', () => {
    const g = freshGame({}, fourPlayers);
    const [a, b, c, d] = g.state.players;

    const targets = shaDef().targetFilter(a, g.state.players);

    expect(targets.map((p) => p.name)).not.toContain(c.name); // 对位不可达
    expect(targets.map((p) => p.name)).toEqual(expect.arrayContaining([b.name, d.name])); // 相邻可达
  });

  it('装备麒麟弓（攻击范围 5）：可以杀到对位目标', () => {
    const g = freshGame({}, fourPlayers);
    const [a, , c] = g.state.players;
    a.equipment.weapon = makeUniqueCard(CardType.QiLinGong);

    const targets = shaDef().targetFilter(a, g.state.players);

    expect(targets.map((p) => p.name)).toContain(c.name);
  });

  it('装备寒冰剑（攻击范围 2）：距离 2 的目标恰好可达', () => {
    const g = freshGame({}, fourPlayers);
    const [a, , c] = g.state.players;
    a.equipment.weapon = makeUniqueCard(CardType.HanBingJian);

    const targets = shaDef().targetFilter(a, g.state.players);

    expect(targets.map((p) => p.name)).toContain(c.name);
  });

  it('攻击范围不影响顺手牵羊（固定距离 1）', () => {
    const g = freshGame({}, fourPlayers);
    const [a, , c] = g.state.players;
    c.hand = [makeUniqueCard(CardType.Sha)]; // 区域内有牌
    a.equipment.weapon = makeUniqueCard(CardType.QiLinGong);

    const targets = cardRegistry.get(CardType.ShunShou)!.targetFilter(a, g.state.players);

    expect(targets.map((p) => p.name)).not.toContain(c.name); // 距离 2 > 1，麒麟弓不生效
  });
});
