// ============================================================
// UsedCard（UC）— 模型、生命周期与两层边界测试（adr/0003 / R1）
//
// 覆盖：进入驻留区建立 UC / 离开即销毁（不守恒）/ 顶掉换装 / UC 迁移（闪电）/
// 破坏倒查（多牌 UC）/ 处理区单向约束 / 驻留区终点硬报错 / 对账不变量。
// 注：UC 上挂技能/效果（grants/disabled/storage）与迁移时的重新归属尚未接线（见 TODO R3/R4）。
// ============================================================

import { describe, it, expect } from 'vitest';

import {
  freshGame, giveHand, makeUniqueCard, equipAt, placeJudgment, clearJudgment,
} from '../test-utils.js';
import { moveCards } from './cardActions.js';
import {
  equipCard, enterUsedCard, moveUsedCard, playUsedCard, settleUsedCard,
} from './usedCardActions.js';
import { judgePhase } from '../flow/gameFlow.js';
import { useCard } from '../flow/useCard.js';
import { verifyCardState } from './cardAreaCheck.js';
import { EventType } from '../events/index.js';
import type { CardMoveEventData } from '../events/index.js';
import { CardType } from '../types.js';

describe('UC：进入驻留区建立', () => {
  it('装备进槽 → 建立 UC（规则身份视为自身、loc 记槽位、倒查命中）', () => {
    const g = freshGame();
    const p = g.state.players[0];
    const weapon = makeUniqueCard(CardType.QingLongYanYueDao);
    equipAt(g, p, weapon);

    const uc = g.usedCards.ofCard(weapon)!;
    expect(uc).toBeDefined();
    expect(uc.loc).toEqual({ kind: 'equipment', player: p, slot: 'weapon' });
    expect(uc.name).toBe('青龙偃月刀');
    expect(uc.physicalCards).toEqual([weapon]);
    expect(g.usedCards.at({ kind: 'equipment', player: p, slot: 'weapon' })).toEqual([uc]);
    expect(verifyCardState(g)).toEqual([]);
  });

  it('延时锦囊置入判定区 → 建立 UC（loc = judgment）', () => {
    const g = freshGame();
    const p = g.state.players[0];
    const lebu = makeUniqueCard(CardType.LeBu);
    placeJudgment(g, p, lebu);

    const uc = g.usedCards.ofCard(lebu)!;
    expect(uc.loc).toEqual({ kind: 'judgment', player: p });
    expect(g.usedCards.at({ kind: 'judgment', player: p })).toEqual([uc]);
    expect(verifyCardState(g)).toEqual([]);
  });

  it('使用延时锦囊（useCard）→ UC 经 UC 层进入目标判定区', async () => {
    const g = freshGame();
    const [p0, p1] = g.state.players;
    const lebu = makeUniqueCard(CardType.LeBu);
    giveHand(p0);
    p0.hand.replaceAll([lebu]);

    await useCard(g, { player: p0, card: lebu, targets: [p1] });

    const uc = g.usedCards.ofCard(lebu)!;
    expect(uc.loc).toEqual({ kind: 'judgment', player: p1 });
    expect(p1.judgment.cards).toEqual([lebu]);
    expect(verifyCardState(g)).toEqual([]);
  });

  it('同一实体牌重复绑定 UC → 抛错（唯一性硬校验）', () => {
    const g = freshGame();
    const p = g.state.players[0];
    const card = makeUniqueCard(CardType.BaGuaZhen);
    equipAt(g, p, card);

    const again = g.usedCards.create(card, [card]);
    expect(() => g.usedCards.bind(again, { kind: 'equipment', player: p, slot: 'armor' }))
      .toThrow(/已绑定|already/);
  });

  it('已在容器中的 UC 再次 enter → 抛错；未入容器的 UC move → 抛错', async () => {
    const g = freshGame();
    const p = g.state.players[0];
    const armor = makeUniqueCard(CardType.BaGuaZhen);
    equipAt(g, p, armor);
    const uc = g.usedCards.ofCard(armor)!;

    await expect(enterUsedCard(g, uc, { kind: 'judgment', player: p }, { reason: 'use' }))
      .rejects.toThrow(/已在容器中/);

    const fresh = g.usedCards.create(makeUniqueCard(CardType.LeBu), []);
    await expect(moveUsedCard(g, fresh, { kind: 'processing' }, { reason: 'use' }))
      .rejects.toThrow(/不在任何容器/);
  });
});

