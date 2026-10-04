import { describe, expect, expectTypeOf, it } from 'vitest';

import { createPlayer, playerId, type Player } from '../player/player.js';
import {
  counterclockwiseFrom,
  createSeating,
  seatNumberOf,
  type Seating,
} from './seating.js';

function makePlayer(id: string): Player {
  return createPlayer({ id: playerId(id), label: id });
}

describe('Seating', () => {
  it('运行时是输入数组的可变副本，公开类型具有独立语义', () => {
    const players = [makePlayer('A'), makePlayer('B')];
    const seating = createSeating(players);

    expectTypeOf<Seating>().not.toEqualTypeOf<readonly Player[]>();
    expect(Array.isArray(seating)).toBe(true);
    expect(Object.isFrozen(seating)).toBe(false);
    expect(seating).not.toBe(players);

    players.reverse();
    expect(seating.map(player => player.id)).toEqual(['A', 'B']);
  });

  it('拒绝相同实例或不同实例使用重复 PlayerId', () => {
    const player = makePlayer('A');
    expect(() => createSeating([player, player]))
      .toThrow(/重复 PlayerId“A”/);

    expect(() => createSeating([makePlayer('A'), makePlayer('A')]))
      .toThrow(/重复 PlayerId“A”/);
  });

  it('座位号采用 1-based，并按 Player 实例查找', () => {
    const players = [makePlayer('A'), makePlayer('B'), makePlayer('C')];
    const seating = createSeating(players);

    expect(seatNumberOf(seating, players[0])).toBe(1);
    expect(seatNumberOf(seating, players[1])).toBe(2);
    expect(seatNumberOf(seating, players[2])).toBe(3);
    expect(() => seatNumberOf(seating, makePlayer('B')))
      .toThrow(/不属于当前 Seating/);
  });

  it('从当前玩家开始按数组的逆时针方向遍历并返回稳定快照', () => {
    const players = [
      makePlayer('A'),
      makePlayer('B'),
      makePlayer('C'),
      makePlayer('D'),
    ];
    const seating = createSeating(players);
    const order = counterclockwiseFrom(seating, players[2]);

    expect(order.map(player => player.id)).toEqual(['C', 'D', 'A', 'B']);
    expect(Object.isFrozen(order)).toBe(true);

    // 模拟未来 Seating 模块在换座事件 content 内修改同一个底层数组。
    (seating as unknown as Player[]).reverse();
    expect(order.map(player => player.id)).toEqual(['C', 'D', 'A', 'B']);
    expect(counterclockwiseFrom(seating, players[2]).map(player => player.id))
      .toEqual(['C', 'B', 'A', 'D']);
  });

  it('空 Seating 合法，但不能查询不属于它的 Player', () => {
    const seating = createSeating([]);
    expect(seating).toEqual([]);
    expect(() => counterclockwiseFrom(seating, makePlayer('A')))
      .toThrow(/不属于当前 Seating/);
  });
});
