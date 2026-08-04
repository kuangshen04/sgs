// ============================================================
// 三国杀最小原型 — 技能注册
// 通过 skillRegistry.register() 向引擎注册每种技能。
// 加新技能只需：此处加一个 register 调用。
// 武将-技能绑定在数据层（Hero.skills 引用技能名）。
// ============================================================

import type { Game } from './game.js';
import { drawCards, giveCards, discardCards, judge, takeFromDiscard } from './cardActions.js';
import { damage, recover } from './life.js';
import { cardEmoji, cardRegistry, displayNumber, shuffle } from './cardRegistry.js';
import type { GameEvent } from './events/index.js';
import { triggerSystem, EventType } from './events/index.js';
import type { DamageEventData, JudgeEventData } from './events/index.js';
import { CardTag } from './types.js';
import type { Card, Player } from './types.js';

// ============================================================
// 技能定义 & 注册表
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
const subjectIsOwner: SkillDef['canTrigger'] = (_game, _event, owner, subject) => subject === owner;

/**
 * 把 skillRegistry 中所有技能挂到 triggerSystem（按 trigger 分发）。
 * 每个进程调用一次；重复调用会重复注册 handler。
 */
export function registerSkills(): void {
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
const yijiContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const { amount } = event.data as DamageEventData;
  const before = owner.hand.length;
  await drawCards(game, { target: owner, count: amount * 2 });
  console.log(
    `  ✨${owner.name} 发动【遗计】！受到 ${amount} 点伤害，摸了 ${amount * 2} 张牌` +
    `（${before} → ${owner.hand.length}）`,
  );
};

/** 英姿：摸牌阶段多摸一张牌 */
const yingziContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const before = owner.hand.length;
  await drawCards(game, { target: owner, count: 1 });
  console.log(
    `  ✨${owner.name} 发动【英姿】！摸牌阶段多摸了 1 张牌` +
    `（${before} → ${owner.hand.length}）`,
  );
};

/** 闭月：结束阶段摸一张牌 */
const biyueContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const before = owner.hand.length;
  await drawCards(game, { target: owner, count: 1 });
  console.log(
    `  ✨${owner.name} 发动【闭月】！回合结束摸了 1 张牌` +
    `（${before} → ${owner.hand.length}）`,
  );
};

/** 奸雄：受到伤害后，若伤害由使用牌造成，获得该牌 */
const jianxiongContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const useCardEvent = event.getParent(EventType.UseCard);
  if (!useCardEvent) return; // 非使用牌造成的伤害（如技能伤害）
  const card = useCardEvent.data.card as Card;

  // 使用的牌已进弃牌堆：从弃牌堆找回并收入手牌
  const found = takeFromDiscard(game, owner, card);
  if (!found) return;
  console.log(
    `  ✨${owner.name} 发动【奸雄】！获得造成伤害的 ${cardEmoji(found.type)} ` +
    `(${found.suit}${displayNumber(found.number)})`,
  );
};

/** 刚烈：受到伤害后判定，非红桃则伤害来源弃两张手牌或受 1 点伤害 */
const ganglieContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const { source } = event.data as DamageEventData;
  if (!source) return; // 无来源伤害（如闪电）无法结算刚烈
  const card = await judge(game, owner);
  if (card.suit === '♥') return; // 红桃 → 无事发生

  // 伤害来源：手牌足够则弃两张，否则受到来自你的 1 点伤害
  if (source.hand.length >= 2) {
    const discarded = discardCards(game, source, source.hand.slice(0, 2));
    console.log(`  ${source.name} 弃置 ${discarded.length} 张手牌以响应【刚烈】`);
  } else {
    await damage(game, { target: source, source: owner, amount: 1 });
  }
};

/** 天妒：当你的判定牌生效后，你可以获得之 */
const tianduContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const { card } = event.data as JudgeEventData;
  if (!card) return;

  // 判定牌已进弃牌堆：找回并收入手牌
  const found = takeFromDiscard(game, owner, card);
  if (!found) return;
  console.log(
    `  ✨${owner.name} 发动【天妒】！获得判定牌 ${cardEmoji(found.type)} ` +
    `(${found.suit}${displayNumber(found.number)})`,
  );
};

/** 鬼才：一名角色的判定牌生效前，你可以打出一张手牌代替之 */
const guicaiContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const judgeEvent = event as GameEvent<JudgeEventData>;
  const card = owner.hand[0];
  discardCards(game, owner, [card]);
  judgeEvent.data.card = card;
  console.log(
    `  ✨${owner.name} 发动【鬼才】！打出 ${cardEmoji(card.type)} ` +
    `(${card.suit}${displayNumber(card.number)}) 代替判定牌`,
  );
};

