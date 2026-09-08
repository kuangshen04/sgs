// ============================================================
// 三国杀最小原型 — 游戏容器与初始化
// ============================================================

import { Card, GameState, Player, VictoryCondition } from './types.js';
import { CardArea, createCardIndex } from './cardArea.js';
import type { CardIndex } from './cardArea.js';
import { TriggerSystem, createEventStack } from './events/index.js';
import type { EventStack, GameEvent } from './events/index.js';
import { shuffle } from './cardRegistry.js';
import { heroRegistry } from './heroRegistry.js';
import './heroes/index.js'; // 副作用：触发全部武将注册

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
}

export function createGame(
  deck: Card[],
  heroNames: string[],
  options?: CreateGameOptions,
): Game {
  // 集中索引先行：建局与后续所有容器都挂到它上面
  const cardIndex = createCardIndex();

  // 玩家先建裸对象（容器需要在 player 就绪后构造，位置描述含 owner）
  const players: Player[] = heroNames.map((name) => {
    const hero = heroRegistry.get(name);
    if (!hero) throw new Error(`Hero "${name}" not registered`);
    return {
      name: hero.name, hero: { ...hero }, // 副本：同名英雄各自独立
      hp: hero.maxHp, maxHp: hero.maxHp,
      equipment: {}, alive: true,
      // 先占位，下面统一给受控容器
      hand: undefined as never,
      judgment: undefined as never,
    } as unknown as Player;
  });
  for (const p of players) {
    p.hand = new CardArea(cardIndex, { player: p, zone: 'hand' });
    p.judgment = new CardArea(cardIndex, { player: p, zone: 'judgment' });
  }

  const deckArea = new CardArea(cardIndex, { zone: 'deck' });
  const discardPile = new CardArea(cardIndex, { zone: 'discardPile' });
  const processing = new CardArea(cardIndex, { zone: 'processing' });
  // 洗牌副本（不污染调用方传入的牌堆数组）；容器 addAll 顺带写入索引
  deckArea.addAll(shuffle(deck));

  // 起始手牌：建局初始化，不走事件系统（游戏容器尚未构造，无法发 CardMove）
  for (const p of players) {
    const dealt: Card[] = [];
    for (let i = 0; i < 4; i++) {
      const c = deckArea.removeLast(); // 牌堆顶 4 张
      if (!c) break;
      dealt.push(c);
    }
    p.hand.addAll(dealt);
  }

  return {
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
}
