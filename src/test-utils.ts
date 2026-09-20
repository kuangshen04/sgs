// ============================================================
// 测试辅助 — 各测试文件共享
//
// 装配语义（ADR-0003 / rules/ruleSet.ts）：**没有隐式默认装配**。
//   · freshGame()：造一个装好标包的容器 + 标包牌堆（现有存量测试用）
//   · testGame()：造一个**只装了本条测试给定内容**的容器（下层测试用——
//     不依赖标包，也不依赖上层模块；见 docs/代码结构.md 测试约定）
//   · standardRuleSet()：标包的共享只读规则集（断言"标包里有没有 X"时用）
//
// 阶段 2：所有区域为受控容器 CardArea，测试的"区域重置/发牌"也走容器方法
// （不保留测试专用直写 API——容器方法即唯一写通道，索引由容器同步）。
// ============================================================

import { createContainer } from './rules/ruleSet.js';
import type { Container, RuleSet } from './rules/ruleSet.js';
import type { CardDef } from './rules/cardDef.js';
import { createStandardContainer } from './content/standardPack.js';
import { buildStandardDeck } from './content/deck.js';
import { createGame } from './game.js';
import type { Game } from './game.js';
import { CardTag, CardType } from './types.js';
import type { Card, GameState, HeroDef, Player } from './types.js';
import type { CardArea } from './position/cardArea.js';
import { equipSlotOf } from './position/usedCardActions.js';
import type { UsedCardInstance } from './position/usedCards.js';
import type { Effect, Skill } from './effects/effects.js';

// ============================================================
// 规则集 fixture
// ============================================================

let sharedRuleSet: RuleSet | undefined;

/**
 * 标包的**共享只读**规则集（惰性构造一次）。
 * 用途：断言"标包里注册了哪些技能/卡牌/武将"；需要干净容器时用 createStandardContainer()。
 * 注意：不要在它上面注册测试内容（会污染同一进程里的其它测试）。
 */
export function standardRuleSet(): RuleSet {
  sharedRuleSet ??= createStandardContainer();
  return sharedRuleSet;
}

/** 本测试文件自己的内容（只装这些，不会有任何标包内容混进来） */
export interface TestContent {
  cards?: CardDef[];
  skills?: Skill[];
  bareEffects?: Effect[];
  heroes?: HeroDef[];
  /** 牌堆（默认空；要发牌就显式给） */
  deck?: Card[];
  /** 参战武将名（默认 = content.heroes；都没有时用三个白板武将） */
  heroNames?: string[];
  state?: FreshStateOverrides;
}

/** 造一个只装了给定内容的容器 */
export function testContainer(content: TestContent = {}): Container {
  const c = createContainer();
  for (const def of content.cards ?? []) c.cards.register(def);
  for (const skill of content.skills ?? []) c.skills.register(skill);
  for (const effect of content.bareEffects ?? []) c.skills.registerBareEffect(effect);
  for (const hero of content.heroes ?? []) c.heroes.register(hero);
  return c;
}

/** 白板武将（无技能） */
export function blankHero(name: string, maxHp = 4): HeroDef {
  return { name, maxHp, sex: 'male', group: '群', skills: [] };
}

/**
 * 自造延时牌（引擎机制测试用：判定阶段的场景**不必**依赖标包的乐不思蜀/闪电）。
 * `onJudge` = 该牌的判定阶段结算效果（delayContent）。
 *
 * 注：`CardType` 目前是闭合枚举，测试定义借其中一个延时槽位承载自己（名字与语义都自定）；
 * 内容包要真正**新增**卡牌身份得先扩展 CardType，见 `docs/TODO.md` 阶段 4。
 */
export function testDelayCard(opts: {
  name?: string;
  cardType?: CardType;
  onJudge?: (game: Game, target: Player, judgeCard: Card | null, uc: UsedCardInstance) => Promise<void>;
} = {}): CardDef {
  return {
    type: opts.cardType ?? CardType.LeBu,
    name: opts.name ?? '测试·延时',
    emoji: '🧪',
    content: async () => {},
    tags: [CardTag.Trick, CardTag.Delay],
    canUse: () => true,
    targetFilter: (_game, user, all) => all.filter((p) => p !== user),
    targetCount: 1,
    ai: { shouldUse: () => true, usePriority: 1, discardPriority: 50 },
    delayContent: opts.onJudge ?? (async () => {}),
  };
}

/**
 * 标包 + **附加测试内容**的一局（"要标包当背景，但还要合成内容"的测试用）。
 * 附加内容注册在本局自己的容器上：同名卡牌会覆盖标包定义（如替换某张延时牌）。
 */
export function standardGame(opts: {
  heroNames?: string[];
  cards?: CardDef[];
  skills?: Skill[];
  bareEffects?: Effect[];
  heroes?: HeroDef[];
  /** 牌堆（默认标包牌堆） */
  deck?: Card[];
  state?: FreshStateOverrides;
} = {}): Game {
  const container = createStandardContainer();
  for (const def of opts.cards ?? []) container.cards.register(def);
  for (const skill of opts.skills ?? []) container.skills.register(skill);
  for (const effect of opts.bareEffects ?? []) container.skills.registerBareEffect(effect);
  for (const hero of opts.heroes ?? []) container.heroes.register(hero);
  const deck = opts.deck ?? buildStandardDeck(container);
  const game = createGame(deck, opts.heroNames ?? DEFAULT_HEROES, { ruleSet: container });
  for (const p of game.state.players) p.hand.clear();
  applyStateOverrides(game, opts.state);
  return game;
}

