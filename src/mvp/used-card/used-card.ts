/**
 * MVP UsedCard 模块（R008）。
 *
 * UsedCard 是无副作用规则值；UsedCardInstance 在逐局 Runtime 中拥有 ID 和 UsedCardArea 生命周期。
 */

import {
  colorOf,
  colorOfSuit,
  type Card,
  type CardArea,
  type CardColor,
  type CardFaceId,
  type CardRuntime,
  type CardSuit,
  type EnterCards,
} from '../card/card.js';
import type { Player } from '../player/player.js';

declare const usedCardIdBrand: unique symbol;
declare const usedCardAreaIdBrand: unique symbol;

export type UsedCardId = string & { readonly [usedCardIdBrand]: 'UsedCardId' };
export type UsedCardAreaId = string & {
  readonly [usedCardAreaIdBrand]: 'UsedCardAreaId';
};

export interface UsedCard {
  readonly face: CardFaceId;
  readonly suit: CardSuit | null;
  readonly number: number | null;
  readonly color: CardColor | null;
  readonly physicalCards: readonly Card[];
}

export interface UsedCardInstance extends UsedCard {
  readonly id: UsedCardId;
}

export interface UsedCardArea {
  readonly id: UsedCardAreaId;
  readonly usedCards: readonly UsedCardInstance[];
  leave(card: UsedCardInstance): void | Promise<void>;
}

export type EnterUsedCard = (
  card: UsedCardInstance,
) => void | Promise<void>;

/** 一次 UC 生命周期动作中全部实体材料的明确 Card.moveCards 目标。 */
export interface UsedCardMaterialMove {
  readonly toArea: CardArea;
  readonly enterCards: EnterCards;
  readonly reason: string;
  readonly mover?: Player;
}

interface EnterUsedCardInput {
  readonly toArea: UsedCardArea;
  readonly enter: EnterUsedCard;
  readonly materials?: UsedCardMaterialMove;
}

export interface UsedCardRuntime {
  readonly all: readonly UsedCardInstance[];

  areaOf(card: UsedCardInstance): UsedCardArea | null;
  ofPhysical(card: Card): UsedCardInstance | null;

  registerArea(input: {
    readonly id: UsedCardAreaId;
    readonly usedCards: () => readonly UsedCardInstance[];
    readonly remove: (card: UsedCardInstance) => void;
  }): {
    readonly area: UsedCardArea;
    readonly enter: (insert: (card: UsedCardInstance) => void) => EnterUsedCard;
  };

  enter(card: UsedCard, input: EnterUsedCardInput): Promise<UsedCardInstance>;
  move(card: UsedCardInstance, input: EnterUsedCardInput): Promise<void>;
  exit(card: UsedCardInstance, materials?: UsedCardMaterialMove): Promise<void>;
  settle(
    card: UsedCardInstance,
    expectedArea: UsedCardArea,
    materials?: UsedCardMaterialMove,
  ): Promise<boolean>;

  /** 测试/调试用：核对活跃 Store、Area 索引和实体材料反查。 */
  verify(): readonly string[];
}

export type HandlePhysicalCardLeave = (
  card: Card,
  expectedUsedCardArea: UsedCardArea,
  processing: {
    readonly area: CardArea;
    readonly enterCards: EnterCards;
  },
) => Promise<boolean>;

interface AreaRecord {
  readonly area: UsedCardArea;
  readonly usedCards: () => readonly UsedCardInstance[];
  readonly remove: (card: UsedCardInstance) => void;
}

export function usedCardAreaId(value: string): UsedCardAreaId {
  assertNonBlank(value, 'UsedCardAreaId');
  return value as UsedCardAreaId;
}

/** 纯构造完整 UC 牌面；undefined 表示推导，null 表示明确无该字段。 */
export function createUsedCard(input: {
  readonly face: CardFaceId;
  readonly physicalCards?: readonly Card[];
  readonly suit?: CardSuit | null;
  readonly number?: number | null;
  readonly color?: CardColor | null;
}): UsedCard {
  assertNonBlank(input.face, 'UsedCard.face');
  const physicalCards = Object.freeze([...(input.physicalCards ?? [])]);
  const ids = new Set<string>();
  for (const card of physicalCards) {
    if (ids.has(card.id)) throw new Error(`UsedCard 包含重复实体 Card“${card.id}”。`);
    ids.add(card.id);
  }

  if (input.number !== undefined && input.number !== null
    && (!Number.isInteger(input.number) || input.number < 1 || input.number > 13)) {
    throw new Error('UsedCard.number 必须为 null 或 1–13 的整数。');
  }

  const single = physicalCards.length === 1 ? physicalCards[0] : null;
  const suit = input.suit !== undefined ? input.suit : (single?.suit ?? null);
  const number = input.number !== undefined ? input.number : (single?.number ?? null);

  let color: CardColor | null;
  if (input.color !== undefined) {
    color = input.color;
  } else if (input.suit !== undefined) {
    color = colorOfSuit(input.suit);
  } else if (single) {
    color = colorOf(single);
  } else if (physicalCards.length > 1) {
    const colors = new Set(physicalCards.map(colorOf));
    color = colors.size === 1 ? [...colors][0] : null;
  } else {
    color = null;
  }

  return Object.freeze({
    face: input.face,
    suit,
    number,
    color,
    physicalCards,
  });
}

