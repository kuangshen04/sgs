// ============================================================
// 三国杀最小原型 — 标准版牌堆测试
// src/standardDeck.json 数据驱动（一副 108 张）
// ============================================================

import { describe, it, expect } from 'vitest';

import './cards.js'; // 触发卡牌注册（side-effect import）
import { STANDARD_DECK } from './cards.js';

import { CardType } from './types.js';

describe('STANDARD_DECK', () => {
  it('标准版牌堆共 108 张', () => {
    expect(STANDARD_DECK.length).toBe(108);
  });

  it('每张牌有 id/type/name/suit/number', () => {
    for (const card of STANDARD_DECK) {
      expect(card.id).toBeTypeOf('number');
      expect(card.type).toBeTypeOf('string');
      expect(card.name).toBeTypeOf('string');
      expect(card.suit).toBeTypeOf('string');
      expect(card.number).toBeTypeOf('number');
    }
  });

  it('基本牌数量：杀 30 / 闪 15 / 桃 8', () => {
    const count = (type: CardType) => STANDARD_DECK.filter((c) => c.type === type).length;
    expect(count(CardType.Sha)).toBe(30);
    expect(count(CardType.Shan)).toBe(15);
    expect(count(CardType.Tao)).toBe(8);
  });

  it('锦囊牌数量', () => {
    const count = (type: CardType) => STANDARD_DECK.filter((c) => c.type === type).length;
    expect(count(CardType.JueDou)).toBe(3);
    expect(count(CardType.NanMan)).toBe(3);
    expect(count(CardType.WanJian)).toBe(1);
    expect(count(CardType.TaoYuan)).toBe(1);
    expect(count(CardType.WuGu)).toBe(2);
    expect(count(CardType.GuoHe)).toBe(6);
    expect(count(CardType.ShunShou)).toBe(5);
    expect(count(CardType.WuZhong)).toBe(4);
    expect(count(CardType.JieDao)).toBe(2);
    expect(count(CardType.WuXie)).toBe(4);
    expect(count(CardType.LeBu)).toBe(3);
    expect(count(CardType.ShanDian)).toBe(2);
  });

  it('装备牌数量（武器/防具/马各一张，诸葛连弩与八卦阵各二）', () => {
    const count = (type: CardType) => STANDARD_DECK.filter((c) => c.type === type).length;
    // 武器
    expect(count(CardType.ZhugeLianNu)).toBe(2);
    expect(count(CardType.CiXiongShuangGuJian)).toBe(1);
    expect(count(CardType.QingGangJian)).toBe(1);
    expect(count(CardType.QingLongYanYueDao)).toBe(1);
    expect(count(CardType.ZhangBaSheMao)).toBe(1);
    expect(count(CardType.GuanShiFu)).toBe(1);
    expect(count(CardType.FangTianHuaJi)).toBe(1);
    expect(count(CardType.QiLinGong)).toBe(1);
    expect(count(CardType.HanBingJian)).toBe(1);
    // 防具
    expect(count(CardType.BaGuaZhen)).toBe(2);
    expect(count(CardType.RenWangDun)).toBe(1);
    // 马
    expect(count(CardType.JueYing)).toBe(1);
    expect(count(CardType.DiLu)).toBe(1);
    expect(count(CardType.ZhuaHuangFeiDian)).toBe(1);
    expect(count(CardType.ChiTu)).toBe(1);
    expect(count(CardType.DaYuan)).toBe(1);
    expect(count(CardType.ZiXin)).toBe(1);
  });

  it('关键牌花色点数与标包一致（麒麟弓♥5、寒冰剑♠2、八卦阵♠2/♣2）', () => {
    const has = (type: CardType, suit: string, number: number) =>
      STANDARD_DECK.some((c) => c.type === type && c.suit === suit && c.number === number);
    expect(has(CardType.QiLinGong, '♥', 5)).toBe(true);
    expect(has(CardType.HanBingJian, '♠', 2)).toBe(true);
    expect(has(CardType.BaGuaZhen, '♠', 2)).toBe(true);
    expect(has(CardType.BaGuaZhen, '♣', 2)).toBe(true);
  });
});
