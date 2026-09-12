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
import { installWuxieTrigger } from '../content/cards/trick.js';
import { askYesNo } from '../decision/choose.js';
import {
  activatedEffects,
  effectLordGate,
  effectOwnedBy,
  triggeredEffectsAt,
  triggeredTimings,
} from './effects.js';
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

  for (const timing of triggeredTimings()) {
    const effects = triggeredEffectsAt(timing);
    game.triggerSystem.on(timing, async (event: GameEvent<any>) => {
      const g = event.game;
      const subject = eventSubject(event);
      for (const effect of effects) {
        // 按座次询问所有存活角色（FreeKill 模型）
        for (const player of g.state.players) {
          if (!player.alive) continue; // 死亡后技能失效
          if (!effectOwnedBy(effect, player)) continue;
          if (!effectLordGate(g, player, effect)) continue;
          if (effect.condition && !effect.condition(g, event, player, subject)) continue;
          // 技能来源的"你可以"询问；强制发动（forced）与装备/裸效果不询问
          const needsAsk = !!effect.skill && !effect.forced;
          if (needsAsk && !(await askYesNo(g, player, `是否发动【${effect.skill}】`, true))) continue;
          await effect.run(g, event, player);
        }
      }
    });
  }

  // 无懈可击响应（卡牌响应机制）
  installWuxieTrigger(game);
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
  return activatedEffects().filter((e) =>
    effectOwnedBy(e, player)
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
