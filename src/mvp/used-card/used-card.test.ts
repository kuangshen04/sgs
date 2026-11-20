import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  cardAreaId,
  cardFaceId,
  cardId,
  createCardRuntime,
  createListCardArea,
  type Card,
  type CardArea,
} from '../card/card.js';
import { createEventRuntime } from '../event/event.js';
import {
  createListUsedCardArea,
  createUsedCard,
  createUsedCardRuntime,
  installUsedCardAreaIntegrity,
  usedCardAreaId,
  type UsedCardId,
  type UsedCardMaterialMove,
} from './used-card.js';

function setup() {
  const events = createEventRuntime();
  const cardCreated = createCardRuntime(events);
  const hand = createListCardArea(cardCreated.cards, cardAreaId('hand'));
  const processingCards = createListCardArea(
    cardCreated.cards,
    cardAreaId('processing'),
  );
  const residentCards = createListCardArea(
    cardCreated.cards,
    cardAreaId('resident'),
  );
  const discard = createListCardArea(cardCreated.cards, cardAreaId('discard'));

  const ucCreated = createUsedCardRuntime(cardCreated.cards);
  const processing = createListUsedCardArea(
    ucCreated.usedCards,
    usedCardAreaId('processing'),
  );
  const resident = createListUsedCardArea(
    ucCreated.usedCards,
    usedCardAreaId('resident'),
  );

  const processingTarget = {
    area: processingCards.area,
    enterCards: processingCards.appendInOrder,
  };
  const install = (cardArea: CardArea, usedCardArea = resident.area) => (
    installUsedCardAreaIntegrity({
      cardArea,
      usedCardArea,
      processingArea: processingCards.area,
      enterProcessing: processingCards.appendInOrder,
      handlePhysicalCardLeave: ucCreated.handlePhysicalCardLeave,
    })
  );
  install(residentCards.area, resident.area);
  install(processingCards.area, processing.area);

  let nextCardId = 1;
  const makeCard = (
    suit: Card['suit'] = 'spade',
    number: Card['number'] = 7,
  ) => cardCreated.cards.createCard({
    id: cardId(`card-${nextCardId++}`),
    face: cardFaceId('material'),
    suit,
    number,
  });
  const placeInHand = async (...cards: Card[]) => {
    for (const card of cards) {
      await cardCreated.atomicCardMove(card, null, hand.append);
    }
  };
  const moveTo = (
    area: ReturnType<typeof createListCardArea>,
    reason: string,
  ): UsedCardMaterialMove => ({
    toArea: area.area,
    enterCards: area.appendInOrder,
    reason,
  });

  return {
    ...cardCreated,
    ...ucCreated,
    hand,
    processingCards,
    residentCards,
    discard,
    processing,
    resident,
    processingTarget,
    makeCard,
    placeInHand,
    moveTo,
  };
}

describe('UsedCard 纯构造', () => {
  it('零材料 UC 无花色、点数和颜色，不产生逐局 ID', () => {
    const used = createUsedCard({ face: cardFaceId('virtual-shan') });

    expect(used).toEqual({
      face: 'virtual-shan',
      suit: null,
      number: null,
      color: null,
      physicalCards: [],
    });
    expect(Object.isFrozen(used)).toBe(true);
    expect(Object.isFrozen(used.physicalCards)).toBe(true);
    expect('id' in used).toBe(false);
  });

  it('单材料继承牌面，多材料只在全部同色时继承颜色', () => {
    const { makeCard } = setup();
    const redOne = makeCard('heart', 3);
    const redTwo = makeCard('diamond', 9);
    const black = makeCard('spade', 7);

    expect(createUsedCard({
      face: cardFaceId('sha'),
      physicalCards: [redOne],
    })).toMatchObject({ suit: 'heart', number: 3, color: 'red' });

    expect(createUsedCard({
      face: cardFaceId('converted'),
      physicalCards: [redOne, redTwo],
    })).toMatchObject({ suit: null, number: null, color: 'red' });

    expect(createUsedCard({
      face: cardFaceId('converted'),
      physicalCards: [redOne, black],
    })).toMatchObject({ suit: null, number: null, color: null });
  });

  it('显式牌面逐字段优先，并拒绝重复材料与非法点数', () => {
    const { makeCard } = setup();
    const card = makeCard('spade', 7);
    const used = createUsedCard({
      face: cardFaceId('special'),
      physicalCards: [card],
      suit: null,
      number: null,
      color: 'red',
    });
    expect(used).toMatchObject({ suit: null, number: null, color: 'red' });

    expect(() => createUsedCard({
      face: cardFaceId('duplicate'),
      physicalCards: [card, card],
    })).toThrow(/重复实体 Card/);
    expect(() => createUsedCard({
      face: cardFaceId('bad-number'),
      number: 14,
    })).toThrow(/1–13/);
  });
});

