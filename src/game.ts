// ============================================================
// 三国杀最小原型 — 游戏容器与初始化
//
// 初始化 = 显式命名步骤（建容器 → 建玩家含技能实例 → 备牌堆 → 起始发牌 →
// 初始状态 → 装载效果）。当前刻意保持"单函数 + 显式步骤"：
//   - 阶段 4（身份场/模式/内容包）在此接入身份分配与模式配置；
//   - 阶段 5（DI/rng service）在此接入种子化洗牌（现为 Math.random）。
// 起始发牌不走事件系统：它不是"摸牌阶段摸牌"，不应进历史/触发技能。
// ============================================================

import { Card, GameState, Player, VictoryCondition } from './types.js';
import { CardArea, createCardIndex } from './cardArea.js';
import type { CardIndex } from './cardArea.js';
import { TriggerSystem, createEventStack } from './events/index.js';
import type { EventStack, GameEvent } from './events/index.js';
import { shuffle } from './cardRegistry.js';
import { gainSkill } from './effects.js';
import { installEffects } from './skills.js';
import { heroRegistry } from './heroRegistry.js';
import './cards/index.js';  // 副作用：触发全部卡牌/装备效果注册
import './heroes/index.js'; // 副作用：触发全部武将/技能注册

// ============================================================
// Game — 一局游戏的容器
// 所有引擎函数以 game 为第一参数，替代模块级 gs() 全局状态。
// ============================================================

export interface Game {
  state: GameState;
  /** 本局的事件执行栈（随局隔离） */
  eventStack: EventStack;
  /** 本局的触发器注册表（随局隔离） */
  triggerSystem: TriggerSystem;
  /**
   * 全量事件历史（演进 2.2 DFS 时间戳法）。
   * append-only；append 顺序 == id 顺序（事件 id == 本数组下标）。
   * 事件在 execute 入史，finally 定稿 endId（子树跨度终点）。回放不做历史序列化（演进 7.2）。
   */
  history: GameEvent<any>[];
  /**
   * 引擎级集中索引（演进 3.2 / FreeKill card_place 等价物）：cardId → 当前位置。
   * 派生态：只由 CardArea 容器方法 / 装备槽位写点维护，不参与序列化（数组权威，加载重建）。
   */
  cardIndex: CardIndex;
}

// ============================================================
// 胜利条件
// ============================================================

/** 吃鸡模式：最后一人存活即获胜 */
export function lastManStanding(state: GameState): Player | null {
  const alive = state.players.filter((p) => p.alive);
  return alive.length === 1 ? alive[0] : null;
}

// ============================================================
// 游戏初始化
// ============================================================

/** createGame 的可选注入项 */
export interface CreateGameOptions {
  victoryCheck?: VictoryCondition;
  /** 起始手牌数（默认 4） */
  initialHandSize?: number;
}

export function createGame(
  deck: Card[],
  heroNames: string[],
  options?: CreateGameOptions,
): Game {
  // ── 步骤 1：建容器与集中索引（内容无关的基础设施）────────────────
  const cardIndex = createCardIndex();

  // ── 步骤 2：建玩家（hero 副本 + 空区域 + 局内技能实例表）──────────
  const players: Player[] = heroNames.map((name) => {
    const hero = heroRegistry.get(name);
    if (!hero) throw new Error(`Hero "${name}" not registered`);
    return {
      name: hero.name, hero: { ...hero }, // 副本：同名英雄各自独立
      hp: hero.maxHp, maxHp: hero.maxHp,
      equipment: {}, alive: true, skills: new Map(),
      // 容器待玩家就绪后构造（位置描述含 owner）
      hand: undefined as never,
      judgment: undefined as never,
    } as unknown as Player;
  });
  for (const p of players) {
    p.hand = new CardArea(cardIndex, { player: p, zone: 'hand' });
    p.judgment = new CardArea(cardIndex, { player: p, zone: 'judgment' });
    // 技能实例：按 hero.skills（内容层"初始技能清单"）建立局内实例
    for (const skillName of p.hero.skills ?? []) gainSkill(p, skillName);
  }

  // ── 步骤 3：备牌堆（洗牌；阶段 5 换 rng service 的种子化实现）──────
  const deckArea = new CardArea(cardIndex, { zone: 'deck' });
  const discardPile = new CardArea(cardIndex, { zone: 'discardPile' });
  const processing = new CardArea(cardIndex, { zone: 'processing' });
  deckArea.addAll(shuffle(deck)); // 副本：不污染调用方传入的牌堆数组

  // ── 步骤 4：起始发牌（事件外直放：不是"摸牌阶段摸牌"）──────────────
  const handSize = options?.initialHandSize ?? 4;
  for (const p of players) {
    const dealt: Card[] = [];
    for (let i = 0; i < handSize; i++) {
      const c = deckArea.removeLast(); // 牌堆顶
      if (!c) break;
      dealt.push(c);
    }
    p.hand.addAll(dealt);
  }

  // ── 步骤 5：初始状态（座次/轮次；阶段 4 在此接入身份与模式）────────
  const game: Game = {
    state: {
      players,
      currentIndex: 0,
      deck: deckArea, discardPile, processing,
      round: 1, gameOver: false, winner: null,
      victoryCheck: options?.victoryCheck ?? lastManStanding,
    },
    eventStack: createEventStack(),
    triggerSystem: new TriggerSystem(),
    history: [],
    cardIndex,
  };

  // ── 步骤 6：装载效果（本局分发器；幂等，重复调用无副作用）──────────
  installEffects(game);

  return game;
}
