// ============================================================
// 实体牌层 — 低层物理移动原语（**无身份区守卫**）
//
// 唯一物理写点：取出 → （离开驻留区则发 UC 层钩子）→ 放入（容器方法同步 cardIndex）。
// 公开入口是 cardActions.moveCards（对装备槽/判定区终点**硬报错**）；
// 本函数供 UC 层（usedCardActions）与牌堆顶底策略（putTop/putBottom）使用。
//
// 物理层不认识 UC：离开驻留区时只调 game.usedCardHooks，UC 的存在与处置全在 UC 层。
// ============================================================

import type { Card, CardLocation, CardMoveReason, Player } from '../types.js';
import { CardArea } from './cardArea.js';
import { isResidentZone } from './usedCards.js';
import type { EquipSlot } from './usedCards.js';
import { EventType, GameEvent } from '../events/index.js';
import type { CardMoveEventData } from '../events/index.js';
import type { Game } from '../game.js';

/** 一次物理移动的规格（不含身份语义） */
export interface PhysicalMoveSpec {
  cards: Card[];
  to: CardLocation;
  reason: CardMoveReason;
  mover?: Player;
  /** 仅 deck 终点有意义（putBottom / 观星放回） */
  atBottom?: boolean;
  /** 装备槽终点的槽位；进入装备区必须经 UC 层，槽位由 UC 身份决定 */
  equipSlot?: EquipSlot;
}

/** 查询一张牌当前所在位置；不在任何位置返回 null（集中索引查询） */
export function getCardArea(game: Game, card: Card): CardLocation | null {
  return game.cardIndex.get(card.id) ?? null;
}

/** 两个物理位置是否同一容器（玩家按引用比较；装备区槽位不算位置） */
export function sameCardLocation(
  a: CardLocation | null | undefined,
  b: CardLocation | null | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  if ('player' in a) return 'player' in b && a.player === b.player && a.zone === b.zone;
  return !('player' in b) && a.zone === b.zone;
}

/** 定位某个 CardLocation 对应的列表式容器（装备区非列表，返回 null） */
function listAreaAt(game: Game, loc: CardLocation): CardArea | null {
  if ('player' in loc) {
    if (loc.zone === 'hand') return loc.player.hand;
    if (loc.zone === 'judgment') return loc.player.judgment;
    return null; // equipment
  }
  return game.state[loc.zone] as CardArea;
}

/** 从位置移除一张牌（按 id；同步索引）。不在该位置返回 null。 */
function takeCardFromLocation(game: Game, loc: CardLocation, cardId: number): Card | null {
  if ('player' in loc && loc.zone === 'equipment') {
    const eq = loc.player.equipment;
    for (const slot of ['weapon', 'armor', 'defensiveHorse', 'offensiveHorse'] as const) {
      if (eq[slot]?.id === cardId) {
        const card = eq[slot]!;
        eq[slot] = undefined;
        game.cardIndex.delete(cardId);
        return card;
      }
    }
    return null;
  }
  const area = listAreaAt(game, loc);
  if (!area) return null;
  // removeById 内部同步索引
  return area.removeById(cardId);
}

/** 把一张牌放入位置（牌堆按 atBottom 决定放底/放顶，默认顶；同步索引） */
function putCardToLocation(
  game: Game,
  loc: CardLocation,
  card: Card,
  atBottom: boolean,
  equipSlot: EquipSlot | undefined,
): void {
  if ('player' in loc && loc.zone === 'equipment') {
    if (!equipSlot) {
      throw new Error(
        `CardArea: 进入装备区必须由 UC 层指定槽位（card #${card.id}）`,
      );
    }
    const eq = loc.player.equipment;
    const occupied = eq[equipSlot];
    if (occupied && occupied.id !== card.id) {
      throw new Error(
        `CardArea: ${loc.player.name} 的装备槽 ${equipSlot} 已被 #${occupied.id} 占用，无法放入 #${card.id}`,
      );
    }
    eq[equipSlot] = card;
    game.cardIndex.set(card.id, loc);
    return;
  }
  const area = listAreaAt(game, loc);
  if (!area) throw new Error(`CardArea: 未知放置位置 ${JSON.stringify(loc)}`);
  if (atBottom && loc.zone === 'deck') area.insertAt(0, card);
  else area.add(card); // add 内部做唯一性校验 + 索引写入
}

/**
 * 统一物理移动原语：把一组已知牌移到终点位置，产生一次 CardMove 事件。
 * - 来源区域由引擎对每张牌经集中索引派生（from 派生）
 * - 不在任何位置的牌自动跳过（部分成功语义）
 * - 空移动不发事件；返回实际移动的牌
 * - 实体牌离开**驻留区**（装备槽/判定区/处理区）时调用 UC 层钩子（本层不解释其语义）
 */
export async function movePhysical(game: Game, spec: PhysicalMoveSpec): Promise<Card[]> {
  if (spec.cards.length === 0) return [];

  // from 派生：集中索引查询每张牌的位置
  const entries: { card: Card; from: CardLocation }[] = [];
  for (const card of spec.cards) {
    const from = getCardArea(game, card);
    if (from) entries.push({ card, from });
  }
  if (entries.length === 0) return [];

  const data: CardMoveEventData = {
    cards: entries.map((e) => e.card),
    fromAreas: entries.map((e) => e.from),
    to: spec.to,
    reason: spec.reason,
    mover: spec.mover,
  };

  let moved: Card[] = [];
  await new GameEvent<CardMoveEventData>(EventType.CardMove, data, game)
    .execute(async (event) => {
      moved = [];
      for (let i = 0; i < event.data.cards.length; i++) {
        const card = event.data.cards[i];
        const from = event.data.fromAreas[i];
        const removed = takeCardFromLocation(game, from, card.id);
        if (!removed) continue;
        // 离开驻留区 → 通知 UC 层（破坏倒查/剩余实体牌处置由 UC 层负责）
        if (isResidentZone(from)) {
          await game.usedCardHooks?.onCardLeaveResidentZone?.(game, from, removed);
        }
        putCardToLocation(game, event.data.to, removed, spec.atBottom ?? false, spec.equipSlot);
        moved.push(removed);
      }
    });
  return moved;
}