describe('UC：离开驻留区即销毁（不守恒）', () => {
  it('顶掉换装（equipCard）→ 旧 UC 销毁、新 UC 建立', async () => {
    const g = freshGame();
    const p = g.state.players[0];
    const oldWeapon = makeUniqueCard(CardType.QingLongYanYueDao);
    equipAt(g, p, oldWeapon);
    const newWeapon = makeUniqueCard(CardType.QiLinGong);
    p.hand.replaceAll([newWeapon]);

    await equipCard(g, p, newWeapon); // 真实路径：先 replace 旧装备，再 equip 新牌

    expect(g.usedCards.ofCard(oldWeapon)).toBeUndefined();
    expect(g.usedCards.ofCard(newWeapon)?.loc).toEqual({
      kind: 'equipment', player: p, slot: 'weapon',
    });
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

    expect(g.usedCards.ofCard(armor)).toBeUndefined();
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

    expect(g.usedCards.ofCard(lebu)).toBeUndefined();
    expect(g.usedCards.size()).toBe(0);
  });

  it('闪电判定失败转移 → **同一条 UC 迁移**到下家（id 不变、loc 变）', async () => {
    const g = freshGame();
    const p0 = g.state.players[0];
    const p1 = g.state.players[1];
    const shandian = makeUniqueCard(CardType.ShanDian);
    placeJudgment(g, p0, shandian);
    const before = g.usedCards.ofCard(shandian)!;
    g.state.deck.replaceAll([makeUniqueCard(CardType.Tao, '♥', 5)]); // 红桃 → 不爆，转移

    await judgePhase(g, { player: p0 });

    const after = g.usedCards.ofCard(shandian)!;
    expect(after).toBe(before);                                  // 迁移而非销毁重建
    expect(after.id).toBe(before.id);
    expect(after.loc).toEqual({ kind: 'judgment', player: p1 });
    expect(g.usedCards.at({ kind: 'judgment', player: p0 })).toEqual([]);
    expect(g.usedCards.at({ kind: 'judgment', player: p1 }).map((uc) => uc.name))
      .toEqual(['闪电']);
    expect(verifyCardState(g)).toEqual([]);
  });
});

describe('UC：破坏倒查（多牌 UC）', () => {
  it('取走多牌 UC 的一张 → UC 销毁且剩余实体牌进弃牌堆', async () => {
    const g = freshGame();
    const p = g.state.players[0];
    const a = makeUniqueCard(CardType.LeBu);
    const b = makeUniqueCard(CardType.ShanDian);
    placeJudgment(g, p, a, b);

    // 造一条覆盖两张实体牌的 UC（视为"乐不思蜀"；标包暂无真实的多牌转化内容）
    for (const card of [a, b]) {
      const single = g.usedCards.ofCard(card);
      if (single) g.usedCards.unbind(single);
    }
    const merged = g.usedCards.create(
      { type: CardType.LeBu, name: '乐不思蜀', suit: '♦', number: 5 }, [a, b],
    );
    g.usedCards.bind(merged, { kind: 'judgment', player: p });

    // 过河拆桥式取走其中一张
    await moveCards(g, { to: { zone: 'discardPile' }, cards: [a], reason: 'discard' });

    expect(g.usedCards.size()).toBe(0);                       // UC 已销毁
    expect(g.state.discardPile.cards).toContain(a);           // 被取走的那张按调用方语义进弃牌堆
    expect(g.state.discardPile.cards).toContain(b);           // 剩余实体牌被置入弃牌堆
    expect(p.judgment.cards.length).toBe(0);
    expect(verifyCardState(g)).toEqual([]);
  });
});

describe('UC：处理区是单向约束', () => {
  it('处理区可以停没有 UC 的实体牌（判定牌 / 观星亮出）', async () => {
    const g = freshGame();
    const p = g.state.players[0];
    const card = makeUniqueCard(CardType.Sha);
    p.hand.replaceAll([card]);

    await moveCards(g, { to: { zone: 'processing' }, cards: [card], reason: 'reveal' });

    expect(g.usedCards.size()).toBe(0);
    expect(g.usedCards.ofCard(card)).toBeUndefined();
    expect(verifyCardState(g)).toEqual([]); // 处理区不要求 UC
  });

  it('UC 可迁入处理区并结算收尾（settle），不影响同区无 UC 的牌', async () => {
    const g = freshGame();
    const p = g.state.players[0];
    const lebu = makeUniqueCard(CardType.LeBu);
    const judgmentCard = makeUniqueCard(CardType.Sha);
    placeJudgment(g, p, lebu);
    const uc = g.usedCards.ofCard(lebu)!;
    p.hand.replaceAll([judgmentCard]);
    await moveCards(g, { to: { zone: 'processing' }, cards: [judgmentCard], reason: 'judge' });

    await moveUsedCard(g, uc, { kind: 'processing' }, { reason: 'resolve' });
    expect(uc.loc).toEqual({ kind: 'processing' });
    expect(verifyCardState(g)).toEqual([]);

    await settleUsedCard(g, uc, 'resolve');
    expect(g.usedCards.size()).toBe(0);
    expect(g.state.discardPile.cards).toContain(lebu);
    expect(g.state.processing.cards).toEqual([judgmentCard]); // 无 UC 的牌不受影响
    expect(verifyCardState(g)).toEqual([]);
  });
});

describe('UC：驻留区终点硬报错', () => {
  it('moveCards 到装备槽 / 判定区直接抛错（只能经 UC 层进入）', async () => {
    const g = freshGame();
    const p = g.state.players[0];
    const weapon = makeUniqueCard(CardType.QiLinGong);
    p.hand.replaceAll([weapon]);

    await expect(moveCards(g, {
      to: { player: p, zone: 'equipment' }, cards: [weapon], reason: 'equip',
    })).rejects.toThrow(/驻留区/);

    await expect(moveCards(g, {
      to: { player: p, zone: 'judgment' }, cards: [weapon], reason: 'use',
    })).rejects.toThrow(/驻留区/);

    expect(p.hand.cards).toEqual([weapon]); // 未发生移动
  });
});

