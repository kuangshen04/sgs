// ============================================================
// 响应窗口 — 动作候选（决策侧）
//
// 与出牌窗口同构（`playChoices.ts`）：本模块只产**候选 + 选择计划（continuation）**，
// 由 `useWindow.chooseUseAction` 选出动作，**执行在 flow 侧**
// （`flow/respond.ts` 的 `executeResponse` 负责 useCard / playUsedCard / effect.resolve）。
// 决策不得执行：ADR-0010 红线 3。
//
// 响应规则本身是规则集里的 response 形态效果（归属技能或装备，见 effects/effects.ts）。
// ============================================================

import type { Game } from '../game.js';
import type { Player } from '../types.js';
import { effectLordGate, effectOwnedBy } from '../effects/effects.js';
import type { ResponseEffect, ResponseRequest } from '../effects/effects.js';
import type { UseAction } from './useWindow.js';

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
  return game.ruleSet.skills.responsesFor(request.cardType).filter((e) =>
    !used.has(e)
    && effectOwnedBy(game, e, player)
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
