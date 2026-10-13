/**
 * MVP Card 模块（R006）。
 *
 * CardArea 本身就是位置；atomicCardMove 是严格单牌原语，moveCards 是宽容的批量事件行为。
 */

import { defineEvent, type EventRuntime } from '../event/event.js';
import type { Player } from '../player/player.js';

declare const cardIdBrand: unique symbol;
declare const cardFaceIdBrand: unique symbol;
declare const cardAreaIdBrand: unique symbol;

export type CardId = string & { readonly [cardIdBrand]: 'CardId' };
export type CardFaceId = string & { readonly [cardFaceIdBrand]: 'CardFaceId' };
export type CardAreaId = string & { readonly [cardAreaIdBrand]: 'CardAreaId' };

export type CardSuit = 'spade' | 'heart' | 'club' | 'diamond';
export type CardColor = 'red' | 'black';

export interface Card {
  readonly id: CardId;
  readonly face: CardFaceId;
  readonly suit: CardSuit | null;
  readonly number: number | null;
}

export interface CardArea {
  readonly id: CardAreaId;
  readonly cards: readonly Card[];
  /** 严格离开：先同步修改结构与位置索引，再按注册顺序运行 hooks。 */
  leave(card: Card): void | Promise<void>;
}

export type CardAreaHook = (
  card: Card,
  area: CardArea,
) => void | Promise<void>;

/** 具体 Area 产生的单牌进入闭包。 */
export type EnterCard = (card: Card) => void | Promise<void>;

/** moveCards 交给目标 Area 的单牌移动能力。返回 false 表示来源已经变化，本次跳过。 */
export type MoveOneCard = (
  card: Card,
  enter: EnterCard,
) => Promise<boolean>;

/** 目标 Area 自定义整批牌的物理执行顺序及每张牌的进入方式。 */
export type EnterCards = (
  cards: readonly Card[],
  moveOne: MoveOneCard,
) => void | Promise<void>;

export interface CardMoveData {
  readonly cards: readonly Card[];
  readonly fromAreas: readonly CardArea[];
  readonly toArea: CardArea;
  readonly reason: string;
  readonly mover?: Player;
  /** 按请求逻辑顺序记录实际完成物理移动的牌。 */
  moved: readonly Card[];
}

const CardMoveEvent = defineEvent('card.move').withData<CardMoveData>();
export const CardMove = CardMoveEvent.kind;

export interface MoveCardsInput {
  readonly cards: readonly Card[];
  readonly toArea: CardArea;
  readonly enterCards: EnterCards;
  readonly reason: string;
  readonly mover?: Player;
}

export type AtomicCardMove = (
  card: Card,
  expectedFrom: CardArea | null,
  enter: EnterCard,
) => Promise<void>;

export interface CardRuntime {
  createCard(input: {
    readonly id: CardId;
    readonly face: CardFaceId;
    readonly suit: CardSuit | null;
    readonly number: number | null;
  }): Card;

  /** 查询规范 Card 当前所在 Area；未放置返回 null。 */
  areaOf(card: Card): CardArea | null;

  /**
   * 注册一个初始为空的特殊 Area。remove/insert 只修改 Area 自己的同步内部结构；
   * Runtime 在其后维护集中位置索引并运行 hooks。
   */
  registerArea(input: {
    readonly id: CardAreaId;
    readonly cards: () => readonly Card[];
    readonly remove: (card: Card) => void;
  }): {
    readonly area: CardArea;
    readonly enter: (insert: (card: Card) => void) => EnterCard;
    readonly onLeave: (hook: CardAreaHook) => () => void;
    readonly onEnter: (hook: CardAreaHook) => () => void;
  };

  moveCards(input: MoveCardsInput): Promise<readonly Card[]>;

  /** 测试/调试用：核对规范 Card、Area 内容与位置索引。 */
  verify(): readonly string[];
}

interface HookEntry {
  active: boolean;
  readonly hook: CardAreaHook;
}

interface AreaRecord {
  readonly area: CardArea;
  readonly cards: () => readonly Card[];
  readonly remove: (card: Card) => void;
  readonly leaveHooks: HookEntry[];
  readonly enterHooks: HookEntry[];
}

export function cardId(value: string): CardId {
  assertNonBlank(value, 'CardId');
  return value as CardId;
}

