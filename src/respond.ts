// ============================================================
// 三国杀最小原型 — 响应流程（杀 → 闪）
// 玩家选择保持写死（findResponse）；机制层：能否响应 / 所需闪数 / 抵消时点。
// 将来南蛮/决斗/万箭的响应（打出的杀/闪）复用同一骨架。
// ============================================================

import { CardType } from './types.js';
import type { Card, Player, ShaMarks } from './types.js';
import type { Game } from './game.js';
import { EventType, GameEvent } from './events/index.js';
import type { ShaCancelledEventData } from './events/index.js';
import { cardEmoji, displayNumber } from './cardRegistry.js';
import { playFromHand } from './cardActions.js';
import { findResponse } from './choose.js';

/**
 * 结算一张杀的闪响应，返回是否被抵消。
 * - 不可闪避（铁骑标记）→ 跳过响应，未抵消
 * - 所需闪数（无双标记）→ 逐张询问：出一张后再问下一张
 * - 全部出完 → 触发 shaCancelled 抵消时点（青龙偃月刀/贯石斧监听）
 */
export async function resolveShaResponse(
  game: Game, attacker: Player, defender: Player, shaCard: Card, marks: ShaMarks,
): Promise<boolean> {
  if (marks.unavoidable) {
    console.log(`  ⚡${defender.name} 无法闪避！`);
    return false;
  }

  const need = marks.shanRequired ?? 1;
  for (let i = 0; i < need; i++) {
    // TODO(玩家选择): 是否出闪/出哪张闪——写死"有就出第一张"
    // 八卦阵将来在此插入：判定红 → 视为出了一张闪，continue
    const shan = findResponse(defender, CardType.Shan);
    if (!shan) {
      console.log(`  ${defender.name} 无法打出闪！`);
      return false; // 已出的闪不返还，杀命中
    }
    await playFromHand(game, defender, shan);
    console.log(
      `  ${defender.name} 使用了 ${cardEmoji(CardType.Shan)} (${shan.suit}${displayNumber(shan.number)})，抵消了攻击`,
    );
  }

  await new GameEvent<ShaCancelledEventData>(EventType.ShaCancelled, {
    attacker, defender, card: shaCard, shanCount: need,
  }, game).execute(async () => {});

  return true;
}
