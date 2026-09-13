// ============================================================
// 驻留 UsedCard（UC）— 停在身份区（装备槽 / 判定区）期间的效果牌
//
// 概念分工（见 docs/代码结构.md 与 TODO「驻留 UsedCard 建模」）：
//   - 实体牌 Card：物理存在与唯一位置（CardArea + cardIndex）
//   - 瞬时 UsedCard：一次使用/打出的"效果牌"，随事件消亡
//   - 驻留 UsedCard：停在身份区期间的效果牌，寿命 = 驻留时间；完全**不守恒**
//     （离开身份区即销毁；除显式迁移语义外无存活路径）
//
// 本模块只做"模型 + 注册表 + 倒查索引"；进入/离开身份区的钩子与"破坏后剩余实体牌
// 置入弃牌堆"的移动流程在 position/cardActions.ts（唯一物理写点）。
// 持有者/区域不另存状态：一律从 cardIndex 的实体牌位置派生。
//
// 延后（等真实用例）：UC 上挂技能/效果（grants）、失效（disabled）、存储（storage）、
// UC 整体迁移语义（木牛流马）。`as` 已支持"视为另一张牌"（国色类转化），但转化来源未接线。
// ============================================================

import { CardTag } from '../types.js';
import type { Card, CardLocation, CardType, Player, UsedCard } from '../types.js';
import type { Game } from '../game.js';
import { cardRegistry } from '../content/cardRegistry.js';

/** 身份区分类（语义在 UC 上，不在容器上） */
export type ResidentSlot = 'weapon' | 'armor' | 'defensiveHorse' | 'offensiveHorse' | 'judgment';

/** 驻留 UsedCard：与瞬时 UsedCard 同一语义单位，寿命 = 在身份区驻留的时间 */
export interface ResidentUsedCard extends UsedCard {
  slot: ResidentSlot;
}

export interface UsedCardRegistry {
  all(): IterableIterator<ResidentUsedCard>;
  /** 倒查：实体牌（或 id）→ 它所属的驻留 UC */
  ofPhysical(card: Card | number): ResidentUsedCard | undefined;
  /** 某玩家某身份区内的 UC（由 cardIndex 派生位置） */
  inZone(game: Game, player: Player, zone: 'equipment' | 'judgment'): ResidentUsedCard[];
  /** 某玩家某分类的 UC（如青釭剑的"目标防具"：slot === 'armor'） */
  inSlot(game: Game, player: Player, slot: ResidentSlot): ResidentUsedCard[];
  /** 登记一条 UC（进入身份区时调用；同一实体牌重复绑定即抛错 = 唯一性硬校验） */
  register(uc: ResidentUsedCard): void;
  /** 销毁一条 UC（离开身份区 / 被破坏时调用） */
  remove(uc: ResidentUsedCard): void;
  size(): number;
}

export function createUsedCardRegistry(): UsedCardRegistry {
  const all: ResidentUsedCard[] = [];
  const byPhysical = new Map<number, ResidentUsedCard>();

  const ownerOf = (game: Game, uc: ResidentUsedCard): Player | undefined => {
    const loc = locationOf(game, uc);
    return loc && 'player' in loc ? loc.player : undefined;
  };

  return {
    all(): IterableIterator<ResidentUsedCard> {
      return all.values();
    },
    ofPhysical(card: Card | number): ResidentUsedCard | undefined {
      const id = typeof card === 'number' ? card : card.id;
      return byPhysical.get(id);
    },
    inZone(game: Game, player: Player, zone: 'equipment' | 'judgment'): ResidentUsedCard[] {
      return all.filter((uc) => {
        const loc = locationOf(game, uc);
        return !!loc && 'player' in loc && loc.player === player && loc.zone === zone;
      });
    },
    inSlot(game: Game, player: Player, slot: ResidentSlot): ResidentUsedCard[] {
      return all.filter((uc) => uc.slot === slot && ownerOf(game, uc) === player);
    },
    register(uc: ResidentUsedCard): void {
      for (const c of uc.physicalCards) {
        const existing = byPhysical.get(c.id);
        if (existing) {
          throw new Error(
            `UsedCardRegistry: card #${c.id} is already bound to used card "${existing.name}"`,
          );
        }
      }
      all.push(uc);
      for (const c of uc.physicalCards) byPhysical.set(c.id, uc);
    },
    remove(uc: ResidentUsedCard): void {
      const i = all.indexOf(uc);
      if (i >= 0) all.splice(i, 1);
      for (const c of uc.physicalCards) {
        if (byPhysical.get(c.id) === uc) byPhysical.delete(c.id);
      }
    },
    size(): number {
      return all.length;
    },
  };
}

/** UC 的实体牌当前位置（取首张；多牌 UC 的实体牌应同处一区，由对账保证） */
export function locationOf(game: Game, uc: ResidentUsedCard): CardLocation | null {
  const first = uc.physicalCards[0];
  if (!first) return null;
  return game.cardIndex.get(first.id) ?? null;
}

/** 装备牌类型 → 槽位分类（卡牌定义 tags 决定；转化类 UC 可由内容层另行指定） */
export function slotOfEquipType(type: CardType): ResidentSlot | null {
  const def = cardRegistry.get(type);
  if (!def) return null;
  if (def.tags.includes(CardTag.Weapon)) return 'weapon';
  if (def.tags.includes(CardTag.Armor)) return 'armor';
  if (def.tags.includes(CardTag.DefensiveHorse)) return 'defensiveHorse';
  if (def.tags.includes(CardTag.OffensiveHorse)) return 'offensiveHorse';
  return null;
}

/** 由实体牌构造"视为自身"的驻留 UC（普通装备牌 / 普通延时锦囊） */
export function residentUsedCardOf(card: Card, slot: ResidentSlot): ResidentUsedCard {
  return {
    type: card.type,
    name: card.name,
    suit: card.suit,
    number: card.number,
    physicalCards: [card],
    slot,
  };
}