export function cardFaceId(value: string): CardFaceId {
  assertNonBlank(value, 'CardFaceId');
  return value as CardFaceId;
}

export function cardAreaId(value: string): CardAreaId {
  assertNonBlank(value, 'CardAreaId');
  return value as CardAreaId;
}

export function colorOfSuit(suit: CardSuit | null): CardColor | null {
  if (suit === 'heart' || suit === 'diamond') return 'red';
  if (suit === 'spade' || suit === 'club') return 'black';
  return null;
}

export function colorOf(card: Card): CardColor | null {
  return colorOfSuit(card.suit);
}

/** 创建一局 CardRuntime，并单独返回只供装配/联结层持有的严格原子能力。 */
export function createCardRuntime(events: EventRuntime): {
  readonly cards: CardRuntime;
  readonly atomicCardMove: AtomicCardMove;
} {
  const canonicalCards = new Map<CardId, Card>();
  const areaRecords = new Map<CardAreaId, AreaRecord>();
  const locations = new Map<CardId, CardArea>();
  const enterAreas = new WeakMap<EnterCard, CardArea>();

  const assertCanonical = (card: Card): Card => {
    const canonical = canonicalCards.get(card.id);
    if (!canonical) throw new Error(`Card“${card.id}”不属于当前 CardRuntime。`);
    if (canonical !== card) {
      throw new Error(`Card“${card.id}”不是当前 CardRuntime 的规范对象。`);
    }
    return canonical;
  };

  const assertRegisteredArea = (area: CardArea): AreaRecord => {
    const record = areaRecords.get(area.id);
    if (!record || record.area !== area) {
      throw new Error(`CardArea“${area.id}”不属于当前 CardRuntime。`);
    }
    return record;
  };

  const dispatchHooks = async (
    entries: HookEntry[],
    card: Card,
    area: CardArea,
  ): Promise<void> => {
    for (const entry of [...entries]) {
      if (entry.active) await entry.hook(card, area);
    }
  };

  const registerHook = (
    entries: HookEntry[],
    hook: CardAreaHook,
  ): (() => void) => {
    const entry: HookEntry = { active: true, hook };
    entries.push(entry);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      entry.active = false;
      const index = entries.indexOf(entry);
      if (index >= 0) entries.splice(index, 1);
    };
  };

  let cards: CardRuntime;

  const atomicCardMove: AtomicCardMove = async (card, expectedFrom, enter) => {
    const canonical = assertCanonical(card);
    const enterArea = enterAreas.get(enter);
    if (!enterArea) throw new Error('进入方法不属于当前 CardRuntime。');
    assertRegisteredArea(enterArea);

    if (expectedFrom) assertRegisteredArea(expectedFrom);
    const current = locations.get(canonical.id) ?? null;
    if (current !== expectedFrom) {
      throw new Error(
        `Card“${canonical.id}”的实际来源不是声明的 Area。`,
      );
    }

    let leaveError: unknown;
    if (expectedFrom) {
      try {
        await expectedFrom.leave(canonical);
      } catch (error) {
        const afterLeave = locations.get(canonical.id) ?? null;
        if (afterLeave === expectedFrom) throw error;
        if (afterLeave !== null) {
          throw new Error(
            `Card“${canonical.id}”在 leave hook 中被接管，违反 atomicCardMove 约束。`,
            { cause: error },
          );
        }
        leaveError = error;
      }
    }

    try {
      await enter(canonical);
    } catch (enterError) {
      if (leaveError !== undefined) {
        throw new AggregateError(
          [leaveError, enterError],
          `Card“${canonical.id}”的 leave 与 enter hook 均执行失败。`,
        );
      }
      throw enterError;
    }

    if (locations.get(canonical.id) !== enterArea) {
      throw new Error(`Card“${canonical.id}”进入后的位置索引不正确。`);
    }
    if (leaveError !== undefined) throw leaveError;
  };

  cards = {
    createCard(input): Card {
      assertNonBlank(input.id, 'CardId');
      assertNonBlank(input.face, 'CardFaceId');
      if (canonicalCards.has(input.id)) {
        throw new Error(`当前 CardRuntime 已存在 CardId“${input.id}”。`);
      }
      if (input.suit !== null && !CARD_SUITS.has(input.suit)) {
        throw new Error(`Card.suit“${String(input.suit)}”非法。`);
      }
      if (input.number !== null
        && (!Number.isInteger(input.number) || input.number < 1 || input.number > 13)) {
        throw new Error('Card.number 必须为 null 或 1–13 的整数。');
      }

      const card = Object.freeze({ ...input });
      canonicalCards.set(card.id, card);
      return card;
    },

    areaOf(card: Card): CardArea | null {
      const canonical = assertCanonical(card);
      return locations.get(canonical.id) ?? null;
    },

    registerArea(input) {
      assertNonBlank(input.id, 'CardAreaId');
      if (areaRecords.has(input.id)) {
        throw new Error(`当前 CardRuntime 已存在 CardAreaId“${input.id}”。`);
      }
      if (input.cards().length > 0) {
        throw new Error(`CardArea“${input.id}”注册时必须为空；初始化必须走 atomicCardMove。`);
      }

      const leaveHooks: HookEntry[] = [];
      const enterHooks: HookEntry[] = [];
      let record: AreaRecord;

      const area: CardArea = Object.freeze({
        id: input.id,
        get cards(): readonly Card[] {
          return input.cards();
        },
        leave: async (card: Card): Promise<void> => {
          const canonical = assertCanonical(card);
          if (locations.get(canonical.id) !== area) {
            throw new Error(`Card“${canonical.id}”不在 CardArea“${area.id}”中。`);
          }
          assertExactOccurrence(record.cards(), canonical, 1, area.id);

          try {
            record.remove(canonical);
          } catch (error) {
            const count = countIdentity(record.cards(), canonical);
            if (count === 0) locations.delete(canonical.id);
            throw error;
          }

          assertExactOccurrence(record.cards(), canonical, 0, area.id);
          locations.delete(canonical.id);
          await dispatchHooks(record.leaveHooks, canonical, area);
        },
      });

      record = {
        area,
        cards: input.cards,
        remove: input.remove,
        leaveHooks,
        enterHooks,
      };
      areaRecords.set(area.id, record);

      return Object.freeze({
        area,
        enter(insert: (card: Card) => void): EnterCard {
          const enter: EnterCard = async (card) => {
            const canonical = assertCanonical(card);
            if (locations.has(canonical.id)) {
              throw new Error(`Card“${canonical.id}”已有位置，不能进入 CardArea“${area.id}”。`);
            }

            try {
              insert(canonical);
            } catch (error) {
              const count = countIdentity(record.cards(), canonical);
              if (count === 1) locations.set(canonical.id, area);
              throw error;
            }

            assertExactOccurrence(record.cards(), canonical, 1, area.id);
            locations.set(canonical.id, area);
            await dispatchHooks(record.enterHooks, canonical, area);
          };
          enterAreas.set(enter, area);
          return enter;
        },
        onLeave: (hook: CardAreaHook) => registerHook(leaveHooks, hook),
        onEnter: (hook: CardAreaHook) => registerHook(enterHooks, hook),
      });
    },

    async moveCards(input: MoveCardsInput): Promise<readonly Card[]> {
      assertRegisteredArea(input.toArea);
      assertNonBlank(input.reason, 'CardMove reason');

      const normalized: Card[] = [];
      const seen = new Set<CardId>();
      for (const candidate of input.cards) {
        const card = assertCanonical(candidate);
        if (seen.has(card.id)) continue;
        seen.add(card.id);
        if (locations.has(card.id)) normalized.push(card);
      }
      if (normalized.length === 0) return Object.freeze([]);

      const fromById = new Map<CardId, CardArea>();
      for (const card of normalized) fromById.set(card.id, locations.get(card.id)!);

      const data: CardMoveData = {
        cards: Object.freeze([...normalized]),
        fromAreas: Object.freeze(normalized.map(card => fromById.get(card.id)!)),
        toArea: input.toArea,
        reason: input.reason,
        mover: input.mover,
        moved: Object.freeze([]),
      };

      await CardMoveEvent.run(events, data, async event => {
        const attempted = new Set<CardId>();
        const moved = new Set<CardId>();
        const updateMoved = () => {
          event.data.moved = Object.freeze(
            normalized.filter(card => moved.has(card.id)),
          );
        };

        await input.enterCards(normalized, async (candidate, enter) => {
          const card = assertCanonical(candidate);
          if (!fromById.has(card.id)) {
            throw new Error(`批量进入策略尝试移动计划外 Card“${card.id}”。`);
          }
          if (attempted.has(card.id)) {
            throw new Error(`批量进入策略重复处理 Card“${card.id}”。`);
          }
          attempted.add(card.id);

          const enterArea = enterAreas.get(enter);
          if (enterArea !== input.toArea) {
            throw new Error(`Card“${card.id}”的进入方法不属于目标 CardArea。`);
          }

          const expectedFrom = fromById.get(card.id)!;
          if (locations.get(card.id) !== expectedFrom) return false;

          try {
            await atomicCardMove(card, expectedFrom, enter);
            moved.add(card.id);
            updateMoved();
            return true;
          } catch (error) {
            if (locations.get(card.id) === input.toArea) {
              moved.add(card.id);
              updateMoved();
            }
            throw error;
          }
        });
        updateMoved();
      });

      return data.moved;
    },

    verify(): readonly string[] {
      const issues: string[] = [];
      const physical = new Map<CardId, CardArea>();

      for (const record of areaRecords.values()) {
        for (const card of record.cards()) {
          const canonical = canonicalCards.get(card.id);
          if (canonical !== card) {
            issues.push(`Area“${record.area.id}”包含非规范 Card“${card.id}”。`);
          }
          const prior = physical.get(card.id);
          if (prior) {
            issues.push(`Card“${card.id}”同时位于 Area“${prior.id}”与“${record.area.id}”。`);
          } else {
            physical.set(card.id, record.area);
          }
          if (locations.get(card.id) !== record.area) {
            issues.push(`Card“${card.id}”的 Area 内容与位置索引不一致。`);
          }
        }
      }

      for (const [id, area] of locations) {
        if (physical.get(id) !== area) {
          issues.push(`Card“${id}”存在位置索引幽灵或指向错误 Area。`);
        }
      }
      return Object.freeze(issues);
    },
  };

  return Object.freeze({ cards, atomicCardMove });
}