export function createUsedCardRuntime(cards: CardRuntime): {
  readonly usedCards: UsedCardRuntime;
  readonly handlePhysicalCardLeave: HandlePhysicalCardLeave;
} {
  let nextId = 1;
  const active = new Map<UsedCardId, UsedCardInstance>();
  const known = new WeakSet<UsedCardInstance>();
  const areaRecords = new Map<UsedCardAreaId, AreaRecord>();
  const locations = new Map<UsedCardId, UsedCardArea>();
  const byPhysical = new Map<Card, UsedCardInstance>();
  const enterAreas = new WeakMap<EnterUsedCard, UsedCardArea>();

  const assertKnown = (card: UsedCardInstance): void => {
    if (!known.has(card)) throw new Error(`UsedCardInstance“${card.id}”不属于当前 Runtime。`);
  };

  const assertActive = (card: UsedCardInstance): void => {
    assertKnown(card);
    if (active.get(card.id) !== card) {
      throw new Error(`UsedCardInstance“${card.id}”已经退出活跃 Store。`);
    }
  };

  const assertArea = (area: UsedCardArea): AreaRecord => {
    const record = areaRecords.get(area.id);
    if (!record || record.area !== area) {
      throw new Error(`UsedCardArea“${area.id}”不属于当前 Runtime。`);
    }
    return record;
  };

  const assertEnter = (area: UsedCardArea, enter: EnterUsedCard): void => {
    assertArea(area);
    if (enterAreas.get(enter) !== area) {
      throw new Error(`UsedCard 的进入方法不属于目标 Area“${area.id}”。`);
    }
  };

  const bindPhysical = (card: UsedCardInstance): void => {
    for (const physical of card.physicalCards) {
      const owner = byPhysical.get(physical);
      if (owner && owner !== card) {
        throw new Error(`实体 Card“${physical.id}”已属于 UsedCard“${owner.id}”。`);
      }
    }
    for (const physical of card.physicalCards) byPhysical.set(physical, card);
  };

  const assertPhysicalUnbound = (card: UsedCard): void => {
    for (const physical of card.physicalCards) {
      const owner = byPhysical.get(physical);
      if (owner) throw new Error(`实体 Card“${physical.id}”已属于 UsedCard“${owner.id}”。`);
    }
  };

  const unbindPhysical = (card: UsedCardInstance): void => {
    for (const physical of card.physicalCards) {
      if (byPhysical.get(physical) === card) byPhysical.delete(physical);
    }
  };

  const moveMaterials = async (
    card: UsedCard,
    target: UsedCardMaterialMove | undefined,
  ): Promise<void> => {
    if (card.physicalCards.length === 0) return;
    if (!target) throw new Error('非零材料 UsedCard 的生命周期动作必须提供实体牌移动目标。');

    const moved = await cards.moveCards({
      cards: card.physicalCards,
      toArea: target.toArea,
      enterCards: target.enterCards,
      reason: target.reason,
      mover: target.mover,
    });
    if (!sameCards(moved, card.physicalCards)) {
      throw new Error('UsedCard 的实体材料未全部完成 Card.moveCards。');
    }
  };

  const createInstance = (card: UsedCard): UsedCardInstance => {
    if ('id' in card) throw new Error('不能把 UsedCardInstance 再次作为纯 UsedCard enter。');
    assertPhysicalUnbound(card);
    const instance = Object.freeze({
      ...card,
      id: `used-card-${nextId++}` as UsedCardId,
    });
    known.add(instance);
    active.set(instance.id, instance);
    return instance;
  };

  let usedCards: UsedCardRuntime;

  usedCards = {
    get all(): readonly UsedCardInstance[] {
      return Object.freeze([...active.values()]);
    },

    areaOf(card: UsedCardInstance): UsedCardArea | null {
      assertKnown(card);
      return locations.get(card.id) ?? null;
    },

    ofPhysical(card: Card): UsedCardInstance | null {
      // CardRuntime 负责拒绝外局/伪 Card；这里通过查询复用该断言。
      cards.areaOf(card);
      return byPhysical.get(card) ?? null;
    },

    registerArea(input) {
      assertNonBlank(input.id, 'UsedCardAreaId');
      if (areaRecords.has(input.id)) {
        throw new Error(`当前 Runtime 已存在 UsedCardAreaId“${input.id}”。`);
      }
      if (input.usedCards().length > 0) {
        throw new Error(`UsedCardArea“${input.id}”注册时必须为空。`);
      }

      let record: AreaRecord;
      const area: UsedCardArea = Object.freeze({
        id: input.id,
        get usedCards(): readonly UsedCardInstance[] {
          return input.usedCards();
        },
        leave: async (card: UsedCardInstance): Promise<void> => {
          assertActive(card);
          if (locations.get(card.id) !== area) {
            throw new Error(`UsedCard“${card.id}”不在 Area“${area.id}”中。`);
          }
          assertExactOccurrence(record.usedCards(), card, 1, area.id);
          try {
            record.remove(card);
          } catch (error) {
            if (countIdentity(record.usedCards(), card) === 0) locations.delete(card.id);
            throw error;
          }
          assertExactOccurrence(record.usedCards(), card, 0, area.id);
          locations.delete(card.id);
        },
      });
      record = { area, usedCards: input.usedCards, remove: input.remove };
      areaRecords.set(area.id, record);

      return Object.freeze({
        area,
        enter(insert: (card: UsedCardInstance) => void): EnterUsedCard {
          const enter: EnterUsedCard = async (card) => {
            assertActive(card);
            if (locations.has(card.id)) {
              throw new Error(`UsedCard“${card.id}”已有 Area，不能进入“${area.id}”。`);
            }
            try {
              insert(card);
            } catch (error) {
              if (countIdentity(record.usedCards(), card) === 1) locations.set(card.id, area);
              throw error;
            }
            assertExactOccurrence(record.usedCards(), card, 1, area.id);
            locations.set(card.id, area);
          };
          enterAreas.set(enter, area);
          return enter;
        },
      });
    },

    async enter(card, input): Promise<UsedCardInstance> {
      assertEnter(input.toArea, input.enter);
      const instance = createInstance(card);
      await moveMaterials(instance, input.materials);
      await input.enter(instance);
      if (locations.get(instance.id) !== input.toArea) {
        throw new Error(`UsedCard“${instance.id}”首次进入后的 Area 索引不正确。`);
      }
      bindPhysical(instance);
      return instance;
    },

    async move(card, input): Promise<void> {
      assertActive(card);
      assertEnter(input.toArea, input.enter);
      const from = locations.get(card.id);
      if (!from) throw new Error(`UsedCard“${card.id}”当前没有来源 Area。`);

      await from.leave(card);
      unbindPhysical(card);
      await moveMaterials(card, input.materials);
      await input.enter(card);
      if (locations.get(card.id) !== input.toArea) {
        throw new Error(`UsedCard“${card.id}”迁移后的 Area 索引不正确。`);
      }
      bindPhysical(card);
    },

    async exit(card, materials): Promise<void> {
      assertActive(card);
      const from = locations.get(card.id);
      if (!from) throw new Error(`UsedCard“${card.id}”当前没有来源 Area。`);

      await from.leave(card);
      unbindPhysical(card);
      await moveMaterials(card, materials);
      active.delete(card.id);
    },

    async settle(card, expectedArea, materials): Promise<boolean> {
      assertKnown(card);
      assertArea(expectedArea);
      if (active.get(card.id) !== card) return false;
      if (locations.get(card.id) !== expectedArea) return false;
      await usedCards.exit(card, materials);
      return true;
    },

    verify(): readonly string[] {
      const issues: string[] = [];
      const physicalClaims = new Map<Card, UsedCardInstance>();
      const areaClaims = new Map<UsedCardId, UsedCardArea>();

      for (const record of areaRecords.values()) {
        for (const card of record.usedCards()) {
          if (active.get(card.id) !== card) {
            issues.push(`Area“${record.area.id}”包含非活跃 UsedCard“${card.id}”。`);
          }
          const prior = areaClaims.get(card.id);
          if (prior) {
            issues.push(`UsedCard“${card.id}”同时位于 Area“${prior.id}”与“${record.area.id}”。`);
          } else {
            areaClaims.set(card.id, record.area);
          }
          if (locations.get(card.id) !== record.area) {
            issues.push(`UsedCard“${card.id}”的 Area 内容与位置索引不一致。`);
          }
        }
      }

      for (const card of active.values()) {
        if (!locations.has(card.id)) issues.push(`活跃 UsedCard“${card.id}”没有 Area。`);
        for (const physical of card.physicalCards) {
          const prior = physicalClaims.get(physical);
          if (prior && prior !== card) {
            issues.push(`实体 Card“${physical.id}”被多个 UsedCard 声明。`);
          }
          physicalClaims.set(physical, card);
          if (byPhysical.get(physical) !== card) {
            issues.push(`实体 Card“${physical.id}”的 UsedCard 反查不一致。`);
          }
          if (cards.areaOf(physical) === null) {
            issues.push(`活跃 UsedCard“${card.id}”的实体 Card“${physical.id}”没有物理 Area。`);
          }
        }
      }

      for (const [physical, card] of byPhysical) {
        if (active.get(card.id) !== card || physicalClaims.get(physical) !== card) {
          issues.push(`实体 Card“${physical.id}”存在 UsedCard 反查幽灵。`);
        }
      }
      return Object.freeze(issues);
    },
  };

  const handlePhysicalCardLeave: HandlePhysicalCardLeave = async (
    physical,
    expectedUsedCardArea,
    processing,
  ) => {
    assertArea(expectedUsedCardArea);
    const card = byPhysical.get(physical);
    if (!card) return false;
    assertActive(card);
    if (locations.get(card.id) !== expectedUsedCardArea) {
      throw new Error(`实体 Card“${physical.id}”对应的 UsedCard 不在预期 Area。`);
    }

    await expectedUsedCardArea.leave(card);
    unbindPhysical(card);
    active.delete(card.id);

    const remaining = card.physicalCards.filter(candidate => (
      candidate !== physical && cards.areaOf(candidate) !== null
    ));
    if (remaining.length > 0) {
      const moved = await cards.moveCards({
        cards: remaining,
        toArea: processing.area,
        enterCards: processing.enterCards,
        reason: 'used-card-break',
      });
      if (!sameCards(moved, remaining)) {
        throw new Error(`UsedCard“${card.id}”破坏后的剩余实体材料未全部进入处理区。`);
      }
    }
    return true;
  };

  return Object.freeze({ usedCards, handlePhysicalCardLeave });
}