/** 默认白板阵容（testGame 未给武将时用） */
const BLANK_HEROES: HeroDef[] = [blankHero('测试甲'), blankHero('测试乙'), blankHero('测试丙')];

/**
 * 造一局只装了给定内容的游戏（下层测试用）：
 * 自造卡牌/技能现场注册 → 直接跑被测机制，不需要标包也不需要上层模块。
 */
export function testGame(content: TestContent = {}): Game {
  const given = content.heroes ?? [];
  const names = content.heroNames;
  // 武将：给了定义用定义；只给名字 → 自动配白板武将；都没给 → 默认三个白板
  const heroes = given.length > 0
    ? given
    : (names && names.length > 0 ? names.map((n) => blankHero(n)) : BLANK_HEROES);
  const container = testContainer({ ...content, heroes });
  const heroNames = names ?? heroes.map((h) => h.name);
  const game = createGame(content.deck ?? [], heroNames, { ruleSet: container });
  for (const p of game.state.players) p.hand.clear();
  applyStateOverrides(game, content.state);
  return game;
}

// ============================================================
// 牌
// ============================================================

export function makeCard(
  id: number, type: CardType, suit = '♠', number = 1,
): Card {
  const def = standardRuleSet().cards.get(type);
  return { id, type, name: def?.name ?? type, suit, number };
}

let nextId = 1000;

/** 生成一张 id 递增的新牌（发牌或制造"不在手牌"的牌用） */
export function makeUniqueCard(type: CardType, suit = '♠', number = 1): Card {
  return makeCard(nextId++, type, suit, number);
}

/** 默认测试阵容（刘备/曹操/孙权，均为标包武将） */
export const DEFAULT_HEROES: string[] = ['刘备', '曹操', '孙权'];

// ============================================================
// 一局游戏（标包版：存量测试用）
// ============================================================

/**
 * freshGame 的状态覆盖：牌堆/弃牌/处理区等区域用普通数组表达，
 * 内部经容器 replaceAll 写入（重建索引）；其余 GameState 字段直接覆盖。
 */
export type FreshStateOverrides = Partial<
  Omit<GameState, 'deck' | 'discardPile' | 'processing'>
> & {
  deck?: Card[];
  discardPile?: Card[];
  processing?: Card[];
  players?: Player[]; // 覆盖 players 时需自行保证各区域容器与索引一致
};

export function freshGame(state?: FreshStateOverrides, heroNames: string[] = DEFAULT_HEROES): Game {
  const container = createStandardContainer();
  const g = createGame(buildStandardDeck(container), heroNames, { ruleSet: container });
  // 清空手牌以便精确控制测试（容器方法，同步索引）
  for (const p of g.state.players) p.hand.clear();
  applyStateOverrides(g, state);
  return g;
}

/** 应用状态覆盖（区域走容器方法，其余字段直接覆盖） */
function applyStateOverrides(g: Game, state?: FreshStateOverrides): void {
  if (!state) return;
  const { deck, discardPile, processing, ...rest } = state;
  if (deck) g.state.deck.replaceAll(deck);
  if (discardPile) g.state.discardPile.replaceAll(discardPile);
  if (processing) g.state.processing.replaceAll(processing);
  Object.assign(g.state, rest);
}

// ============================================================
// 置场
// ============================================================

/** 给玩家一组新牌（替换整个手牌；容器 replaceAll = 清空 + 入区/入索引） */
export function giveHand(player: Player, ...types: CardType[]): void {
  player.hand.replaceAll(types.map((t) => makeUniqueCard(t)));
}

/** 直接在某区域放置一组牌（测试置场用；跳过移动事件；非身份区） */
export function placeIn(area: CardArea, ...cards: Card[]): void {
  area.addAll(cards);
}

/** 直接把牌放进玩家判定区（测试置场用；同步索引与 UC 登记，不走移动事件） */
export function placeJudgment(game: Game, player: Player, ...cards: Card[]): void {
  player.judgment.addAll(cards);
  for (const card of cards) {
    game.usedCards.bind(game.usedCards.create(card, [card]), { kind: 'judgment', player });
  }
}

/** 清空玩家判定区（测试置场用；同步索引与 UC 登记） */
export function clearJudgment(game: Game, player: Player): void {
  for (const card of [...player.judgment.cards]) {
    const uc = game.usedCards.ofCard(card);
    if (uc) game.usedCards.unbind(uc);
  }
  player.judgment.clear();
}

/** 直接把牌放进玩家装备槽位（测试置场用；同步索引与 UC 登记，槽位按牌类型决定） */
export function equipAt(game: Game, player: Player, card: Card): void {
  const uc = game.usedCards.create(card, [card]);
  const slot = equipSlotOf(game, uc);
  const old = player.equipment[slot];
  if (old) {
    // 顶掉旧装备（测试置场不触发移动事件）：同步索引与 UC 登记
    game.cardIndex.delete(old.id);
    const oldUc = game.usedCards.ofCard(old);
    if (oldUc) game.usedCards.unbind(oldUc);
  }
  player.equipment[slot] = card;
  game.cardIndex.set(card.id, { player, zone: 'equipment' });
  game.usedCards.bind(uc, { kind: 'equipment', player, slot });
}
