// ============================================================
// UsedCard 层 — UC 实体、容器位置与存储（边界契约见演进 3.5）
//
// 分层：
//   实体牌层 = Card + CardArea + 选择 + moveCards（见 move.ts / cardActions.ts）—— **不认识 UC**；
//   UC 层   = 本模块（实体、位置、存储）+ usedCardActions.ts（进入/移动/退出）—— 身份区的唯一写入者。
//
// UC 判据：**能承载转化（含 0 牌虚拟）的牌的出现才是 UC**。
//   - 是 UC：使用（基本/锦囊/装备）、响应窗口的打出、八卦阵零牌虚拟闪、装备区/判定区驻留；
//   - 不是 UC：判定牌（含鬼才替换的判定牌）、观星亮出的牌 —— 只是被亮出/摆放的实体牌；
//   - 手牌/牌堆/弃牌堆里的牌是 UC 的来源，本身不是 UC。
//
// 位置 `loc` 与顺序 `seq` 是 UC 的**状态**（不再从"首张实体牌"派生）；
// UC 完全不守恒：只有显式 move 是迁移，其余离区一律由钩子破坏。
//
// 本模块只有类型 + 存储 + 纯谓词，不产生任何物理移动（那是 usedCardActions）。
// ============================================================

import type { Card, CardLocation, CardType, Player } from '../types.js';
import type { Game } from '../game.js';

/** 装备槽位（UC 层分类；也是实体牌在装备区的实际落点） */
export type EquipSlot = 'weapon' | 'armor' | 'defensiveHorse' | 'offensiveHorse';

/** 槽位遍历顺序（固定顺序，便于对账与显示） */
export const EQUIP_SLOTS: readonly EquipSlot[] =
  ['weapon', 'armor', 'defensiveHorse', 'offensiveHorse'];

/** UC 的规则身份（Card 与 UsedCard 都满足这个形状） */
export interface CardShape {
  type: CardType;
  name: string;
  suit: string;
  number: number;
}

/** 需要 UC 承载的容器（装备槽 / 判定区）—— 公开 moveCards 对这些终点硬报错 */
export type UsedCardZoneLocation =
  | { kind: 'equipment'; player: Player; slot: EquipSlot }
  | { kind: 'judgment'; player: Player };

/**
 * UC 的容器位置。
 * 装备槽/判定区是**双向**约束（牌必有 UC，UC 的牌必在该区）；
 * 处理区是**单向**约束（UC 的牌必在处理区，处理区的牌可以没有 UC：判定牌/观星）。
 */
export type UsedCardLocation = UsedCardZoneLocation | { kind: 'processing' };

/**
 * UsedCard 实体：规则身份（`type/name/suit/number` 即"视为什么牌"）+ 实体组成 + 容器位置。
 * 转化 = 构造时给出不同于实体牌的规则身份（如国色：方块牌 → 乐不思蜀）；
 * 无转化时两者相同（"视为自身"只是默认构造，不是写死的假设）。
 */
export interface UsedCardInstance extends CardShape {
  /** 本局内唯一的 UC 身份（事件与规则引用"这一条 UC"用） */
  id: number;
  /** 实体组成（多对一；0 牌虚拟牌为空数组） */
  physicalCards: Card[];
  /** 当前容器位置；null = 刚生成尚未入容器，或已退出 */
  loc: UsedCardLocation | null;
  /** 进入容器时分配的序号（容器内顺序的唯一来源） */
  seq: number;
}

/**
 * 物理层与 UC 层之间**唯一**的耦合点：实体牌离开驻留区时由物理层调用。
 * 物理层不知道 UC 是什么，只发通知；UC 层据此决定 UC 存亡与剩余实体牌去向。
 */
export interface UsedCardHooks {
  /** 实体牌离开驻留区（装备槽 / 判定区 / 处理区）；没有 UC 绑定时应自行 no-op */
  onCardLeaveResidentZone?(game: Game, from: CardLocation, card: Card): Promise<void>;
}

export interface UsedCardStore {
  /** 生成一条 UC（**不入容器**）：规则身份取 as，实体组成取 physicalCards（默认空 = 0 牌虚拟） */
  create(as: CardShape, physicalCards?: Card[]): UsedCardInstance;
  /** 登记入容器：写反查索引 + 落 loc/seq（重复绑定、已在容器中均抛错） */
  bind(uc: UsedCardInstance, loc: UsedCardLocation): void;
  /** 解除登记（loc 置 null）；位置的物理侧由调用方负责 */
  unbind(uc: UsedCardInstance): void;
  all(): readonly UsedCardInstance[];
  /** 某容器内的 UC，按 seq 升序（= 进入顺序，判定区结算顺序依赖它） */
  at(loc: UsedCardLocation): UsedCardInstance[];
  /** 倒查：实体牌（或 id）→ 它所属的 UC */
  ofCard(card: Card | number): UsedCardInstance | undefined;
  size(): number;
}

