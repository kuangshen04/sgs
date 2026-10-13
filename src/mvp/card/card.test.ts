import { describe, expect, expectTypeOf, it } from 'vitest';

import { createEventRuntime } from '../event/event.js';
import {
  CardMove,
  cardAreaId,
  cardFaceId,
  cardId,
  colorOf,
  createCardRuntime,
  createListCardArea,
  type Card,
  type CardArea,
  type CardId,
  type EnterCards,
} from './card.js';

function setup() {
  const events = createEventRuntime();
  const created = createCardRuntime(events);
  const hand = createListCardArea(created.cards, cardAreaId('hand'));
  const deck = createListCardArea(created.cards, cardAreaId('deck'));
  const discard = createListCardArea(created.cards, cardAreaId('discard'));
  let next = 1;
  const makeCard = (overrides: Partial<{
    suit: Card['suit'];
    number: Card['number'];
  }> = {}) => created.cards.createCard({
    id: cardId(`card-${next++}`),
    face: cardFaceId('sha'),
    suit: overrides.suit ?? 'spade',
    number: overrides.number ?? 7,
  });
  return { events, ...created, hand, deck, discard, makeCard };
}

describe('Card 实体', () => {
  it('使用独立 ID、不可变牌面，并允许无花色无点数', () => {
    const { cards } = setup();
    const card = cards.createCard({
      id: cardId('colorless'),
      face: cardFaceId('special'),
      suit: null,
      number: null,
    });

    expectTypeOf<CardId>().not.toEqualTypeOf<string>();
    expect(Object.isFrozen(card)).toBe(true);
    expect(card).toMatchObject({ suit: null, number: null });
    expect(colorOf(card)).toBeNull();
  });

  it('拒绝重复 ID、伪规范对象和非法点数', () => {
    const { cards, makeCard } = setup();
    const card = makeCard();
    expect(() => cards.createCard({
      id: card.id,
      face: cardFaceId('shan'),
      suit: 'heart',
      number: 2,
    })).toThrow(/已存在 CardId/);
    expect(() => cards.createCard({
      id: cardId('bad-number'),
      face: cardFaceId('sha'),
      suit: 'spade',
      number: 14,
    })).toThrow(/1–13/);
    expect(() => cards.createCard({
      id: cardId('bad-suit'),
      face: cardFaceId('sha'),
      suit: 'joker' as Card['suit'],
      number: null,
    })).toThrow(/Card.suit/);

    const fake = { ...card };
    expect(() => cards.areaOf(fake)).toThrow(/不是.*规范对象/);
  });
});

