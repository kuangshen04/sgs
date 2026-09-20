// ============================================================
// 随机源：洗牌（当前 = Math.random，注入点见 rules/random.ts 头注释）
// ============================================================

import { describe, it, expect } from 'vitest';

import { shuffle } from './random.js';
import { makeCard } from '../test-utils.js';
import { CardType } from '../types.js';
import type { Card } from '../types.js';

function cards(...ids: number[]): Card[] {
  return ids.map((id) => makeCard(id, CardType.Sha));
}

describe('shuffle', () => {
  it('不改变数组长度', () => {
    const input = cards(1, 2, 3, 4, 5);
    expect(shuffle(input).length).toBe(input.length);
  });

  it('包含所有原元素', () => {
    const input = cards(1, 2, 3, 4, 5);
    const result = shuffle(input);
    const ids = (arr: Card[]) => [...arr].map((c) => c.id).sort((a, b) => a - b);
    expect(ids(result)).toEqual(ids(input));
  });

  it('不修改原数组', () => {
    const input = cards(1, 2, 3, 4, 5);
    const copy = [...input];
    shuffle(input);
    expect(input).toEqual(copy);
  });

  it('空数组返回空数组', () => {
    expect(shuffle([])).toEqual([]);
  });
});