/** 洛神：准备阶段判定，黑色获得判定牌并继续，红色停止 */
const luoshenContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  console.log(`  ✨${owner.name} 发动【洛神】！`);
  while (true) {
    const card = await judge(game, owner);
    if (card.suit !== '♠' && card.suit !== '♣') {
      console.log(`  ${owner.name} 洛神判定为红色，停止`);
      break;
    }
    const found = takeFromDiscard(game, owner, card);
    if (!found) break;
    console.log(
      `  ${owner.name} 洛神获得 ${cardEmoji(found.type)} ` +
      `(${found.suit}${displayNumber(found.number)})`,
    );
  }
};

/** 反馈：受到伤害后，获得伤害来源的一张牌 */
const fankuiContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const { source } = event.data as DamageEventData;
  if (!source || source.hand.length === 0) return; // 无来源伤害或来源无手牌
  const card = source.hand[Math.floor(Math.random() * source.hand.length)];
  giveCards(source, owner, [card]);
  console.log(`  ✨${owner.name} 发动【反馈】！获得 ${source.name} 的一张手牌`);
};

/** 集智：使用普通锦囊牌时，摸一张牌 */
const jizhiContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  await drawCards(game, { target: owner, count: 1 });
  console.log(`  ✨${owner.name} 发动【集智】！使用锦囊摸了 1 张牌`);
};

/** 突袭：摸牌阶段，改为获得至多两名其他角色的各一张手牌（摸牌数改为 0） */
const tuxiContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  owner.skipDraw = true; // 摸牌阶段的摸牌数改为 0
  const candidates = game.state.players.filter(
    (p) => p !== owner && p.alive && p.hand.length > 0,
  );
  const picks = shuffle(candidates).slice(0, Math.min(2, candidates.length));
  for (const target of picks) {
    const card = target.hand[Math.floor(Math.random() * target.hand.length)];
    giveCards(target, owner, [card]);
    console.log(`  ✨${owner.name} 发动【突袭】！获得 ${target.name} 的一张手牌`);
  }
};

// ============================================================
// 注册
// ============================================================

skillRegistry.register({
  name: '遗计',
  trigger: 'damage.after',
  canTrigger: subjectIsOwner,
  content: yijiContent,
});

skillRegistry.register({
  name: '英姿',
  trigger: 'drawPhase.before',
  canTrigger: subjectIsOwner,
  content: yingziContent,
});

skillRegistry.register({
  name: '闭月',
  trigger: 'endPhase.before',
  canTrigger: subjectIsOwner,
  content: biyueContent,
});

skillRegistry.register({
  name: '奸雄',
  trigger: 'damage.after',
  canTrigger: subjectIsOwner,
  content: jianxiongContent,
});

skillRegistry.register({
  name: '刚烈',
  trigger: 'damage.after',
  canTrigger: subjectIsOwner,
  content: ganglieContent,
});

skillRegistry.register({
  name: '天妒',
  trigger: 'judge.after',
  canTrigger: subjectIsOwner,
  content: tianduContent,
});

skillRegistry.register({
  name: '鬼才',
  trigger: 'judge.judging',
  // 响应型：任何角色的判定都可响应，不看事件主体
  canTrigger: (_game, _event, owner) => owner.hand.length > 0,
  content: guicaiContent,
});

skillRegistry.register({
  name: '洛神',
  trigger: 'preparePhase.before',
  canTrigger: subjectIsOwner,
  content: luoshenContent,
});

skillRegistry.register({
  name: '反馈',
  trigger: 'damage.after',
  canTrigger: subjectIsOwner,
  content: fankuiContent,
});

skillRegistry.register({
  name: '集智',
  trigger: 'useCard.after',
  canTrigger: (game, event, owner, subject) => {
    if (subject !== owner) return false;
    const def = cardRegistry.get(event.data.card.type);
    return !!def?.tags.includes(CardTag.Trick) && !def.tags.includes(CardTag.Delay);
  },
  content: jizhiContent,
});

skillRegistry.register({
  name: '突袭',
  trigger: 'drawPhase.before',
  canTrigger: (game, event, owner, subject) =>
    subject === owner &&
    game.state.players.some((p) => p !== owner && p.alive && p.hand.length > 0),
  content: tuxiContent,
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

/** 青囊：出牌阶段限一次，弃置一张手牌并令一名角色回复 1 点体力（AI 只给自己回血） */
const qingnangContent = async (game: Game, player: Player): Promise<void> => {
  if (player.hand.length === 0) return;
  discardCards(game, player, [player.hand[0]]);
  await recover(game, { target: player, amount: 1 });
  console.log(`  ✨${player.name} 发动【青囊】！弃置 1 张手牌，回复 1 点体力`);
};

activeSkillRegistry.register({
  name: '青囊',
  canUse: (game, player, ctx) =>
    !ctx.usedSkills.has('青囊') &&                              // 每回合限一次
    player.hand.length >= 1 &&                                  // 需弃 1 张手牌
    game.state.players.some((p) => p.alive && p.hp < p.maxHp),  // 需有受伤角色
  content: qingnangContent,
  ai: {
    // AI：只给自己回血
    shouldUse: (game, player) => player.hp < player.maxHp,
    priority: 0,
  },
});
