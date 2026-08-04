// ============================================================
// 三国杀最小原型 — 技能注册
// 通过 skillRegistry.register() 向引擎注册每种技能。
// 加新技能只需：此处加一个 register 调用。
// 武将-技能绑定在数据层（Hero.skills 引用技能名）。
// ============================================================

import type { Game } from './game.js';
import { drawCards, giveCards, discardCards, judge } from './cardActions.js';
import { damage, recover } from './life.js';
import { cardEmoji, displayNumber } from './cardRegistry.js';
import type { GameEvent } from './events/index.js';
import { triggerSystem, EventType } from './events/index.js';
import type { DamageEventData, JudgeEventData, PhaseEventData, TurnEventData } from './events/index.js';
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
      if (!owner?.alive || !owner.hero.skills?.includes(skill.name)) return; // 死亡后技能失效
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
  if (!player.alive) return null; // 死亡角色不能发动主动技能
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

/** 奸雄：受到伤害后，若伤害由使用牌造成，获得该牌 */
const jianxiongContent = async (game: Game, event: GameEvent<any>): Promise<void> => {
  const { target } = event.data as DamageEventData;
  const useCardEvent = event.getParent(EventType.UseCard);
  if (!useCardEvent) return; // 非使用牌造成的伤害（如技能伤害）
  const card = useCardEvent.data.card as Card;

  // 使用的牌已进弃牌堆：从弃牌堆找回并收入手牌
  const idx = game.state.discardPile.findIndex((c) => c.id === card.id);
  if (idx < 0) return;
  const [found] = game.state.discardPile.splice(idx, 1);
  target.hand.push(found);
  console.log(
    `  ✨${target.name} 发动【奸雄】！获得造成伤害的 ${cardEmoji(found.type)} ` +
    `(${found.suit}${displayNumber(found.number)})`,
  );
};

/** 刚烈：受到伤害后判定，非红桃则伤害来源弃两张手牌或受 1 点伤害 */
const ganglieContent = async (game: Game, event: GameEvent<any>): Promise<void> => {
  const { target, source } = event.data as DamageEventData;
  const card = await judge(game, target);
  if (card.suit === '♥') return; // 红桃 → 无事发生

  // 伤害来源：手牌足够则弃两张，否则受到来自你的 1 点伤害
  if (source.hand.length >= 2) {
    const discarded = discardCards(game, source, source.hand.slice(0, 2));
    console.log(`  ${source.name} 弃置 ${discarded.length} 张手牌以响应【刚烈】`);
  } else {
    await damage(game, { target: source, source: target, amount: 1 });
  }
};

/** 天妒：当你的判定牌生效后，你可以获得之 */
const tianduContent = async (game: Game, event: GameEvent<any>): Promise<void> => {
  const { player, card } = event.data as JudgeEventData;
  if (!card) return;

  // 判定牌已进弃牌堆：找回并收入手牌
  const idx = game.state.discardPile.findIndex((c) => c.id === card.id);
  if (idx < 0) return;
  const [found] = game.state.discardPile.splice(idx, 1);
  player.hand.push(found);
  console.log(
    `  ✨${player.name} 发动【天妒】！获得判定牌 ${cardEmoji(found.type)} ` +
    `(${found.suit}${displayNumber(found.number)})`,
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

skillRegistry.register({
  name: '奸雄',
  trigger: 'damage.after',
  content: jianxiongContent,
});

skillRegistry.register({
  name: '刚烈',
  trigger: 'damage.after',
  content: ganglieContent,
});

skillRegistry.register({
  name: '天妒',
  trigger: 'judge.after',
  content: tianduContent,
});

// ============================================================
// 主动技能注册
// ============================================================

/** 制衡：每回合限一次，弃置所有手牌并摸等量（简化：不任选） */
const zhihengContent = async (game: Game, player: Player): Promise<void> => {
  const count = player.hand.length;
  if (count === 0) return;
  discardCards(game, player, [...player.hand]);
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
