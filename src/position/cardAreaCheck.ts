// ============================================================
// 对账不变量校验：一牌一位置 + id 唯一 + UC ↔ 实体牌绑定（adr/0003）
//
// 双面核对：物理容器（数组权威）↔ 集中索引（派生态）。正常引擎路径下二者恒等；
// 本工具供测试/调试期 sanity net 使用（adr/0002：只校验不变量，不做牌总数守恒）。
// ============================================================

import type { Game } from '../game.js';
import type { CardArea } from './cardArea.js';
import type { CardLocation } from '../types.js';
import { EQUIP_SLOTS, physicalLocationOf } from './usedCards.js';
import { sameCardLocation } from './move.js';

/** 位置的人类/机器可比较键（结构相等即可比） */
function locKey(loc: CardLocation): string {
  if ('player' in loc) return `${loc.player.name}:${loc.zone}`;
  return `zone:${loc.zone}`;
}

/**
 * 核对一局内"一牌一位置 + id 唯一"，返回不一致清单；一致返回空数组。
 * 检查方向：
 * 1) 每个物理容器（手牌/判定/装备槽位/牌堆/弃牌/处理区）里的每张牌 id 在索引中有且仅有一条，
 *    且索引位置与物理位置一致；
 * 2) 索引里没有指向"物理上不存在"的幽灵条目（除已移出游戏的牌——本引擎暂无 void，先全量对账）。
 */
export function verifyCardState(game: Game): string[] {
  const issues: string[] = [];
  const physical = new Map<number, string>(); // cardId -> locKey

  function scanArea(area: CardArea, key: string): void {
    for (const c of area.cards) {
      if (physical.has(c.id)) {
        issues.push(`重复物理位置：card #${c.id} 同时在 ${physical.get(c.id)} 与 ${key}`);
        continue;
      }
      physical.set(c.id, key);
    }
  }

  for (const p of game.state.players) {
    scanArea(p.hand, `${p.name}:hand`);
    scanArea(p.judgment, `${p.name}:judgment`);
    const eq = p.equipment;
    for (const slot of EQUIP_SLOTS) {
      // 装备区在位置模型里是一个位置（槽位是 UC 位置 loc.slot 的一部分），故键不带槽位；
      // 槽位与 UC 位置的一致性由 verifyUsedCardBindings 负责。
      if (eq[slot]) scanSlot(eq[slot], `${p.name}:equipment`);
    }
  }
  function scanSlot(card: { id: number }, key: string): void {
    if (physical.has(card.id)) {
      issues.push(`重复物理位置：card #${card.id} 同时在 ${physical.get(card.id)} 与 ${key}`);
      return;
    }
    physical.set(card.id, key);
  }

  scanArea(game.state.deck, 'zone:deck');
  scanArea(game.state.discardPile, 'zone:discardPile');
  scanArea(game.state.processing, 'zone:processing');

  for (const [id, loc] of game.cardIndex) {
    const want = locKey(loc);
    const have = physical.get(id);
    if (have === undefined) {
      issues.push(`索引幽灵：card #${id} 在索引 ${want} 但物理容器中不存在`);
    } else if (have !== want) {
      issues.push(`索引与物理不一致：card #${id} 索引=${want} 物理=${have}`);
    }
  }

  issues.push(...verifyUsedCardBindings(game));
  return issues;
}

/**
 * UC 与实体牌的对账（adr/0003 的约束方向不对称）：
 * 1) UC 的每张实体牌必须**就在该 UC 所在的容器里**（位置是 UC 的状态，不是派生的）；
 * 2) 一张实体牌至多属于一条 UC，且反查索引必须指向同一条；
 * 3) **双向**（装备槽 / 判定区）：区里的每张实体牌都必须有归属 UC；
 * 4) **单向**（处理区）：UC 的实体牌必须在处理区，但处理区允许无 UC 的实体牌
 *    （判定牌 / 观星亮出 / 鬼才替换牌）。
 */
function verifyUsedCardBindings(game: Game): string[] {
  const issues: string[] = [];
  const claimed = new Map<number, string>();

  for (const uc of game.usedCards.all()) {
    if (!uc.loc) {
      issues.push(`UC 无位置：${uc.name}(#${uc.id}) 已登记但 loc 为空`);
      continue;
    }
    const want = physicalLocationOf(uc.loc);
    for (const c of uc.physicalCards) {
      const pos = game.cardIndex.get(c.id);
      if (!pos) {
        issues.push(`UC 悬空绑定：${uc.name}(#${uc.id}) 的实体牌 #${c.id} 不在任何位置`);
        continue;
      }
      if (!sameCardLocation(pos, want)) {
        issues.push(
          `UC 位置不符：card #${c.id} 在 ${locKey(pos)}，但 UC "${uc.name}" 声明 ${locKey(want)}`,
        );
      }
      const owner = game.usedCards.ofCard(c.id);
      if (owner !== uc) {
        issues.push(`UC 绑定错位：card #${c.id} 归属 ${owner?.name ?? '无'}，但被 ${uc.name} 声明`);
      }
      const prior = claimed.get(c.id);
      if (prior) issues.push(`实体牌重复绑定：card #${c.id} 同时属于 ${prior} 与 ${uc.name}`);
      claimed.set(c.id, uc.name);
    }
  }

  // 反向（仅装备槽 / 判定区）：身份区里的牌必须有 UC
  for (const p of game.state.players) {
    const eq = p.equipment;
    for (const slot of EQUIP_SLOTS) {
      const card = eq[slot];
      if (card && !game.usedCards.ofCard(card)) {
        issues.push(`身份区缺 UC：${p.name} 的 ${slot} 上 #${card.id} 没有 UsedCard`);
      }
    }
    for (const card of p.judgment.cards) {
      if (!game.usedCards.ofCard(card)) {
        issues.push(`身份区缺 UC：${p.name} 判定区 #${card.id} 没有 UsedCard`);
      }
    }
  }

  return issues;
}

/** 断言式封装：不一致即抛错（测试/调试断言用） */
export function assertCardState(game: Game): void {
  const issues = verifyCardState(game);
  if (issues.length > 0) {
    throw new Error(`卡牌位置对账失败：\n- ${issues.join('\n- ')}`);
  }
}
