// ============================================================
// 标包装配：装进容器的内容齐不齐（原 cardRegistry.test.ts 的注册断言）
//
// 注意：这里断言的是**装配结果**，不是某个模块级注册表——
// 容器由本文件自己造（`createStandardContainer()`），不依赖任何 import 副作用。
// ============================================================

import { describe, it, expect } from 'vitest';

import { createStandardContainer } from './standardPack.js';
import { CardTag, CardType } from '../types.js';

const container = createStandardContainer();

describe('标包装配', () => {
  it('注册后可通过 get 获取（规则集只读视图）', () => {
    const def = container.cards.get(CardType.Sha);
    expect(def).toBeDefined();
    expect(def!.name).toBe('杀');
    expect(def!.emoji).toBe('🗡️');
  });

  it('获取未注册的类型返回 undefined', () => {
    expect(container.cards.get('不存在的牌' as CardType)).toBeUndefined();
  });

  it('all() 可遍历所有已注册卡牌', () => {
    const names = [...container.cards.all()].map((d) => d.name);
    for (const expected of [
      '杀', '桃', '南蛮入侵', '万箭齐发', '桃园结义', '五谷丰登',
      '乐不思蜀', '闪电', '诸葛连弩', '八卦阵', '绝影', '赤兔',
      '麒麟弓', '寒冰剑', '仁王盾', '过河拆桥', '顺手牵羊',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('每张注册牌都有 targetFilter', () => {
    for (const def of container.cards.all()) {
      expect(def.targetFilter).toBeTypeOf('function');
    }
  });

  it('基本牌 tag = Basic', () => {
    for (const t of [CardType.Sha, CardType.Shan, CardType.Tao]) {
      expect(container.cards.get(t)!.tags).toContain(CardTag.Basic);
    }
  });

  it('锦囊牌 tag = Trick', () => {
    for (const t of [CardType.WuZhong, CardType.JueDou, CardType.NanMan, CardType.WanJian, CardType.TaoYuan, CardType.WuGu, CardType.LeBu, CardType.GuoHe, CardType.ShunShou]) {
      expect(container.cards.get(t)!.tags).toContain(CardTag.Trick);
    }
  });

  it('延时锦囊 tag = Trick + Delay', () => {
    for (const t of [CardType.LeBu, CardType.ShanDian]) {
      expect(container.cards.get(t)!.tags).toContain(CardTag.Trick);
      expect(container.cards.get(t)!.tags).toContain(CardTag.Delay);
    }
  });

  it('装备牌 tag = Equip + 子类', () => {
    expect(container.cards.get(CardType.ZhugeLianNu)!.tags).toEqual(
      [CardTag.Equip, CardTag.Weapon],
    );
    expect(container.cards.get(CardType.BaGuaZhen)!.tags).toEqual(
      [CardTag.Equip, CardTag.Armor],
    );
    expect(container.cards.get(CardType.JueYing)!.tags).toEqual(
      [CardTag.Equip, CardTag.DefensiveHorse],
    );
    expect(container.cards.get(CardType.ChiTu)!.tags).toEqual(
      [CardTag.Equip, CardTag.OffensiveHorse],
    );
  });

  it('25 位武将与技能齐备（名字可查）', () => {
    expect([...container.heroes.all()].length).toBe(25);
    expect(container.heroes.get('刘备')?.skills).toContain('仁德');
    expect(container.skills.get('武圣')).toBeDefined();
  });

  it('装配是无副作用的显式函数：装到独立容器上互不影响', () => {
    const other = createStandardContainer();
    expect(other).not.toBe(container);
    expect(other.cards.get(CardType.Sha)!.name).toBe('杀');
  });
});
