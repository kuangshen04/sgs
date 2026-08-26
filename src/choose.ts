// ============================================================
// 三国杀最小原型 — 决策层
//
// 规则层（可选集/目标）+ 选择步骤工厂 + 选择原语（异步 ask 包装）。
// 所有决策均为"规则算可选集 → AI 决策"，AI 决策点是函数内唯一决策处；
// 真人/前端接入时在此注入。ask 只做决策不执行牌，打出/使用由调用方负责。
// ============================================================

import type { Card, Player, UsedCard } from './types.js';
import { CardType } from './types.js';
import { cardRegistry, asUsedCard } from './cardRegistry.js';
import type { CardDef } from './cardRegistry.js';
import type { Game } from './game.js';
import type { AreaName } from './areas.js';
import { equipmentCards } from './areas.js';
import { runSelection } from './selection.js';
import type {
  SelectionAnswers,
  SelectionContext,
  SelectionOption,
  SelectionPlan,
  SelectionStep,
} from './selection.js';

// ============================================================
// 规则层 — 可选集计算（不含 AI 判断）
// ============================================================

/** 一张可选的卡牌 */
export interface CardOption {
  card: Card;
  def: CardDef;
}

/** 一个可选的目标玩家 */
export interface TargetOption {
  player: Player;
  index: number; // game.state.players 中的索引
}

/** 计算可用牌（规则：canUse；AI 的 shouldUse/优先级在出牌选择流程内） */
export function computeCardOptions(
  game: Game,
  player: Player,
  shaUsed: boolean,
): CardOption[] {
  const allPlayers = game.state.players;
  return player.hand
    .map((card) => ({ card, def: cardRegistry.get(card.type) }))
    .filter(({ def }) => def && def.canUse(player, allPlayers, shaUsed))
    .map(({ card, def }) => ({ card, def: def! }));
}

/** 计算某张效果牌（可能是虚拟牌）的合法目标（规则：targetFilter + 距离/免疫等） */
export function computeTargetOptions(
  game: Game,
  card: UsedCard,
  player: Player,
): TargetOption[] {
  const def = cardRegistry.get(card.type);
  if (!def) return [];
  return def.targetFilter(player, game.state.players)
    .map((t) => ({ player: t, index: game.state.players.indexOf(t) }));
}

// ============================================================
// 选择步骤工厂
// 旧的"选牌/选目标/布尔/选项/动作"语义收敛到这些工厂里，
// 产出统一的 SelectionStep；AI 默认行为也跟随工厂注入。
// ============================================================

export interface CardsStepOptions {
  prompt?: string;
  min?: number;
  max?: number;
  validate?: (selected: Card[]) => boolean;
  ai?: (ctx: SelectionContext) => SelectionOption[];
}

/** 从任意候选牌中选牌的步骤 */
export function cardsStep(
  id: string,
  candidates: Card[],
  options: CardsStepOptions = {},
): SelectionStep {
  const min = options.min ?? 1;
  const max = options.max ?? candidates.length;
  return {
    id,
    prompt: options.prompt ?? '选择牌',
    options: candidates.map((c) => ({ id: `card:${c.id}`, label: c.name, data: c })),
    validate: (selected) => {
      const picked = selected.map((o) => o.data as Card);
      return picked.length >= min
        && picked.length <= max
        && (!options.validate || options.validate(picked));
    },
    ai: options.ai ?? ((ctx) => ctx.step.options.slice(0, min)),
  };
}

export interface HandCardsStepOptions extends Omit<CardsStepOptions, 'min' | 'max'> {
  min?: number;
  max?: number;
  filter?: (card: Card) => boolean;
}

/** 从玩家手牌中选牌的步骤 */
export function handCardsStep(
  id: string,
  player: Player,
  options: HandCardsStepOptions = {},
): SelectionStep {
  const candidates = player.hand.filter(options.filter ?? (() => true));
  return cardsStep(id, candidates, {
    prompt: options.prompt ?? '选择手牌',
    min: options.min,
    max: options.max,
    validate: options.validate,
    ai: options.ai,
  });
}

export interface TargetsStepOptions {
  prompt?: string;
  min?: number;
  max?: number;
  validate?: (selected: Player[]) => boolean;
  ai?: (ctx: SelectionContext) => SelectionOption[];
}

/** 从候选角色中选目标的步骤 */
export function targetsStep(
  id: string,
  player: Player,
  candidates: Player[],
  options: TargetsStepOptions = {},
): SelectionStep {
  const min = options.min ?? 1;
  const max = options.max ?? candidates.length;
  return {
    id,
    prompt: options.prompt ?? '选择目标',
    options: candidates.map((c, i) => ({ id: `player:${i}`, label: c.name, data: c })),
    validate: (selected) => {
      const picked = selected.map((o) => o.data as Player);
      return picked.length >= min
        && picked.length <= max
        && (!options.validate || options.validate(picked));
    },
    ai: options.ai ?? ((ctx) => {
      const self = ctx.step.options.find((o) => o.data === player);
      return self && max === 1 ? [self] : ctx.step.options.slice(0, min);
    }),
  };
}

/** 是/否步骤（两个固定选项，默认值由 AI 返回） */
export function yesNoStep(
  id: string,
  prompt: string,
  defaultValue: boolean,
): SelectionStep {
  return {
    id,
    prompt,
    options: [
      { id: 'yes', label: '是' },
      { id: 'no', label: '否' },
    ],
    validate: (selected) => selected.length === 1,
    ai: (ctx) => [defaultValue ? ctx.step.options[0] : ctx.step.options[1]],
  };
}