describe('UsedCard Runtime 生命周期', () => {
  it('首次 enter 后才成为有 ID、Area 和实体反查的活跃 Instance', async () => {
    const ctx = setup();
    const first = ctx.makeCard();
    const second = ctx.makeCard('heart', 8);
    await ctx.placeInHand(first, second);
    const pure = createUsedCard({
      face: cardFaceId('multi-sha'),
      physicalCards: [first, second],
    });

    const instance = await ctx.usedCards.enter(pure, {
      toArea: ctx.processing.area,
      enter: ctx.processing.append,
      materials: ctx.moveTo(ctx.processingCards, 'use'),
    });

    expectTypeOf(instance.id).toEqualTypeOf<UsedCardId>();
    expect(ctx.usedCards.areaOf(instance)).toBe(ctx.processing.area);
    expect(ctx.usedCards.ofPhysical(first)).toBe(instance);
    expect(ctx.usedCards.ofPhysical(second)).toBe(instance);
    expect(ctx.processingCards.area.cards).toEqual([first, second]);
    expect(ctx.usedCards.verify()).toEqual([]);
  });

  it('零材料 UC 可以直接 enter、move、settle', async () => {
    const ctx = setup();
    const instance = await ctx.usedCards.enter(
      createUsedCard({ face: cardFaceId('virtual') }),
      { toArea: ctx.processing.area, enter: ctx.processing.append },
    );

    await ctx.usedCards.move(instance, {
      toArea: ctx.resident.area,
      enter: ctx.resident.append,
    });
    expect(ctx.usedCards.areaOf(instance)).toBe(ctx.resident.area);
    expect(await ctx.usedCards.settle(instance, ctx.processing.area)).toBe(false);
    expect(await ctx.usedCards.settle(instance, ctx.resident.area)).toBe(true);
    expect(ctx.usedCards.all).toEqual([]);
    expect(ctx.usedCards.areaOf(instance)).toBeNull();
  });

  it('显式 move 先清除实体反查，不会被 CardArea leave hook 误判为 break', async () => {
    const ctx = setup();
    const card = ctx.makeCard();
    await ctx.placeInHand(card);
    const instance = await ctx.usedCards.enter(createUsedCard({
      face: cardFaceId('resident-card'),
      physicalCards: [card],
    }), {
      toArea: ctx.processing.area,
      enter: ctx.processing.append,
      materials: ctx.moveTo(ctx.processingCards, 'use'),
    });

    await ctx.usedCards.move(instance, {
      toArea: ctx.resident.area,
      enter: ctx.resident.append,
      materials: ctx.moveTo(ctx.residentCards, 'reside'),
    });

    expect(ctx.usedCards.all).toEqual([instance]);
    expect(ctx.usedCards.areaOf(instance)).toBe(ctx.resident.area);
    expect(ctx.usedCards.ofPhysical(card)).toBe(instance);
    expect(ctx.cards.areaOf(card)).toBe(ctx.residentCards.area);
  });

  it('exit 显式移动材料并删除活跃实例', async () => {
    const ctx = setup();
    const card = ctx.makeCard();
    await ctx.placeInHand(card);
    const instance = await ctx.usedCards.enter(createUsedCard({
      face: cardFaceId('sha'),
      physicalCards: [card],
    }), {
      toArea: ctx.processing.area,
      enter: ctx.processing.append,
      materials: ctx.moveTo(ctx.processingCards, 'use'),
    });

    await ctx.usedCards.exit(instance, ctx.moveTo(ctx.discard, 'settle'));

    expect(ctx.usedCards.all).toEqual([]);
    expect(ctx.usedCards.areaOf(instance)).toBeNull();
    expect(ctx.usedCards.ofPhysical(card)).toBeNull();
    expect(ctx.cards.areaOf(card)).toBe(ctx.discard.area);
  });

  it('材料部分成功时 fail-stop，并保留无 Area Instance 供故障快照检查', async () => {
    const ctx = setup();
    const placed = ctx.makeCard();
    const unplaced = ctx.makeCard();
    await ctx.placeInHand(placed);
    const pure = createUsedCard({
      face: cardFaceId('broken-enter'),
      physicalCards: [placed, unplaced],
    });

    await expect(ctx.usedCards.enter(pure, {
      toArea: ctx.processing.area,
      enter: ctx.processing.append,
      materials: ctx.moveTo(ctx.processingCards, 'use'),
    })).rejects.toThrow(/未全部完成/);

    expect(ctx.usedCards.all).toHaveLength(1);
    expect(ctx.usedCards.areaOf(ctx.usedCards.all[0])).toBeNull();
    expect(ctx.cards.areaOf(placed)).toBe(ctx.processingCards.area);
  });

  it('允许外部注册槽位式 UsedCardArea', async () => {
    const ctx = setup();
    const slots = new Map<string, (typeof ctx.usedCards.all)[number]>();
    const registered = ctx.usedCards.registerArea({
      id: usedCardAreaId('equipment'),
      usedCards: () => [...slots.values()],
      remove: (card) => {
        const entry = [...slots].find(([, value]) => value === card);
        if (!entry) throw new Error('not equipped');
        slots.delete(entry[0]);
      },
    });
    const enterWeapon = registered.enter(card => {
      if (slots.has('weapon')) throw new Error('weapon occupied');
      slots.set('weapon', card);
    });

    const instance = await ctx.usedCards.enter(
      createUsedCard({ face: cardFaceId('weapon') }),
      { toArea: registered.area, enter: enterWeapon },
    );
    expect(registered.area.usedCards).toEqual([instance]);
    expect(ctx.usedCards.areaOf(instance)).toBe(registered.area);
  });
});

