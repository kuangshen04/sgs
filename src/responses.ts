// ============================================================
// 响应窗口 — 动作候选与执行
//
// 响应规则自阶段 3 起是 effects.ts 里的 response 形态效果（归属技能或装备）；
// 本模块只负责：按请求收集可用效果 + 真牌 + 放弃 → 构建动作候选 → 执行选中的动作。
// ============================================================

import type { Game } from './game.js';
import type { Card, Player } from './types.js';
import { asUsedCard } from './cardRegistry.js';
import { playUsedCard, useCard } from './cardActions.js';
import { effectLordGate, effectOwnedBy, responseEffectsFor } from './effects.js';
import type { ResponseEffect, ResponseOutcome, ResponseRequest } from './effects.js';
import type { UseAction } from './useWindow.js';
import type { SelectionAnswers } from './selection.js';

export type { ResponseOutcome, ResponseRequest } from './effects.js';

/** 响应效果的可读名（动作 id / label 用） */
function responseLabel(effect: ResponseEffect): string {
  return effect.name ?? effect.skill ?? '响应';
}

/** 收集满足当前响应请求的效果（respondsTo + 未用过 + 归属 + 主公门槛 + 规则 + AI） */
export function collectResponseEffects(
  game: Game,
  player: Player,
  request: ResponseRequest,
  used: ReadonlySet<ResponseEffect> = new Set(),
): ResponseEffect[] {
  return responseEffectsFor(request.cardType).filter((e) =>
    !used.has(e)
    && effectOwnedBy(e, player)
    && effectLordGate(game, player, e)
    && e.canUse(game, player, request)
    && e.ai.shouldUse(game, player, request),
  );
}

/** 构建一次响应窗口的动作候选：真牌 + 响应效果 + 放弃 */
export function buildResponseActions(
  game: Game,
  player: Player,
  request: ResponseRequest,
  used: ReadonlySet<ResponseEffect> = new Set(),
): UseAction[] {
  const actions: UseAction[] = [];

  for (const card of player.hand.cards.filter((c) => c.type === request.cardType)) {
    actions.push({
      id: `real:${card.id}`,
      label: card.name,
      group: 'real',
      priority: 100,
      data: card,
    });
  }

  for (const effect of collectResponseEffects(game, player, request, used)) {
    actions.push({
      id: `effect:${responseLabel(effect)}`,
      label: responseLabel(effect),
      group: 'rule',
      priority: effect.ai.priority,
      data: effect,
      continuation: (g, p) => effect.selectionPlan(g, p, request),
    });
  }

  actions.push({ id: 'decline', label: '放弃', group: 'decline', priority: -1 });
  return actions;
}

/** 执行选中的响应动作，返回是否成功 / 是否重试 */
export async function executeResponse(
  game: Game,
  player: Player,
  request: ResponseRequest,
  action: UseAction,
  answers: SelectionAnswers,
): Promise<ResponseOutcome> {
  if (action.group === 'real') {
    const physical = action.data as Card;
    const used = asUsedCard(physical);
    if (request.type === 'use') {
      await useCard(game, {
        player,
        card: used,
        targets: request.target ? [request.target] : [],
      });
    } else {
      await playUsedCard(game, player, used);
    }
    return 'done';
  }
  if (action.group === 'rule') {
    const effect = action.data as ResponseEffect;
    return effect.resolve(game, player, request, answers);
  }
  return 'done'; // decline 由调用方在此之前处理
}