export function createUsedCardStore(): UsedCardStore {
  let nextId = 1;
  let nextSeq = 1;
  const all: UsedCardInstance[] = [];
  const byPhysical = new Map<number, UsedCardInstance>();

  return {
    create(as: CardShape, physicalCards: Card[] = []): UsedCardInstance {
      return {
        id: nextId++,
        type: as.type, name: as.name, suit: as.suit, number: as.number,
        physicalCards, loc: null, seq: 0,
      };
    },
    bind(uc: UsedCardInstance, loc: UsedCardLocation): void {
      if (uc.loc) {
        throw new Error(`UsedCardStore: UC "${uc.name}"(#${uc.id}) 已在容器中，请用 move`);
      }
      for (const c of uc.physicalCards) {
        const existing = byPhysical.get(c.id);
        if (existing && existing !== uc) {
          throw new Error(
            `UsedCardStore: card #${c.id} 已绑定到 UC "${existing.name}"(#${existing.id})`,
          );
        }
      }
      uc.loc = loc;
      uc.seq = nextSeq++;
      all.push(uc);
      for (const c of uc.physicalCards) byPhysical.set(c.id, uc);
    },
    unbind(uc: UsedCardInstance): void {
      const i = all.indexOf(uc);
      if (i >= 0) all.splice(i, 1);
      for (const c of uc.physicalCards) {
        if (byPhysical.get(c.id) === uc) byPhysical.delete(c.id);
      }
      uc.loc = null;
    },
    all(): readonly UsedCardInstance[] {
      return all;
    },
    at(loc: UsedCardLocation): UsedCardInstance[] {
      return all
        .filter((uc) => uc.loc !== null && sameUsedCardLocation(uc.loc, loc))
        .sort((a, b) => a.seq - b.seq);
    },
    ofCard(card: Card | number): UsedCardInstance | undefined {
      return byPhysical.get(typeof card === 'number' ? card : card.id);
    },
    size(): number {
      return all.length;
    },
  };
}

// ============================================================
// 纯谓词与位置换算
// ============================================================

/** 驻留区：UC 可停留的区（装备槽 / 判定区 / 处理区）——这些区的实体牌离开时触发 UC 层钩子 */
export function isResidentZone(loc: CardLocation): boolean {
  if ('player' in loc) return loc.zone === 'equipment' || loc.zone === 'judgment';
  return loc.zone === 'processing';
}

/** 必须由 UC 承载的终点（装备槽 / 判定区）；处理区允许无 UC 的实体牌 */
export function requiresUsedCard(loc: CardLocation): boolean {
  return 'player' in loc && (loc.zone === 'equipment' || loc.zone === 'judgment');
}

/** UC 位置 → 物理位置 */
export function physicalLocationOf(loc: UsedCardLocation): CardLocation {
  if (loc.kind === 'processing') return { zone: 'processing' };
  if (loc.kind === 'judgment') return { player: loc.player, zone: 'judgment' };
  return { player: loc.player, zone: 'equipment' };
}

/** 实体牌当前所在的驻留区（装备槽按容器现状判定）；不在驻留区返回 null */
export function residentLocationOfCard(game: Game, cardId: number): UsedCardLocation | null {
  const loc = game.cardIndex.get(cardId);
  if (!loc || !isResidentZone(loc)) return null;
  if (!('player' in loc)) return { kind: 'processing' };
  if (loc.zone === 'judgment') return { kind: 'judgment', player: loc.player };
  const slot = EQUIP_SLOTS.find((s) => loc.player.equipment[s]?.id === cardId);
  return slot ? { kind: 'equipment', player: loc.player, slot } : null;
}

/** 两个 UC 位置是否同一容器（玩家按引用比较，槽位按值比较） */
export function sameUsedCardLocation(
  a: UsedCardLocation | null,
  b: UsedCardLocation | null,
): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === 'processing' || b.kind === 'processing') return a.kind === b.kind;
  if (a.player !== b.player) return false;
  if (a.kind === 'equipment' && b.kind === 'equipment') return a.slot === b.slot;
  return a.kind === b.kind;
}