/** 把一个具体 UsedCardArea 与对应 CardArea 的离区完整性反作用连接起来。 */
export function installUsedCardAreaIntegrity(input: {
  readonly cardArea: CardArea;
  readonly usedCardArea: UsedCardArea;
  readonly processingArea: CardArea;
  readonly enterProcessing: EnterCards;
  readonly handlePhysicalCardLeave: HandlePhysicalCardLeave;
}): () => void {
  return input.cardArea.onLeave(async card => {
    await input.handlePhysicalCardLeave(
      card,
      input.usedCardArea,
      { area: input.processingArea, enterCards: input.enterProcessing },
    );
  });
}

export function createListUsedCardArea(
  usedCards: UsedCardRuntime,
  id: UsedCardAreaId,
) {
  const content: UsedCardInstance[] = [];
  const registered = usedCards.registerArea({
    id,
    usedCards: () => content,
    remove: (card) => {
      const index = content.indexOf(card);
      if (index < 0) throw new Error(`UsedCard“${card.id}”不在列表 Area“${id}”中。`);
      content.splice(index, 1);
    },
  });
  const append = registered.enter(card => { content.push(card); });
  const prepend = registered.enter(card => { content.unshift(card); });
  return Object.freeze({ ...registered, append, prepend });
}

function sameCards(left: readonly Card[], right: readonly Card[]): boolean {
  return left.length === right.length
    && left.every((card, index) => card === right[index]);
}

function countIdentity(
  cards: readonly UsedCardInstance[],
  target: UsedCardInstance,
): number {
  let count = 0;
  for (const card of cards) if (card === target) count++;
  return count;
}

function assertExactOccurrence(
  cards: readonly UsedCardInstance[],
  target: UsedCardInstance,
  expected: number,
  areaId: UsedCardAreaId,
): void {
  const actual = countIdentity(cards, target);
  if (actual !== expected) {
    throw new Error(
      `UsedCardArea“${areaId}”中 UsedCard“${target.id}”的数量应为 ${expected}，实际为 ${actual}。`,
    );
  }
}

function assertNonBlank(value: string, name: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} 不能为空。`);
  }
}
