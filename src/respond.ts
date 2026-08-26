// ============================================================
// 三国杀最小原型 — 响应流程
// 杀→闪、决斗、南蛮的“打出”响应都走同一响应窗口：
// ResponseRequest(type: 'play') + buildResponseActions + executeResponse。
// ============================================================

import { CardType } from './types.js';
import type { Card, Player, RespondMarks, UsedCard } from './types.js';
import type { Game } from './game.js';
import { EventType, GameEvent } from './events/index.js';
import type { ShaCancelledEventData } from './events/index.js';
import { cardEmoji, asUsedCard } from './cardRegistry.js';
import { chooseUseAction } from './useWindow.js';
import { buildResponseActions, executeResponse } from './responses.js';
import type { ResponseRequest, ResponseRule } from './responses.js';

/**
 * 结算一张杀的闪响应，返回是否被抵消。
 * - 不可闪避（铁骑标记）→ 跳过响应，未抵消
 * - 所需闪数（无双标记）→ 逐张询问；成功后再问下一张
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
  const request: ResponseRequest = { type: 'play', cardType: CardType.Shan };

  for (let i = 0; i < need; i++) {
    const usedRules = new Set<string>();
    // 八卦阵失败（retry）时重新询问
    while (true) {
      const choice = await chooseUseAction(
        game,
        defender,
        buildResponseActions(game, defender, request, usedRules),
      );
      if (!choice || choice.action.group === 'decline') {
        console.log(`  ${defender.name} 无法打出闪！`);
        return false; // 已出的闪不返还，杀命中
      }
      const outcome = await executeResponse(game, defender, request, choice.action, choice.answers);
      if (outcome === 'retry') {
        usedRules.add((choice.action.data as ResponseRule).name);
        continue;
      }
      if (outcome === 'done') {
        console.log(`  ${defender.name} 使用了 ${cardEmoji(CardType.Shan)}，抵消了攻击`);
        break;
      }
      return false;
    }
  }

  await new GameEvent<ShaCancelledEventData>(EventType.ShaCancelled, {
    attacker, defender, card: usedCard, shanCount: need,
  }, game).execute(async () => {});

  return true;
}

/**
 * 一次通用的“打出”响应（决斗的杀 / 南蛮的杀 / 万箭的闪）。
 * 成功后返回 true（源牌已消费）；放弃或失败返回 false。
 */
export async function resolvePlayResponse(
  game: Game,
  player: Player,
  cardType: CardType,
): Promise<boolean> {
  const request: ResponseRequest = { type: 'play', cardType };
  const usedRules = new Set<string>();
  while (true) {
    const choice = await chooseUseAction(game, player, buildResponseActions(game, player, request, usedRules));
    if (!choice || choice.action.group === 'decline') return false;
    const outcome = await executeResponse(game, player, request, choice.action, choice.answers);
    if (outcome === 'retry') {
      usedRules.add((choice.action.data as ResponseRule).name);
      continue;
    }
    return outcome === 'done';
  }
}

/**
 * 一次通用的“使用”响应（求桃 / 无懈 / 急救等），
 * 走 useCard 生命周期；target 由 request 提供。
 */
export async function resolveUseResponse(
  game: Game,
  player: Player,
  request: ResponseRequest,
): Promise<boolean> {
  const usedRules = new Set<string>();
  while (true) {
    const choice = await chooseUseAction(game, player, buildResponseActions(game, player, request, usedRules));
    if (!choice || choice.action.group === 'decline') return false;
    const outcome = await executeResponse(game, player, request, choice.action, choice.answers);
    if (outcome === 'retry') {
      usedRules.add((choice.action.data as ResponseRule).name);
      continue;
    }
    return outcome === 'done';
  }
}

/**
 * 决斗中一个角色的单次响应：需打出 required 张杀（无双②），逐张询问。
 * 不足则失败（打不出杀 → 受到伤害）；已打出的杀不返还。
 */
export async function resolveJueDouResponse(
  game: Game, player: Player, required: number,
): Promise<boolean> {
  for (let i = 0; i < required; i++) {
    if (!(await resolvePlayResponse(game, player, CardType.Sha))) {
      console.log(`  ${player.name} 无法打出杀！`);
      return false;
    }
    console.log(`  ${player.name} 打出了 ${cardEmoji(CardType.Sha)}`);
  }
  return true;
}
