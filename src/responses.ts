// ============================================================
// 三国杀最小原型 — 响应规则注册表
//
// 响应窗口与出牌阶段分开放：响应规则由 request 驱动，
// 各自拥有 canUse / selectionPlan / resolve / ai，上下文独立。
// ============================================================

import type { Game } from './game.js';
import type { Card, CardType, Player } from './types.js';
import { asUsedCard } from './cardRegistry.js';
import { playUsedCard, useCard } from './cardActions.js';
import type { UseAction } from './useWindow.js';
import type { SelectionAnswers, SelectionPlan } from './selection.js';

/** 单次响应结果：done 成功；retry 未成功可重新询问（如八卦阵判定失败） */
export type ResponseOutcome = 'done' | 'retry';

export interface ResponseRequest {
  type: 'play' | 'use';
  cardType: CardType;
  /** 使用型的目标（急救 / 桃的濒死角色） */
  target?: Player;
}

export interface ResponseRule {
  name: string;
  /** 只对哪种响应牌型生效（闪 / 杀 / 桃 / 无懈） */
  respondsTo: CardType;
  /** 需要玩家拥有的武将技能；装备类与武将无关则省略 */
  ownerSkill?: string;
  canUse: (game: Game, player: Player, request: ResponseRequest) => boolean;
  selectionPlan: (game: Game, player: Player, request: ResponseRequest) => SelectionPlan;
  resolve: (
    game: Game,
    player: Player,
    request: ResponseRequest,
    answers: SelectionAnswers,
  ) => Promise<ResponseOutcome>;
  ai: {
    shouldUse: (game: Game, player: Player, request: ResponseRequest) => boolean;
    priority: number;
  };
}

const _rules = new Map<string, ResponseRule>();

export const responseRuleRegistry = {
  register(rule: ResponseRule): void {
    _rules.set(rule.name, rule);
  },
  get(name: string): ResponseRule | undefined {
    return _rules.get(name);
  },
  all(): IterableIterator<ResponseRule> {
    return _rules.values();
  },
};

/** 收集满足当前响应请求的规则（respondsTo + 技能归属 + 规则 + AI） */
export function collectResponseRules(
  game: Game,
  player: Player,
  request: ResponseRequest,
  usedRules: ReadonlySet<string> = new Set(),
): ResponseRule[] {
  const rules: ResponseRule[] = [];
  for (const rule of responseRuleRegistry.all()) {
    if (rule.respondsTo !== request.cardType) continue;
    if (usedRules.has(rule.name)) continue;
    if (rule.ownerSkill && !player.hero.skills?.includes(rule.ownerSkill)) continue;
    if (!rule.canUse(game, player, request)) continue;
    if (!rule.ai.shouldUse(game, player, request)) continue;
    rules.push(rule);
  }
  return rules;
}

/** 构建一次响应窗口的动作候选：真牌 + 规则 + 放弃 */
export function buildResponseActions(
  game: Game,
  player: Player,
  request: ResponseRequest,
  usedRules: ReadonlySet<string> = new Set(),
): UseAction[] {
  const actions: UseAction[] = [];

  for (const card of player.hand.filter((c) => c.type === request.cardType)) {
    actions.push({
      id: `real:${card.id}`,
      label: card.name,
      group: 'real',
      priority: 100,
      data: card,
    });
  }

  for (const rule of collectResponseRules(game, player, request, usedRules)) {
    actions.push({
      id: `rule:${rule.name}`,
      label: rule.name,
      group: 'rule',
      priority: rule.ai.priority,
      data: rule,
      continuation: (g, p) => rule.selectionPlan(g, p, request),
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
    const rule = action.data as ResponseRule;
    return rule.resolve(game, player, request, answers);
  }
  return 'done'; // decline 由调用方在此之前处理
}