/** 常用列表 Area；特殊 Area 可直接使用 CardRuntime.registerArea 注册自己的内部结构。 */
export function createListCardArea(cards: CardRuntime, id: CardAreaId) {
  const content: Card[] = [];
  const registered = cards.registerArea({
    id,
    cards: () => content,
    remove: (card) => {
      const index = content.indexOf(card);
      if (index < 0) throw new Error(`Card“${card.id}”不在列表 Area“${id}”中。`);
      content.splice(index, 1);
    },
  });

  const append = registered.enter(card => { content.push(card); });
  const prepend = registered.enter(card => { content.unshift(card); });

  const appendInOrder: EnterCards = async (moving, moveOne) => {
    for (const card of moving) await moveOne(card, append);
  };
  const prependInOrder: EnterCards = async (moving, moveOne) => {
    for (const card of [...moving].reverse()) await moveOne(card, prepend);
  };

  return Object.freeze({
    ...registered,
    append,
    prepend,
    appendInOrder,
    prependInOrder,
    insertAt(index: number): EnterCard {
      return registered.enter(card => {
        if (!Number.isInteger(index) || index < 0 || index > content.length) {
          throw new Error(`列表 Area“${id}”的插入下标 ${index} 非法。`);
        }
        content.splice(index, 0, card);
      });
    },
  });
}

function countIdentity(cards: readonly Card[], target: Card): number {
  let count = 0;
  for (const card of cards) if (card === target) count++;
  return count;
}

function assertExactOccurrence(
  cards: readonly Card[],
  target: Card,
  expected: number,
  areaId: CardAreaId,
): void {
  const actual = countIdentity(cards, target);
  if (actual !== expected) {
    throw new Error(
      `CardArea“${areaId}”中 Card“${target.id}”的数量应为 ${expected}，实际为 ${actual}。`,
    );
  }
}

function assertNonBlank(value: string, name: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} 不能为空。`);
  }
}

const CARD_SUITS: ReadonlySet<CardSuit> = new Set([
  'spade',
  'heart',
  'club',
  'diamond',
]);