describe('UC—Card 意外离区联结', () => {
  it('一张材料意外离区时销毁 UC，当前牌继续原目标，其余牌进入 processing', async () => {
    const ctx = setup();
    const first = ctx.makeCard();
    const second = ctx.makeCard('heart', 8);
    const third = ctx.makeCard('club', 9);
    await ctx.placeInHand(first, second, third);
    const instance = await ctx.usedCards.enter(createUsedCard({
      face: cardFaceId('resident-multi'),
      physicalCards: [first, second, third],
    }), {
      toArea: ctx.resident.area,
      enter: ctx.resident.append,
      materials: ctx.moveTo(ctx.residentCards, 'reside'),
    });

    const moved = await ctx.cards.moveCards({
      cards: [first],
      toArea: ctx.discard.area,
      enterCards: ctx.discard.appendInOrder,
      reason: 'external-take',
    });

    expect(moved).toEqual([first]);
    expect(ctx.cards.areaOf(first)).toBe(ctx.discard.area);
    expect(ctx.cards.areaOf(second)).toBe(ctx.processingCards.area);
    expect(ctx.cards.areaOf(third)).toBe(ctx.processingCards.area);
    expect(ctx.usedCards.all).toEqual([]);
    expect(ctx.usedCards.areaOf(instance)).toBeNull();
    expect(ctx.usedCards.ofPhysical(first)).toBeNull();
    expect(ctx.usedCards.verify()).toEqual([]);
  });

  it('同一父批次包含多张材料时只 break 一次，后续牌因来源变化被跳过', async () => {
    const ctx = setup();
    const first = ctx.makeCard();
    const second = ctx.makeCard();
    await ctx.placeInHand(first, second);
    await ctx.usedCards.enter(createUsedCard({
      face: cardFaceId('resident-pair'),
      physicalCards: [first, second],
    }), {
      toArea: ctx.resident.area,
      enter: ctx.resident.append,
      materials: ctx.moveTo(ctx.residentCards, 'reside'),
    });

    const moved = await ctx.cards.moveCards({
      cards: [first, second],
      toArea: ctx.discard.area,
      enterCards: ctx.discard.appendInOrder,
      reason: 'external-batch',
    });

    expect(moved).toEqual([first]);
    expect(ctx.cards.areaOf(first)).toBe(ctx.discard.area);
    expect(ctx.cards.areaOf(second)).toBe(ctx.processingCards.area);
    expect(ctx.usedCards.all).toEqual([]);
  });
});
