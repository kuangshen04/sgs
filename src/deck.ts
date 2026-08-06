// ============================================================
// 三国杀最小原型 — 标准版牌堆（数据驱动）
// 直接读取 src/standardDeck.json（一副 108 张的精确配置，
// 数据源自 docs/标包牌堆.json 的副本），
// 生成 Card[]。卡牌定义仍由 cards.ts 注册，此处只做数据映射。
// ============================================================

import deckData from './standardDeck.json' with { type: 'json' };
import { cardRegistry } from './cardRegistry.js';
import { CardType } from './types.js';
import type { Card } from './types.js';

/** 标包牌堆 JSON 的英文卡名 → CardType */
const CARD_NAME_MAP: Record<string, CardType> = {
  sha: CardType.Sha,
  shan: CardType.Shan,
  tao: CardType.Tao,
  bagua: CardType.BaGuaZhen,
  jueying: CardType.JueYing,
  dilu: CardType.DiLu,
  zhuahuang: CardType.ZhuaHuangFeiDian,
  chitu: CardType.ChiTu,
  dawan: CardType.DaYuan,
  zixin: CardType.ZiXin,
  zhuge: CardType.ZhugeLianNu,
  cixiong: CardType.CiXiongShuangGuJian,
  qinggang: CardType.QingGangJian,
  qinglong: CardType.QingLongYanYueDao,
  zhangba: CardType.ZhangBaSheMao,
  guanshi: CardType.GuanShiFu,
  fangtian: CardType.FangTianHuaJi,
  qilin: CardType.QiLinGong,
  wugu: CardType.WuGu,
  taoyuan: CardType.TaoYuan,
  nanman: CardType.NanMan,
  wanjian: CardType.WanJian,
  juedou: CardType.JueDou,
  wuzhong: CardType.WuZhong,
  shunshou: CardType.ShunShou,
  guohe: CardType.GuoHe,
  jiedao: CardType.JieDao,
  wuxie: CardType.WuXie,
  lebu: CardType.LeBu,
  shandian: CardType.ShanDian,
  hanbing: CardType.HanBingJian,
  renwang: CardType.RenWangDun,
};

/** 标包牌堆 JSON 的花色 → 显示字符 */
const SUIT_MAP: Record<string, string> = {
  spade: '♠',
  heart: '♥',
  club: '♣',
  diamond: '♦',
};

/**
 * 从 src/standardDeck.json 生成标准版牌堆（一副 108 张，id 从 startId 递增）。
 * 数据中出现的卡若未在 cardRegistry 注册会被跳过并警告（防止漏注册）。
 */
export function buildStandardDeck(startId = 1): Card[] {
  const deck: Card[] = [];
  let next = startId;
  for (const entry of deckData) {
    const type = CARD_NAME_MAP[entry.name];
    if (!type) {
      console.warn(`标包牌堆数据中的 "${entry.name}" 无对应 CardType，跳过`);
      continue;
    }
    const def = cardRegistry.get(type);
    if (!def) {
      console.warn(`CardDef "${type}" 未注册，牌堆跳过该牌`);
      continue;
    }
    deck.push({
      id: next++,
      type,
      name: def.name,
      suit: SUIT_MAP[entry.suit] ?? entry.suit,
      number: entry.number,
    });
  }
  return deck;
}
