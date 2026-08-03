// ============================================================
// 三国杀最小原型 — 技能注册
// 通过 skillRegistry.register() 向引擎注册每种技能。
// 加新技能只需：此处加一个 register 调用。
// 武将-技能绑定在数据层（Hero.skills 引用技能名）。
// ============================================================

import type { Game } from './game.js';
import { drawCards, giveCards, damage, recover } from './game.js';
import type { GameEvent } from './events/index.js';
import { triggerSystem } from './events/index.js';
import type { DamageEventData, PhaseEventData, TurnEventData } from './events/index.js';
import type { Card, Player } from './types.js';

// ============================================================
// 技能定义 & 注册表
// ============================================================

export interface SkillDef {
  name: string;
  /** 触发时点，如 'damage.after'（事件类型 + before/after 阶段） */
  trigger: string;
  content: (game: Game, event: GameEvent<any>) => Promise<void>;
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

/** 从事件数据推断技能拥有者：优先 target，其次 player */
function eventOwner(event: GameEvent<any>): Player | undefined {
  const data = event.data as { target?: Player; player?: Player };
  return data.target ?? data.player;
}

/**
 * 把 skillRegistry 中所有技能挂到 triggerSystem（按 trigger 分发）。
 * 每个进程调用一次；重复调用会重复注册 handler。
 */
export function registerSkills(): void {
  for (const skill of skillRegistry.all()) {
    triggerSystem.on(skill.trigger, async (event) => {
      const owner = eventOwner(event);
      if (!owner?.hero.skills?.includes(skill.name)) return;
      await skill.content(event.game, event);
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
  const candidates = (player.hero.skills ?? [])
    .map((name) => activeSkillRegistry.get(name))
    .filter((s): s is ActiveSkillDef => !!s)
    .filter((s) => s.canUse(game, player, ctx))        // 规则：能不能用
    .filter((s) => s.ai.shouldUse(game, player, ctx))  // AI：该不该用
    .sort((a, b) => b.ai.priority - a.ai.priority);
  return candidates[0] ?? null;
}

// ============================================================
// 技能效果
// ============================================================

/** 遗计：受到伤害后，每 1 点伤害摸 2 张牌 */
const yijiContent = async (game: Game, event: GameEvent<any>): Promise<void> => {
  const { target, amount } = event.data as DamageEventData;
  const before = target.hand.length;
  await drawCards(game, { target, count: amount * 2 });
  console.log(
    `  ✨${target.name} 发动【遗计】！受到 ${amount} 点伤害，摸了 ${amount * 2} 张牌` +
    `（${before} → ${target.hand.length}）`,
  );
};

/** 英姿：摸牌阶段多摸一张牌 */
const yingziContent = async (game: Game, event: GameEvent<any>): Promise<void> => {
  const { player } = event.data as PhaseEventData;
  const before = player.hand.length;
  await drawCards(game, { target: player, count: 1 });
  console.log(
    `  ✨${player.name} 发动【英姿】！摸牌阶段多摸了 1 张牌` +
    `（${before} → ${player.hand.length}）`,
  );
};

/** 闭月：结束阶段摸一张牌（暂挂在 turn.after，正式结束阶段尚未建模） */
const biyueContent = async (game: Game, event: GameEvent<any>): Promise<void> => {
  const { player } = event.data as TurnEventData;
  const before = player.hand.length;
  await drawCards(game, { target: player, count: 1 });
  console.log(
    `  ✨${player.name} 发动【闭月】！回合结束摸了 1 张牌` +
    `（${before} → ${player.hand.length}）`,
  );
};

// ============================================================
// 注册
// ============================================================

skillRegistry.register({
  name: '遗计',
  trigger: 'damage.after',
  content: yijiContent,
});

skillRegistry.register({
  name: '英姿',
  trigger: 'drawPhase.before',
  content: yingziContent,
});

skillRegistry.register({
  name: '闭月',
  trigger: 'turn.after',
  content: biyueContent,
});

// ============================================================
// 主动技能注册
// ============================================================

/** 制衡：每回合限一次，弃置所有手牌并摸等量（简化：不任选） */
const zhihengContent = async (game: Game, player: Player): Promise<void> => {
  const count = player.hand.length;
  if (count === 0) return;
  game.state.discardPile.push(...player.hand);
  player.hand = [];
  await drawCards(game, { target: player, count });
  console.log(
    `  ✨${player.name} 发动【制衡】！弃置 ${count} 张牌，摸了 ${count} 张牌`,
  );
};

/** 仁德：出牌阶段限一次，交给其他角色两张牌，然后回复 1 点体力 */
const rendeContent = async (game: Game, player: Player): Promise<void> => {
  if (player.hand.length < 2) return;
  const target = game.state.players.find((p) => p !== player && p.alive);
  if (!target) return;
  const given = giveCards(player, target, player.hand.slice(0, 2));
  await recover(game, { target: player, amount: 1 });
  console.log(
    `  ✨${player.name} 发动【仁德】！交给 ${target.name} ${given.length} 张牌，回复 1 点体力`,
  );
};

/** 反间：出牌阶段限一次，交给其他角色一张牌，然后对其造成 1 点伤害 */
const fanjianContent = async (game: Game, player: Player): Promise<void> => {
  if (player.hand.length === 0) return;
  const target = game.state.players.find((p) => p !== player && p.alive);
  if (!target) return;
  giveCards(player, target, [player.hand[0]]);
  await damage(game, { target, source: player, amount: 1 });
  console.log(
    `  ✨${player.name} 发动【反间】！交给 ${target.name} 1 张牌并造成 1 点伤害`,
  );
};

activeSkillRegistry.register({
  name: '制衡',
  canUse: (game, player, ctx) =>
    !ctx.usedSkills.has('制衡') && // 规则：每回合限一次
    player.hand.length > 0,        // 规则：简化模型需有牌可弃
  content: zhihengContent,
  ai: {
    // AI：本轮选不出想出的牌时才换牌
    shouldUse: (_game, _player, ctx) => ctx.cardChoice === null,
    priority: 0,
  },
});

activeSkillRegistry.register({
  name: '仁德',
  canUse: (game, player, ctx) =>
    !ctx.usedSkills.has('仁德') &&                 // 规则：每回合限一次
    player.hand.length >= 2 &&                     // 规则：需交出 2 张牌
    game.state.players.some((p) => p !== player && p.alive), // 规则：需有其他角色
  content: rendeContent,
  ai: {
    // AI：受伤才值得交牌换血
    shouldUse: (game, player) => player.hp < player.maxHp,
    priority: 0,
  },
});

activeSkillRegistry.register({
  name: '反间',
  canUse: (game, player, ctx) =>
    !ctx.usedSkills.has('反间') &&                 // 规则：每回合限一次
    player.hand.length >= 1 &&                     // 规则：需交出 1 张牌
    game.state.players.some((p) => p !== player && p.alive), // 规则：需有其他角色
  content: fanjianContent,
  ai: {
    // AI：进攻技能，合法就用
    shouldUse: () => true,
    priority: 0,
  },
});