describe('UC：规则身份推导（花色 / 点数 / 颜色）', () => {
  it('无转化（视为自身）：继承实体牌的花色点数与颜色', () => {
    const g = freshGame();
    const c = makeUniqueCard(CardType.Sha, '♥', 7);
    const uc = g.usedCards.create(c, [c]);

    expect([uc.suit, uc.number, uc.color]).toEqual(['♥', 7, 'red']);
  });

  it('单牌转化：继承源牌的花色与点数', () => {
    const g = freshGame();
    const source = makeUniqueCard(CardType.Sha, '♦', 9); // 国色类：方块牌当乐不思蜀
    const uc = g.usedCards.create({ type: CardType.LeBu, name: '乐不思蜀' }, [source]);

    expect([uc.type, uc.suit, uc.number, uc.color]).toEqual([CardType.LeBu, '♦', 9, 'red']);
  });

  it('无牌转化：无花色、无点数、无颜色', () => {
    const g = freshGame();
    const uc = g.usedCards.create({ type: CardType.JueDou, name: '决斗' }, []);

    expect([uc.suit, uc.number, uc.color]).toEqual([null, null, null]);
  });

  it('多牌转化：无花色无点数；全同色则有该颜色，异色则无颜色', () => {
    const g = freshGame();
    const black1 = makeUniqueCard(CardType.Sha, '♠', 3);
    const black2 = makeUniqueCard(CardType.Sha, '♣', 8);
    const red = makeUniqueCard(CardType.Tao, '♥', 4);

    const same = g.usedCards.create({ type: CardType.Sha, name: '杀' }, [black1, black2]);
    expect([same.suit, same.number, same.color]).toEqual([null, null, 'black']);

    const mixed = g.usedCards.create({ type: CardType.Sha, name: '杀' }, [black1, red]);
    expect([mixed.suit, mixed.number, mixed.color]).toEqual([null, null, null]);
  });

  it('特殊声明优先：声明的项按声明，未声明的项按实体组成推导', () => {
    const g = freshGame();
    const a = makeUniqueCard(CardType.Sha, '♠', 3);
    const b = makeUniqueCard(CardType.Sha, '♣', 8);

    // 声明花色 → 该花色生效（颜色由花色派生），点数仍为多牌转化的空值
    const declared = g.usedCards.create({ type: CardType.Sha, name: '杀', suit: '♥' }, [a, b]);
    expect([declared.suit, declared.number, declared.color]).toEqual(['♥', null, 'red']);

    // 只声明颜色
    const colored = g.usedCards.create({ type: CardType.Sha, name: '杀', color: 'black' }, [a, b]);
    expect([colored.suit, colored.number, colored.color]).toEqual([null, null, 'black']);
  });
});

describe('UC：打出（响应窗口）= UC 生命周期', () => {
  it('打出：实体牌经处理区后进弃牌堆，UC 随清理销毁', async () => {
    const g = freshGame();
    const p = g.state.players[0];
    const shan = makeUniqueCard(CardType.Shan);
    giveHand(p, CardType.Tao);
    p.hand.add(shan);
    const zones: string[] = [];
    g.triggerSystem.on(`${EventType.CardMove}.before`, (e) => {
      zones.push((e.data as CardMoveEventData).to.zone);
    });

    await playUsedCard(g, p, shan);

    expect(zones).toEqual(['processing', 'discardPile']); // 打出走处理区再清理
    expect(g.state.discardPile.cards).toContain(shan);
    expect(p.hand.cards.map((c) => c.type)).toEqual([CardType.Tao]);
    expect(g.usedCards.size()).toBe(0);                   // 短时 UC 已销毁
    expect(verifyCardState(g)).toEqual([]);
  });
});

describe('UC：对账不变量', () => {
  it('漏建 UC 会被 verifyCardState 检出（装备区 / 判定区双向约束）', () => {
    const g = freshGame();
    const p = g.state.players[0];
    const armor = makeUniqueCard(CardType.BaGuaZhen);
    equipAt(g, p, armor);

    // 人为移除绑定（模拟漏建/漏销）
    g.usedCards.unbind(g.usedCards.ofCard(armor)!);

    expect(verifyCardState(g).some((s) => s.includes('身份区缺 UC'))).toBe(true);
  });

  it('UC 位置与实体牌位置不符 → 检出', () => {
    const g = freshGame();
    const p = g.state.players[0];
    const lebu = makeUniqueCard(CardType.LeBu);
    placeJudgment(g, p, lebu);
    const uc = g.usedCards.ofCard(lebu)!;

    // 人为把 UC 的位置改成处理区（实体牌仍在判定区）
    uc.loc = { kind: 'processing' };

    expect(verifyCardState(g).some((s) => s.includes('UC 位置不符'))).toBe(true);
  });
});
