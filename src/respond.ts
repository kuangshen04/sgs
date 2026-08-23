// ============================================================
// 三国杀最小原型 — 响应流程（杀 → 闪）
// 玩家选择走 ask 家族（askForCard，默认 AI：有就出第一张）；
// 机制层：能否响应 / 所需闪数 / 抵消时点。
// 将来南蛮/决斗/万箭的响应（打出的杀/闪）复用同一骨架。
// ============================================================

import { CardType } from './types.js';
import type { Card, Player, RespondMarks, UsedCard } from './types.js';
import type { Game } from './game.js';
import { EventType, GameEvent } from './events/index.js';
import type { ShaCancelledEventData } from './events/index.js';
import { cardEmoji, displayNumber, asUsedCard } from './cardRegistry.js';
import { playFromHand } from './cardActions.js';
import { askForCard } from './choose.js';

/**
 * 结算一张杀的闪响应，返回是否被抵消。
 * - 不可闪避（铁骑标记）→ 跳过响应，未抵消
 * - 所需闪数（无双标记）→ 逐张询问：出一张后再问下一张
 * - 全部出完 → 触发 shaCancelled 抵消时点（青龙偃月刀/贯石斧监听）
 */
export async function resolveShaResponse(
  game: Game, attacker: Player, defender: Player, shaCard: Card | UsedCard, marks: RespondMarks,
): Promise<boolean> {
  const usedCard = asUsedCard(shaCard);
  if (marks.unavoidable) {
    console.log(`  ⚡${defender.name} 无法闪避！`);
    return false;
  }

  const need = marks.shanRequired ?? 1;
  for (let i = 0; i < need; i++) {
    // askForCard：是否出闪/出哪张闪（默认 AI：有就出第一张）
    // 八卦阵将来在此插入：判定红 → 视为出了一张闪，continue
    const shan = await askForCard(game, defender, '是否打出闪', [CardType.Shan]);
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
    attacker, defender, card: usedCard, shanCount: need,
  }, game).execute(async () => {});

  return true;
}

/**
 * 决斗中一个角色的单次响应：需打出 required 张杀（无双②），逐张询问。
 * 不足则失败（打不出杀 → 受到伤害）；已打出的杀不返还。
 */
export async function resolveJueDouResponse(
  game: Game, player: Player, required: number,
): Promise<boolean> {
  for (let i = 0; i < required; i++) {
    // askForCard：决斗中是否出杀/出哪张（默认 AI：有就出第一张）
    const sha = await askForCard(game, player, '是否打出杀', [CardType.Sha]);
    if (!sha) {
      console.log(`  ${player.name} 无法打出杀！`);
      return false;
    }
    await playFromHand(game, player, sha);
    console.log(
      `  ${player.name} 打出了 ${cardEmoji(CardType.Sha)} (${sha.suit}${displayNumber(sha.number)})`,
    );
  }
  return true;
}