describe('CardArea 与 atomicCardMove', () => {
  it('初始化、普通移动与同 Area 重排都走严格单牌原语', async () => {
    const { cards, atomicCardMove, hand, deck, makeCard } = setup();
    const first = makeCard();
    const second = makeCard();

    await atomicCardMove(first, null, deck.append);
    await atomicCardMove(second, null, deck.append);
    expect(deck.area.cards).toEqual([first, second]);

    await atomicCardMove(first, deck.area, deck.append);
    expect(deck.area.cards).toEqual([second, first]);

    await atomicCardMove(first, deck.area, hand.append);
    expect(cards.areaOf(first)).toBe(hand.area);
    expect(deck.area.cards).toEqual([second]);

    await atomicCardMove(second, deck.area, deck.prepend);
    expect(deck.area.cards).toEqual([second]);
    expect(cards.verify()).toEqual([]);
  });

  it('hook 被调用时结构与位置索引已经一致', async () => {
    const { cards, atomicCardMove, hand, deck, makeCard } = setup();
    const card = makeCard();
    const observations: string[] = [];
    await atomicCardMove(card, null, hand.append);

    hand.onLeave((leaving) => {
      expect(hand.area.cards).not.toContain(leaving);
      expect(cards.areaOf(leaving)).toBeNull();
      observations.push('leave');
    });
    deck.onEnter((entering) => {
      expect(deck.area.cards).toContain(entering);
      expect(cards.areaOf(entering)).toBe(deck.area);
      observations.push('enter');
    });

    await atomicCardMove(card, hand.area, deck.append);
    expect(observations).toEqual(['leave', 'enter']);
  });

  it('leave hook 抛错后仍完成目标进入，再传播原异常', async () => {
    const { cards, atomicCardMove, hand, deck, makeCard } = setup();
    const card = makeCard();
    await atomicCardMove(card, null, hand.append);
    hand.onLeave(() => { throw new Error('leave failed'); });

    await expect(atomicCardMove(card, hand.area, deck.append))
      .rejects.toThrow('leave failed');
    expect(cards.areaOf(card)).toBe(deck.area);
    expect(deck.area.cards).toContain(card);
    expect(cards.verify()).toEqual([]);
  });

  it('原子操作采用严格来源和当前 Runtime 的进入方法', async () => {
    const one = setup();
    const two = setup();
    const card = one.makeCard();

    await expect(one.atomicCardMove(card, one.hand.area, one.deck.append))
      .rejects.toThrow(/实际来源/);
    await expect(one.atomicCardMove(card, null, two.deck.append))
      .rejects.toThrow(/进入方法不属于/);
  });

  it('允许外部注册非列表结构的特殊 Area', async () => {
    const { cards, atomicCardMove, makeCard } = setup();
    const slots = new Map<string, Card>();
    const registered = cards.registerArea({
      id: cardAreaId('equipment'),
      cards: () => [...slots.values()],
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
    const card = makeCard();

    await atomicCardMove(card, null, enterWeapon);
    expect(registered.area.cards).toEqual([card]);
    expect(cards.areaOf(card)).toBe(registered.area);
  });
});

describe('moveCards 批量事件', () => {
  it('保留部分成功、去重和单次事件语义', async () => {
    const { events, cards, atomicCardMove, hand, discard, makeCard } = setup();
    const placed = makeCard();
    const unplaced = makeCard();
    await atomicCardMove(placed, null, hand.append);
    let before = 0;
    let after = 0;
    events.on(CardMove.before, event => {
      before++;
      expect(event.data.cards).toEqual([placed]);
      expect(event.data.fromAreas).toEqual([hand.area]);
      expect(event.data.toArea).toBe(discard.area);
    });
    events.on(CardMove.after, event => {
      after++;
      expect(event.data.moved).toEqual([placed]);
    });

    const moved = await cards.moveCards({
      cards: [placed, unplaced, placed],
      toArea: discard.area,
      enterCards: discard.appendInOrder,
      reason: 'discard',
    });

    expect(moved).toEqual([placed]);
    expect([before, after]).toEqual([1, 1]);
    expect(cards.verify()).toEqual([]);
  });

  it('目标可自定义物理顺序，moved 仍保持逻辑请求顺序', async () => {
    const { cards, atomicCardMove, hand, deck, makeCard } = setup();
    const moving = [makeCard(), makeCard(), makeCard()];
    for (const card of moving) await atomicCardMove(card, null, hand.append);

    const toTop: EnterCards = async (batch, moveOne) => {
      for (const card of [...batch].reverse()) await moveOne(card, deck.append);
    };
    const moved = await cards.moveCards({
      cards: moving,
      toArea: deck.area,
      enterCards: toTop,
      reason: 'put-top',
    });

    expect(deck.area.cards).toEqual([...moving].reverse());
    expect(moved).toEqual(moving);
  });

  it('后续单牌进入失败不回滚此前已完成的移动', async () => {
    const { cards, atomicCardMove, hand, deck, makeCard } = setup();
    const first = makeCard();
    const second = makeCard();
    await atomicCardMove(first, null, hand.append);
    await atomicCardMove(second, null, hand.append);

    await expect(cards.moveCards({
      cards: [first, second],
      toArea: deck.area,
      enterCards: async (moving, moveOne) => {
        for (const card of moving) {
          if (card === second) throw new Error('second failed');
          await moveOne(card, deck.append);
        }
      },
      reason: 'partial-failure',
    })).rejects.toThrow('second failed');

    expect(cards.areaOf(first)).toBe(deck.area);
    expect(cards.areaOf(second)).toBe(hand.area);
    expect(cards.verify()).toEqual([]);
  });

  it('before 中移走后续牌时，父移动逐张核对并跳过', async () => {
    const { events, cards, atomicCardMove, hand, deck, discard, makeCard } = setup();
    const first = makeCard();
    const second = makeCard();
    await atomicCardMove(first, null, hand.append);
    await atomicCardMove(second, null, hand.append);
    let nested = false;
    events.on(CardMove.before, async event => {
      if (nested || event.data.reason !== 'parent') return;
      nested = true;
      await cards.moveCards({
        cards: [second],
        toArea: discard.area,
        enterCards: discard.appendInOrder,
        reason: 'nested',
      });
    });

    const moved = await cards.moveCards({
      cards: [first, second],
      toArea: deck.area,
      enterCards: deck.appendInOrder,
      reason: 'parent',
    });

    expect(moved).toEqual([first]);
    expect(deck.area.cards).toEqual([first]);
    expect(discard.area.cards).toEqual([second]);
  });

  it('空移动不创建事件', async () => {
    const { events, cards, discard } = setup();
    let fired = false;
    events.on(CardMove.before, () => { fired = true; });

    const moved = await cards.moveCards({
      cards: [],
      toArea: discard.area,
      enterCards: discard.appendInOrder,
      reason: 'empty',
    });

    expect(moved).toEqual([]);
    expect(fired).toBe(false);
  });

  it('拒绝目标 Area 与进入方法不匹配', async () => {
    const { cards, atomicCardMove, hand, deck, discard, makeCard } = setup();
    const card = makeCard();
    await atomicCardMove(card, null, hand.append);

    await expect(cards.moveCards({
      cards: [card],
      toArea: discard.area,
      enterCards: async (moving, moveOne) => {
        await moveOne(moving[0], deck.append);
      },
      reason: 'bad-target',
    })).rejects.toThrow(/不属于目标 CardArea/);
    expect(cards.areaOf(card)).toBe(hand.area);
  });
});
