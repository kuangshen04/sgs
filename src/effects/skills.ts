// ============================================================
// 技能基础设施 — 效果分发入口（installEffects）与查询助手
//
// 阶段 3 起：技能不再是"注册表里的一条行为"，而是 effects.ts 里的
// "元数据 + 效果集合"；本模块只负责把效果装载进一局游戏并分发：
//   - triggered 效果：按时点分组挂到 triggerSystem（技能来源 → 装备来源 → 裸效果）
//   - persistent 效果：无钩子，由 persistentEffects.ts 查询
//   - activated / response / conversion：由出牌窗口 / 响应窗口查询
// ============================================================

import type { Player } from '../types.js';
import type { Game } from '../game.js';
import type { GameEvent } from '../events/index.js';
import { askOption, askYesNo } from '../decision/choose.js';
import { effectLordGate, effectOwnedBy } from './effects.js';
import type { ActiveContext, ActivatedEffect, TriggeredEffect } from './effects.js';

export type { ActiveContext } from './effects.js';

// ============================================================
// 事件主体与常用谓词
// ============================================================

/** 事件主体：优先 target，其次 player（FreeKill 的 target 参数） */
export function eventSubject(event: GameEvent<any>): Player | undefined {
  const data = event.data as { target?: Player; player?: Player };
  return data.target ?? data.player;
}

/** 最常见的角色匹配：事件主体是自己时发动 */
export const subjectIsOwner: NonNullable<TriggeredEffect['condition']> =
  (_game, _event, owner, subject) => subject === owner;

// ============================================================
// 装载：把本局所有效果接到引擎上（createGame 已内置调用；幂等）
// ============================================================

const _installedGames = new WeakSet<Game>();

export function installEffects(game: Game): void {
  if (_installedGames.has(game)) return; // 幂等：重复调用无副作用
  _installedGames.add(game);

  const { skills, setupHooks } = game.ruleSet;
  for (const timing of skills.timings()) {
    const effects = skills.triggeredAt(timing); // 静态快照；归属/门槛/条件在运行期重算
    game.triggerSystem.on(timing, async (event: GameEvent<any>) => {
      await dispatchTriggered(event, effects);
    });
  }

  // 内容提供的开局钩子（如无懈可击的响应窗口）：content → 引擎，方向不倒置
  for (const hook of setupHooks) hook(game);
}

// ============================================================
// 触发分发（adr/0005 红线：排序必须显式，不得依赖注册/导入顺序）
// ============================================================

/**
 * 同一时点的触发结算顺序：
 * 1) **座次主排序**：从当前回合角色起，按行动顺序（逆时针）逐个角色处理；
 * 2) 同一角色先执行**强制发动**的候选（`forced` 效果；装备/裸效果本就不询问），
 *    再对可选候选逐个询问——**多个候选时由该角色选择先发动哪个**（无名杀 arrangeTrigger 同款）；
 * 3) 每次询问前**重新评估**归属/门槛/条件（前一个效果可能改变状态）；
 * 4) 候选默认序（AI 与将来前端的默认呈现序）= 技能效果 → 装备效果 → 裸效果，各自按定义序。
 *
 * 选择"放弃"即本次时点该角色的剩余候选不再发动；触发过程不进历史（adr/0005 红线）。
 */
async function dispatchTriggered(
  event: GameEvent<any>,
  effects: readonly TriggeredEffect[],
): Promise<void> {
  const game = event.game;
  const subject = eventSubject(event);
  const players = game.state.players;
  const start = game.state.currentIndex; // 当前回合角色
  for (let offset = 0; offset < players.length; offset++) {
    const player = players[(start + offset) % players.length];
    if (!player.alive) continue;
    await runPlayerTriggered(game, event, player, effects, subject);
  }
}

/** 某角色在当前时点的候选效果（归属 + 主公门槛 + 条件；每次调用重算） */
function triggerCandidates(
  game: Game,
  event: GameEvent<any>,
  player: Player,
  effects: readonly TriggeredEffect[],
  subject: Player | undefined,
): TriggeredEffect[] {
  return effects.filter((e) =>
    effectOwnedBy(game, e, player)
    && effectLordGate(game, player, e)
    && (!e.condition || e.condition(game, event, player, subject)));
}

/** 单个角色的触发结算：强制发动先行，可选候选由该角色决定顺序 */
async function runPlayerTriggered(
  game: Game,
  event: GameEvent<any>,
  player: Player,
  effects: readonly TriggeredEffect[],
  subject: Player | undefined,
): Promise<void> {
  const fired = new Set<TriggeredEffect>();

  for (const effect of triggerCandidates(game, event, player, effects, subject)) {
    if (effect.skill && !effect.forced) continue; // 可选效果：稍后逐个询问
    fired.add(effect);
    await effect.run(game, event, player);
  }

  while (true) {
    const optional = triggerCandidates(game, event, player, effects, subject)
      .filter((e) => !fired.has(e) && e.skill && !e.forced);
    if (optional.length === 0) return;

    let chosen: TriggeredEffect | null;
    if (optional.length === 1) {
      const ok = await askYesNo(game, player, `是否发动【${optional[0].skill}】`, true);
      chosen = ok ? optional[0] : null;
    } else {
      // 同角色同优先级：由玩家选择先发动哪个（放弃 = 本次时点剩余候选不再发动）
      chosen = await askTriggerChoice(game, player, optional);
    }
    if (!chosen) return;

    fired.add(chosen);
    await chosen.run(game, event, player);
  }
}

/**
 * 询问该角色下一个发动的触发效果（多候选时）。
 * AI 决策点（真人/前端接入时在此注入）：默认取候选序第一个，永不放弃。
 */
async function askTriggerChoice(
  game: Game,
  player: Player,
  candidates: readonly TriggeredEffect[],
): Promise<TriggeredEffect | null> {
  const choices = candidates.map((e, i) => ({ value: String(i), label: `【${e.skill}】` }));
  choices.push({ value: 'skip', label: '放弃' });
  const picked = await askOption(game, player, '选择下一个发动的技能', choices);
  if (picked === null || picked === 'skip') return null;
  return candidates[Number(picked)] ?? null;
}

// ============================================================
// 主动效果查询（出牌窗口用）
// ============================================================

/** 收集玩家当前可发动的主动效果（归属 + 主公门槛 + 规则 canUse + AI shouldUse） */
export function collectActiveEffects(
  game: Game,
  player: Player,
  ctx: ActiveContext,
): ActivatedEffect[] {
  if (!player.alive) return [];
  return game.ruleSet.skills.activated().filter((e) =>
    effectOwnedBy(game, e, player)
    && effectLordGate(game, player, e)
    && e.canUse(game, player, ctx)
    && e.ai.shouldUse(game, player, ctx),
  );
}

/** 取优先级最高的一个主动效果（并列时按定义序取首个） */
export function pickActiveEffect(
  game: Game,
  player: Player,
  ctx: ActiveContext,
): ActivatedEffect | null {
  const candidates = collectActiveEffects(game, player, ctx)
    .slice()
    .sort((a, b) => b.ai.priority - a.ai.priority);
  return candidates[0] ?? null;
}
