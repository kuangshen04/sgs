// ============================================================
// 三国杀最小原型 — cardRegistry.ts 单元测试
// 纯函数（displayNumber/shuffle）与卡牌注册表
// ============================================================

import { describe, it, expect } from 'vitest';

import './cards/index.js'; // 触发卡牌注册（side-effect import）
import { displayNumber, cardRegistry, shuffle } from './cardRegistry.js';

import { makeCard } from './test-utils.js';

import { CardTag, CardType } from './types.js';
import type { Card } from './types.js';

// ============================================================
// 纯函数
// ============================================================

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

describe('shuffle', () => {
  function cards(...ids: number[]): Card[] {
    return ids.map((id) => makeCard(id, CardType.Sha));
  }

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

// ============================================================
// 卡牌注册表
// ============================================================

describe('cardRegistry', () => {
  it('注册后可通过 get 获取', () => {
    const def = cardRegistry.get(CardType.Sha);
    expect(def).toBeDefined();
    expect(def!.name).toBe('杀');
    expect(def!.emoji).toBe('🗡️');
  });

  it('获取未注册的类型返回 undefined', () => {
    // @ts-expect-error 故意测试不存在的类型
    expect(cardRegistry.get('不存在的牌')).toBeUndefined();
  });

  it('all() 可遍历所有已注册卡牌', () => {
    const all = [...cardRegistry.all()];
    expect(all.length).toBeGreaterThanOrEqual(5);
    const names = all.map((d) => d.name);
    expect(names).toContain('杀');
    expect(names).toContain('桃');
    expect(names).toContain('南蛮入侵');
    expect(names).toContain('万箭齐发');
    expect(names).toContain('桃园结义');
    expect(names).toContain('五谷丰登');
    expect(names).toContain('乐不思蜀');
    expect(names).toContain('闪电');
    expect(names).toContain('诸葛连弩');
    expect(names).toContain('八卦阵');
    expect(names).toContain('绝影');
    expect(names).toContain('赤兔');
    expect(names).toContain('麒麟弓');
    expect(names).toContain('寒冰剑');
    expect(names).toContain('仁王盾');
    expect(names).toContain('过河拆桥');
    expect(names).toContain('顺手牵羊');
  });

  it('每张注册牌都有 targetFilter', () => {
    for (const def of cardRegistry.all()) {
      expect(def.targetFilter).toBeTypeOf('function');
    }
  });

  it('基本牌 tag = Basic', () => {
    for (const t of [CardType.Sha, CardType.Shan, CardType.Tao]) {
      expect(cardRegistry.get(t)!.tags).toContain(CardTag.Basic);
    }
  });

  it('锦囊牌 tag = Trick', () => {
    for (const t of [CardType.WuZhong, CardType.JueDou, CardType.NanMan, CardType.WanJian, CardType.TaoYuan, CardType.WuGu, CardType.LeBu, CardType.GuoHe, CardType.ShunShou]) {
      expect(cardRegistry.get(t)!.tags).toContain(CardTag.Trick);
    }
  });

  it('延时锦囊 tag = Trick + Delay', () => {
    for (const t of [CardType.LeBu, CardType.ShanDian]) {
      expect(cardRegistry.get(t)!.tags).toContain(CardTag.Trick);
      expect(cardRegistry.get(t)!.tags).toContain(CardTag.Delay);
    }
  });

  it('装备牌 tag = Equip + 子类', () => {
    expect(cardRegistry.get(CardType.ZhugeLianNu)!.tags).toEqual(
      [CardTag.Equip, CardTag.Weapon],
    );
    expect(cardRegistry.get(CardType.BaGuaZhen)!.tags).toEqual(
      [CardTag.Equip, CardTag.Armor],
    );
    expect(cardRegistry.get(CardType.JueYing)!.tags).toEqual(
      [CardTag.Equip, CardTag.DefensiveHorse],
    );
    expect(cardRegistry.get(CardType.ChiTu)!.tags).toEqual(
      [CardTag.Equip, CardTag.OffensiveHorse],
    );
  });
});