/** 任意选项步骤（花色猜测/位置选择等） */
export function optionStep(
  id: string,
  prompt: string,
  choices: { value: string; label: string }[],
  ai?: (ctx: SelectionContext) => SelectionOption[],
): SelectionStep {
  return {
    id,
    prompt,
    options: choices.map((c) => ({ id: c.value, label: c.label })),
    validate: (selected) => selected.length === 1,
    ai: ai ?? ((ctx) => (ctx.step.options[0] ? [ctx.step.options[0]] : [])),
  };
}

/** 动作选择步骤（出牌/技能/转化等，默认选第一个，候选应已按优先级排序） */
export function actionStep(
  id: string,
  actions: { id: string; label: string; group?: string; data?: unknown }[],
): SelectionStep {
  return {
    id,
    prompt: '选择动作',
    options: actions.map((a) => ({
      id: a.id,
      label: a.label,
      group: a.group,
      data: a.data,
    })),
    validate: (selected) => selected.length === 1,
    ai: (ctx) => (ctx.step.options[0] ? [ctx.step.options[0]] : []),
  };
}

// ============================================================
// 答案解码
// ============================================================

/** 从确认结果中解码某一步选中的实体卡牌 */
export function selectedCards(answers: SelectionAnswers, stepId: string): Card[] {
  return (answers[stepId] ?? [])
    .map((o) => o.data as Card)
    .filter((c): c is Card => !!c);
}

/** 从确认结果中解码某一步选中的目标玩家 */
export function selectedPlayers(answers: SelectionAnswers, stepId: string): Player[] {
  return (answers[stepId] ?? [])
    .map((o) => o.data as Player)
    .filter((p): p is Player => !!p);
}

// ============================================================
// 选择原语（异步 ask 包装，基于 SelectionSession）
// ============================================================

/** 只跑一个选择步骤的会话，返回所选选项；无法回答返回 null */
async function runAskStep(
  game: Game,
  player: Player,
  step: SelectionStep,
): Promise<SelectionOption[] | null> {
  const plan: SelectionPlan = {
    nextStep: (answers) => (answers[step.id] ? null : step),
  };
  const answers = await runSelection(plan, game, player);
  return answers?.[step.id] ?? null;
}

/** 询问玩家打出一张指定类型的牌（闪/杀/桃/无懈）。无牌返回 null。 */
export async function askForCard(
  game: Game,
  player: Player,
  prompt: string,
  types: CardType[],
): Promise<Card | null> {
  const candidates = player.hand.filter((c) => types.includes(c.type));
  if (candidates.length === 0) return null;
  const selected = await runAskStep(
    game,
    player,
    cardsStep('card', candidates, { prompt, min: 1, max: 1 }),
  );
  return selected?.[0]?.data as Card ?? null;
}

/** 询问从玩家区域内选一张牌（顺手牵羊/过河拆桥/寒冰剑/反馈等）。无牌返回 null。 */
export async function askFromAreas(
  game: Game,
  player: Player,
  prompt: string,
  areas: AreaName[] = ['hand', 'equipment', 'judgment'],
  filter?: (card: Card) => boolean,
): Promise<Card | null> {
  let pool: Card[] = [];
  if (areas.includes('hand')) pool.push(...player.hand);
  if (areas.includes('equipment')) pool.push(...equipmentCards(player));
  if (areas.includes('judgment')) pool.push(...player.judgment);
  if (filter) pool = pool.filter(filter);
  if (pool.length === 0) return null;

  const selected = await runAskStep(
    game,
    player,
    cardsStep('card', pool, {
      prompt,
      min: 1,
      max: 1,
      ai: (ctx) => [ctx.step.options[Math.floor(Math.random() * ctx.step.options.length)]],
    }),
  );
  return selected?.[0]?.data as Card ?? null;
}

/** 询问从任意牌池中选一张牌（五谷丰登亮出的牌等）。无候选返回 null。 */
export async function askFromCards(
  game: Game,
  player: Player,
  prompt: string,
  candidates: Card[],
): Promise<Card | null> {
  if (candidates.length === 0) return null;
  const selected = await runAskStep(
    game,
    player,
    cardsStep('card', candidates, { prompt, min: 1, max: 1 }),
  );
  return selected?.[0]?.data as Card ?? null;
}

/** 询问从候选人中选择目标（技能选目标：遗计/流离/突袭等）。无可选返回 null。 */
export async function askForTargets(
  game: Game,
  player: Player,
  prompt: string,
  candidates: Player[],
  max: number = candidates.length,
): Promise<Player[] | null> {
  if (candidates.length === 0) return null;
  const selected = await runAskStep(
    game,
    player,
    targetsStep('targets', player, candidates, {
      prompt,
      min: 0,
      max,
      ai: (ctx) => ctx.step.options.slice(0, max),
    }),
  );
  return selected
    ? selected.map((o) => o.data as Player).filter((p): p is Player => !!p)
    : null;
}

/** 询问是否发动（触发技能"你可以"：洛神继续判定等）。 */
export async function askYesNo(
  game: Game,
  player: Player,
  prompt: string,
  defaultValue = true,
): Promise<boolean> {
  const selected = await runAskStep(game, player, yesNoStep('yesNo', prompt, defaultValue));
  return selected?.[0]?.id === 'yes';
}

/** 询问一个任意选项（花色猜测/位置选择等），返回所选 value 或 null */
export async function askOption(
  game: Game,
  player: Player,
  prompt: string,
  choices: { value: string; label: string }[],
  ai?: (ctx: SelectionContext) => SelectionOption[],
): Promise<string | null> {
  if (choices.length === 0) return null;
  const selected = await runAskStep(game, player, optionStep('option', prompt, choices, ai));
  return selected?.[0]?.id ?? null;
}
