// ============================================================
// 驻留 UsedCard（UC）— 模型与生命周期测试
//
// 覆盖：进入身份区建立 UC / 离开即销毁（不守恒）/ 顶掉换装 / 判定区与闪电转移 /
// 破坏倒查（多牌 UC 取走子集 → 剩余实体牌进弃牌堆）/ 对账不变量
// 注：UC 上挂技能/效果（grants/disabled/storage）与整体迁移语义尚未接线（见 TODO）。
// ============================================================

import { describe, it, expect } from 'vitest';

import {
  freshGame, giveHand, makeUniqueCard, equipAt, placeJudgment, clearJudgment,
} from '../test-utils.js';
import { moveCards, equipCard } from './cardActions.js';
import { judgePhase } from '../flow/gameFlow.js';
import { verifyCardState } from './cardAreaCheck.js';
import { residentUsedCardOf } from './usedCards.js';
import { CardType } from '../types.js';

describe('驻留 UsedCard：进入身份区建立', () => {
  it('装备进槽 → 建立 UC（as 视为自身、slot = 槽位、倒查命中）', () => {
    const g = freshGame();
    const p = g.state.players[0];
    const weapon = makeUniqueCard(CardType.QingLongYanYueDao);
    equipAt(g, p, weapon);

    const uc = g.usedCards.ofPhysical(weapon)!;
    expect(uc).toBeDefined();
    expect(uc.slot).toBe('weapon');
    expect(uc.name).toBe('青龙偃月刀');
    expect(uc.physicalCards).toEqual([weapon]);
    expect(g.usedCards.inZone(g, p, 'equipment')).toEqual([uc]);
    expect(g.usedCards.inSlot(g, p, 'weapon')).toEqual([uc]);
    expect(verifyCardState(g)).toEqual([]);
  });

  it('延时锦囊置入判定区 → 建立 UC（slot = judgment）', () => {
    const g = freshGame();
    const p = g.state.players[0];
    const lebu = makeUniqueCard(CardType.LeBu);
    placeJudgment(g, p, lebu);

    expect(g.usedCards.ofPhysical(lebu)?.slot).toBe('judgment');
    expect(g.usedCards.inZone(g, p, 'judgment').length).toBe(1);
    expect(verifyCardState(g)).toEqual([]);
  });

  it('同一实体牌重复绑定 UC → 抛错（唯一性硬校验）', () => {
    const g = freshGame();
    const p = g.state.players[0];
    const card = makeUniqueCard(CardType.BaGuaZhen);
    equipAt(g, p, card);

    expect(() => g.usedCards.register(residentUsedCardOf(card, 'armor'))).toThrow(/already bound/);
  });
});

describe('驻留 UsedCard：离开即销毁（不守恒）', () => {
  it('顶掉换装（equipCard）→ 旧 UC 销毁、新 UC 建立', async () => {
    const g = freshGame();
    const p = g.state.players[0];
    const oldWeapon = makeUniqueCard(CardType.QingLongYanYueDao);
    equipAt(g, p, oldWeapon);
    const newWeapon = makeUniqueCard(CardType.QiLinGong);
    giveHand(p, CardType.QiLinGong);
    p.hand.replaceAll([newWeapon]);

    await equipCard(g, p, newWeapon); // 真实路径：先 replace 旧装备，再 equip 新牌

    expect(g.usedCards.ofPhysical(oldWeapon)).toBeUndefined();
    expect(g.usedCards.ofPhysical(newWeapon)?.slot).toBe('weapon');
    expect(g.usedCards.size()).toBe(1);
    expect(g.state.discardPile.cards).toContain(oldWeapon); // 旧装备进弃牌堆
    expect(verifyCardState(g)).toEqual([]);
  });

  it('过河拆桥式取走装备 → UC 销毁（牌进弃牌堆）', async () => {
    const g = freshGame();
    const p = g.state.players[0];
    const armor = makeUniqueCard(CardType.RenWangDun);
    equipAt(g, p, armor);

    await moveCards(g, { to: { zone: 'discardPile' }, cards: [armor], reason: 'discard' });

    expect(g.usedCards.ofPhysical(armor)).toBeUndefined();
    expect(g.usedCards.size()).toBe(0);
    expect(g.state.discardPile.cards).toContain(armor);
    expect(verifyCardState(g)).toEqual([]);
  });

  it('判定区被清空（拆/结算）→ UC 随实体牌离开销毁', () => {
    const g = freshGame();
    const p = g.state.players[0];
    const lebu = makeUniqueCard(CardType.LeBu);
    placeJudgment(g, p, lebu);
    clearJudgment(g, p);

    expect(g.usedCards.ofPhysical(lebu)).toBeUndefined();
    expect(g.usedCards.size()).toBe(0);
  });

  it('闪电判定失败转移到下家 → 原 UC 销毁、下家建立新 UC', async () => {
    const g = freshGame();
    const p0 = g.state.players[0];
    const p1 = g.state.players[1];
    const shandian = makeUniqueCard(CardType.ShanDian);
    placeJudgment(g, p0, shandian);
    g.state.deck.replaceAll([makeUniqueCard(CardType.Tao, '♥', 5)]); // 红桃 → 不爆，转移

    await judgePhase(g, { player: p0 });

    expect(g.usedCards.ofPhysical(shandian)?.slot).toBe('judgment');
    expect(g.usedCards.inZone(g, p0, 'judgment').length).toBe(0);
    expect(g.usedCards.inZone(g, p1, 'judgment').map((uc) => uc.name)).toEqual(['闪电']);
    expect(verifyCardState(g)).toEqual([]);
  });
});

describe('驻留 UsedCard：破坏倒查（多牌 UC）', () => {
  it('取走多牌 UC 的一张 → UC 销毁且剩余实体牌进弃牌堆', async () => {
    const g = freshGame();
    const p = g.state.players[0];
    const a = makeUniqueCard(CardType.LeBu);
    const b = makeUniqueCard(CardType.ShanDian);
    placeJudgment(g, p, a, b);

    // 模拟"多牌转化的驻留 UC"（如 国色 类转化；标包暂无真实内容）：
    // 拆掉两张单卡 UC，登记一条覆盖两张实体牌的 UC（视为"乐不思蜀"）
    for (const card of [a, b]) {
      const single = g.usedCards.ofPhysical(card);
      if (single) g.usedCards.remove(single);
    }
    g.usedCards.register({
      type: CardType.LeBu,
      name: '乐不思蜀',
      suit: '♦',
      number: 5,
      physicalCards: [a, b],
      slot: 'judgment',
    });

    // 过河拆桥式取走其中一张
    await moveCards(g, { to: { zone: 'discardPile' }, cards: [a], reason: 'discard' });

    expect(g.usedCards.size()).toBe(0);                       // UC 已销毁
    expect(g.state.discardPile.cards).toContain(a);           // 被取走的那张按调用方语义进弃牌堆
    expect(g.state.discardPile.cards).toContain(b);           // 剩余实体牌被置入弃牌堆
    expect(p.judgment.cards.length).toBe(0);
    expect(verifyCardState(g)).toEqual([]);
  });
});

describe('驻留 UsedCard：对账不变量', () => {
  it('漏建 UC 会被 verifyCardState 检出', () => {
    const g = freshGame();
    const p = g.state.players[0];
    const armor = makeUniqueCard(CardType.BaGuaZhen);
    equipAt(g, p, armor);

    // 人为移除绑定（模拟漏建/漏销）
    g.usedCards.remove(g.usedCards.ofPhysical(armor)!);

    expect(verifyCardState(g).some((s) => s.includes('身份区缺 UC'))).toBe(true);
  });
});
