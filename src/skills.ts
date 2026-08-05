// ============================================================
// 三国杀最小原型 — 技能系统基础设施
// 技能定义/注册表/分发；具体技能在各武将文件中注册（heroes/*.ts）。
// ============================================================

import type { Game } from './game.js';
import type { GameEvent } from './events/index.js';
import { triggerSystem } from './events/index.js';
import { cardRegistry } from './cardRegistry.js';
import { CardType } from './types.js';
import type { Card, Player } from './types.js';

// ============================================================
// 触发技能
// ============================================================

export interface SkillDef {
  name: string;
  /** 触发时点，如 'damage.after'（事件类型 + before/after 阶段） */
  trigger: string;
  /**
   * 角色匹配谓词（FreeKill can_trigger 风格）：
   * 引擎按座次询问所有存活角色，对每个拥有此技能的角色调用本函数决定是否发动。
   * subject 为事件主体（event.data.target 优先，其次 player）。
   */
  canTrigger: (game: Game, event: GameEvent<any>, owner: Player, subject: Player | undefined) => boolean;
  /** 发动效果（owner 为被询问且通过 canTrigger 的角色） */
  content: (game: Game, event: GameEvent<any>, owner: Player) => Promise<void>;
}

const _skills = new Map<string, SkillDef>();

export const skillRegistry = {
  register(def: SkillDef): void {
    _skills.set(def.name, def);
  },
  get(name: string): SkillDef | undefined {
    return _skills.get(name);
  },
  /** 遍历所有已注册的 SkillDef */
  all(): IterableIterator<SkillDef> {
    return _skills.values();
  },
};

// ============================================================
// 主动技能（出牌阶段发动）
// ============================================================

/** 主动技能的决策上下文（由出牌阶段循环提供） */
export interface ActiveSkillContext {
  shaUsed: boolean;
  /** 本回合已发动过的限次技能名 */
  usedSkills: ReadonlySet<string>;
  /** 本轮 AI 选出的要出的牌（null = 没有牌要出） */
  cardChoice: Card | null;
}

/** 出牌阶段可发动的技能定义 */
export interface ActiveSkillDef {
  name: string;
  /** 规则层面：当前是否合法可用（次数限制、前提条件等） */
  canUse: (game: Game, player: Player, ctx: ActiveSkillContext) => boolean;
  /** 发动效果 */
  content: (game: Game, player: Player) => Promise<void>;
  /** AI 层面策略（与 CardDef.ai 同级）：规则合法 ≠ 现在应该用 */
  ai: {
    /** AI 当前是否应该发动（策略，如"没牌能出才换牌"） */
    shouldUse: (game: Game, player: Player, ctx: ActiveSkillContext) => boolean;
    /** 多个技能并列时的优先级（越大越优先） */
    priority: number;
  };
}

const _activeSkills = new Map<string, ActiveSkillDef>();

export const activeSkillRegistry = {
  register(def: ActiveSkillDef): void {
    _activeSkills.set(def.name, def);
  },
  get(name: string): ActiveSkillDef | undefined {
    return _activeSkills.get(name);
  },
};

// ============================================================
// 分发
// ============================================================

/** 事件主体：优先 target，其次 player（FreeKill 的 target 参数） */
function eventSubject(event: GameEvent<any>): Player | undefined {
  const data = event.data as { target?: Player; player?: Player };
  return data.target ?? data.player;
}

/** 最常见的角色匹配：事件主体是自己时发动 */
export const subjectIsOwner: SkillDef['canTrigger'] = (_game, _event, owner, subject) => subject === owner;

/** 玩家装备区是否装备了指定类型的牌 */
function hasEquipped(player: Player, cardType: CardType): boolean {
  const eq = player.equipment;
  return eq.weapon?.type === cardType
    || eq.armor?.type === cardType
    || eq.defensiveHorse?.type === cardType
    || eq.offensiveHorse?.type === cardType;
}

/**
 * 把 skillRegistry 中所有技能挂到 triggerSystem（按 trigger 分发）。
 * 每个进程调用一次；重复调用会重复注册 handler。
 */
export function registerSkills(): void {
  // 技能触发器
  for (const skill of skillRegistry.all()) {
    triggerSystem.on(skill.trigger, async (event) => {
      const game = event.game;
      const subject = eventSubject(event);
      // 按座次询问所有存活角色（FreeKill 模型）
      for (const player of game.state.players) {
        if (!player.alive) continue; // 死亡后技能失效
        if (!player.hero.skills?.includes(skill.name)) continue;
        if (!skill.canTrigger(game, event, player, subject)) continue;
        await skill.content(game, event, player);
      }
    });
  }

  // 装备触发器（CardDef.equipTrigger）：装备在对应栏位时对事件响应
  for (const def of cardRegistry.all()) {
    const et = def.equipTrigger;
    if (!et) continue;
    triggerSystem.on(et.trigger, async (event) => {
      const game = event.game;
      for (const player of game.state.players) {
        if (!player.alive) continue;
        if (!hasEquipped(player, def.type)) continue;
        if (et.canTrigger && !et.canTrigger(game, event, player)) continue;
        await et.content(game, event, player);
      }
    });
  }
}

/**
 * 出牌阶段挑选可发动的主动技能：
 * 从 player.hero.skills 解析出已注册的主动技能，过滤 canUse，按 priority 取最高。
 */
export function pickActiveSkill(
  game: Game,
  player: Player,
  ctx: ActiveSkillContext,
): ActiveSkillDef | null {
  if (!player.alive) return null; // 死亡角色不能发动主动技能
  const candidates = (player.hero.skills ?? [])
    .map((name) => activeSkillRegistry.get(name))
    .filter((s): s is ActiveSkillDef => !!s)
    .filter((s) => s.canUse(game, player, ctx))        // 规则：能不能用
    .filter((s) => s.ai.shouldUse(game, player, ctx))  // AI：该不该用
    .sort((a, b) => b.ai.priority - a.ai.priority);
  return candidates[0] ?? null;
}
