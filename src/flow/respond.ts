// ============================================================
// 三国杀最小原型 — 响应流程（窗口的执行侧）
//
// 响应窗口的**候选**在决策侧（`decision/responseChoices.ts` + `useWindow.chooseUseAction`），
// **执行**在这里（`executeResponse`：useCard / playUsedCard / effect.resolve）——
// 与出牌窗口同构：决策产意图、流程执行（ADR-0010 红线 3）。
// 杀→闪、决斗、南蛮的"打出"响应都走同一窗口。
// ============================================================

import { CardType } from '../types.js';
import type { Card, Player, UsedCard } from '../types.js';
import type { Game } from '../game.js';
import { EventType, GameEvent } from '../events/index.js';
import type { ShaCancelledEventData } from '../events/index.js';
import { asUsedCard } from '../position/usedCards.js';
import { cardEmoji } from '../rules/cardFace.js';
import {
  enterUsedCard, materializeUsedCard, playUsedCard, settleUsedCard,
} from '../position/usedCardActions.js';
import { useCard } from './useCard.js';
import { chooseUseAction } from '../decision/useWindow.js';
import { buildResponseActions } from '../decision/responseChoices.js';
import type { UseAction } from '../decision/useWindow.js';
import type { SelectionAnswers } from '../decision/selection.js';
import { effectRegistry } from '../effects/persistentEffects.js';
import type {
  ResponseEffect, ResponseOutcome, ResponseRequest,
} from '../effects/effects.js';

/**
 * 执行选中的响应动作（响应窗口的**执行侧**），返回是否成功 / 是否重试。
 * 决策侧只给"动作 + 答案"（`decision/responseChoices.buildResponseActions` + `chooseUseAction`），
 * 使用与打出在这里发生——与出牌阶段（`gameFlow.playPhase` 拿 action 去 useCard）同一分工。
 */
export async function executeResponse(
  game: Game,
  player: Player,
  request: ResponseRequest,
  action: UseAction,
  answers: SelectionAnswers,
): Promise<ResponseOutcome> {
  if (action.group === 'real') {
    const physical = action.data as Card;
    const uc = materializeUsedCard(game, physical);
    // 响应关系记录：本次使用/打出响应了哪次生效（无懈/闪据此与"被响应者"挂钩）
    const responded = request.respondTo;
    if (responded) {
      responded.cardsResponded = responded.cardsResponded ?? [];
      responded.cardsResponded.push(uc);
    }
    if (request.type === 'use') {
      await useCard(game, {
        player,
        card: uc,
        targets: request.target ? [request.target] : [],
        responseTo: responded,
      });
    } else {
      await playUsedCard(game, player, uc);
    }
    return 'done';
  }
  if (action.group === 'rule') {
    const effect = action.data as ResponseEffect;
    const resolved = await effect.resolve(game, player, request, answers);
    // 零牌虚拟牌（八卦阵视为闪）：同样按"打出 = UC 进处理区 → 收尾"结算
    if (resolved === 'done' && effect.virtualCard) {
      const uc = game.usedCards.create(
        {
          type: effect.virtualCard,
          name: game.ruleSet.cards.get(effect.virtualCard)?.name ?? effect.virtualCard,
        },
        [],
      );
      await enterUsedCard(game, uc, { kind: 'processing' }, { reason: 'play' });
      await settleUsedCard(game, uc, 'play');
    }
    return resolved;
  }
  return 'done'; // decline 由调用方在此之前处理
}

/**
 * 结算一张杀的闪响应，返回是否被抵消。
 * - 不可响应（`disresponsive`：铁骑等）→ 跳过响应，未抵消
 * - 所需闪数（无双 = 常驻 'shaRequired' 查询）→ 逐张询问；成功后再问下一张
 * - 全部出完 → 触发 shaCancelled 抵消时点（青龙偃月刀/贯石斧监听）
 */
export async function resolveShaResponse(
  game: Game,
  attacker: Player,
  defender: Player,
  shaCard: Card | UsedCard,
  opts: { disresponsive?: boolean } = {},
): Promise<boolean> {
  const usedCard = asUsedCard(shaCard);
  if (opts.disresponsive) {
    console.log(`  ⚡${defender.name} 无法闪避！`);
    return false;
  }

  const need = 1 + effectRegistry.sum(game, attacker, 'shaRequired');
  const request: ResponseRequest = { type: 'play', cardType: CardType.Shan };

  for (let i = 0; i < need; i++) {
    const usedEffects = new Set<ResponseEffect>();
    // 八卦阵失败（retry）时重新询问
    while (true) {
      const choice = await chooseUseAction(
        game,
        defender,
        buildResponseActions(game, defender, request, usedEffects),
      );
      if (!choice || choice.action.group === 'decline') {
        console.log(`  ${defender.name} 无法打出闪！`);
        return false; // 已出的闪不返还，杀命中
      }
      const outcome = await executeResponse(game, defender, request, choice.action, choice.answers);
      if (outcome === 'retry') {
        usedEffects.add(choice.action.data as ResponseEffect);
        continue;
      }
      if (outcome === 'done') {
        console.log(`  ${defender.name} 使用了 ${cardEmoji(game, CardType.Shan)}，抵消了攻击`);
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
  const usedEffects = new Set<ResponseEffect>();
  while (true) {
    const choice = await chooseUseAction(game, player, buildResponseActions(game, player, request, usedEffects));
    if (!choice || choice.action.group === 'decline') return false;
    const outcome = await executeResponse(game, player, request, choice.action, choice.answers);
    if (outcome === 'retry') {
      usedEffects.add(choice.action.data as ResponseEffect);
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
  const usedEffects = new Set<ResponseEffect>();
  while (true) {
    const choice = await chooseUseAction(game, player, buildResponseActions(game, player, request, usedEffects));
    if (!choice || choice.action.group === 'decline') return false;
    const outcome = await executeResponse(game, player, request, choice.action, choice.answers);
    if (outcome === 'retry') {
      usedEffects.add(choice.action.data as ResponseEffect);
      continue;
    }
    return outcome === 'done';
  }
}

/**
 * 决斗中一个角色的单次响应：需打出 required 张杀（无双② = 常驻 'juedouShaRequired' 查询），逐张询问。
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
    console.log(`  ${player.name} 打出了 ${cardEmoji(game, CardType.Sha)}`);
  }
  return true;
}
