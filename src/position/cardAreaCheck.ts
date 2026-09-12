// ============================================================
// 对账不变量校验（阶段 2）：一牌一位置 + id 唯一
//
// 双面核对：物理容器（数组权威）↔ 集中索引（派生态）。正常引擎路径下二者恒等；
// 本工具供测试/调试期 sanity net 使用（演进 3.2：只校验不变量，不做牌总数守恒）。
// ============================================================

import type { Game } from '../game.js';
import type { CardArea } from './cardArea.js';
import type { CardLocation, Player } from '../types.js';

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
    for (const slot of ['weapon', 'armor', 'defensiveHorse', 'offensiveHorse'] as const) {
      if (eq[slot]) scanSlot(eq[slot], `${p.name}:equipment:${slot}`);
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
  return issues;
}

/** 断言式封装：不一致即抛错（测试/调试断言用） */
export function assertCardState(game: Game): void {
  const issues = verifyCardState(game);
  if (issues.length > 0) {
    throw new Error(`卡牌位置对账失败：\n- ${issues.join('\n- ')}`);
  }
}
