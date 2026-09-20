// ============================================================
// 牌面助手（叶子层）：纯显示函数
// ============================================================

import { describe, it, expect } from 'vitest';

import { displayNumber, cardFaceText } from './cardFace.js';

describe('displayNumber', () => {
  it('A/1 → A', () => expect(displayNumber(1)).toBe('A'));
  it('11 → J', () => expect(displayNumber(11)).toBe('J'));
  it('12 → Q', () => expect(displayNumber(12)).toBe('Q'));
  it('13 → K', () => expect(displayNumber(13)).toBe('K'));
  it('普通数字原样返回', () => {
    expect(displayNumber(5)).toBe('5');
    expect(displayNumber(10)).toBe('10');
  });
});

describe('cardFaceText', () => {
  it('有花色点数 → 拼接', () => {
    expect(cardFaceText({ suit: '♠', number: 1 })).toBe('♠A');
  });

  it('无花色无点数（无牌/多牌转化）→ 空串，不打印 nullnull', () => {
    expect(cardFaceText({})).toBe('');
    expect(cardFaceText({ suit: null, number: null })).toBe('');
  });

  it('只有花色或只有点数 → 缺的部分留空', () => {
    expect(cardFaceText({ suit: '♥' })).toBe('♥');
    expect(cardFaceText({ number: 7 })).toBe('7');
  });
});
