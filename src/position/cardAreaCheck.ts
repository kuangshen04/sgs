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
      // 装备区在位置模型里是一个位置（槽位是语义分类，见 usedCards.slot），故键不带槽位；
      // 槽位与 UC 分类的一致性由 verifyUsedCardBindings 负责。
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
 * 驻留 UsedCard 与实体牌的对账：
 * 1) UC 的每张实体牌都必须仍在该 UC 的身份区内，且分类（slot）与所在槽位一致；
 * 2) 一张实体牌至多属于一个 UC；
 * 3) 身份区（装备槽 / 判定区）里的每张实体牌都必须有归属 UC（防止漏建绑定）。
 */
function verifyUsedCardBindings(game: Game): string[] {
  const issues: string[] = [];
  const claimed = new Map<number, string>();

  for (const uc of game.usedCards.all()) {
    for (const c of uc.physicalCards) {
      const pos = identityPositionOf(game, c.id);
      if (!pos) {
        issues.push(`UC 悬空绑定：${uc.name} 的实体牌 #${c.id} 不在身份区`);
        continue;
      }
      const owner = game.usedCards.ofPhysical(c.id);
      if (owner !== uc) {
        issues.push(`UC 绑定错位：card #${c.id} 归属 ${owner?.name ?? '无'}，但被 ${uc.name} 声明`);
      }
      const prior = claimed.get(c.id);
      if (prior) issues.push(`实体牌重复绑定：card #${c.id} 同时属于 ${prior} 与 ${uc.name}`);
      claimed.set(c.id, uc.name);
      if (pos.slot !== uc.slot) {
        issues.push(`UC 分类不符：card #${c.id} 位于 ${pos.slot}，UC "${uc.name}" 声明 ${uc.slot}`);
      }
    }
  }

  // 反向：身份区里的牌必须有 UC
  for (const p of game.state.players) {
    const eq = p.equipment;
    for (const slot of ['weapon', 'armor', 'defensiveHorse', 'offensiveHorse'] as const) {
      const card = eq[slot];
      if (card && !game.usedCards.ofPhysical(card)) {
        issues.push(`身份区缺 UC：${p.name} 的 ${slot} 上 #${card.id} 没有驻留 UsedCard`);
      }
    }
    for (const card of p.judgment.cards) {
      if (!game.usedCards.ofPhysical(card)) {
        issues.push(`身份区缺 UC：${p.name} 判定区 #${card.id} 没有驻留 UsedCard`);
      }
    }
  }

  return issues;
}

/** 实体牌当前所处的身份区（含分类）；不在身份区返回 null */
function identityPositionOf(
  game: Game,
  cardId: number,
): { player: Player; zone: 'equipment' | 'judgment'; slot: string } | null {
  const loc = game.cardIndex.get(cardId);
  if (!loc || !('player' in loc)) return null;
  if (loc.zone === 'judgment') return { player: loc.player, zone: 'judgment', slot: 'judgment' };
  if (loc.zone !== 'equipment') return null;
  const eq = loc.player.equipment;
  for (const slot of ['weapon', 'armor', 'defensiveHorse', 'offensiveHorse'] as const) {
    if (eq[slot]?.id === cardId) return { player: loc.player, zone: 'equipment', slot };
  }
  return null;
}

/** 断言式封装：不一致即抛错（测试/调试断言用） */
export function assertCardState(game: Game): void {
  const issues = verifyCardState(game);
  if (issues.length > 0) {
    throw new Error(`卡牌位置对账失败：\n- ${issues.join('\n- ')}`);
  }
}
