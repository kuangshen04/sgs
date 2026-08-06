// ============================================================
// 三国杀最小原型 — 游戏容器与初始化
// ============================================================

import { Card, GameState, Player, VictoryCondition } from './types.js';
import { TriggerSystem, createEventStack } from './events/index.js';
import type { EventStack } from './events/index.js';
import type { Deciders } from './choose.js';
import { shuffle } from './cardRegistry.js';
import { drawCardsFromDeck } from './cardActions.js';
import { heroRegistry } from './heroRegistry.js';
import './heroes/index.js'; // 副作用：触发全部武将注册

// ============================================================
// Game — 一局游戏的容器
// 所有引擎函数以 game 为第一参数，替代模块级 gs() 全局状态。
// ============================================================

export interface Game {
  state: GameState;
  /** 全局注入的出牌策略（choose() 优先级：调用参数 > 此处 > 默认 AI） */
  deciders: Deciders;
  /** 本局的事件执行栈（随局隔离） */
  eventStack: EventStack;
  /** 本局的触发器注册表（随局隔离） */
  triggerSystem: TriggerSystem;
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
  deciders?: Deciders;
}

export function createGame(
  deck: Card[],
  heroNames: string[],
  options?: CreateGameOptions,
): Game {
  const players: Player[] = heroNames.map((name) => {
    const hero = heroRegistry.get(name);
    if (!hero) throw new Error(`Hero "${name}" not registered`);
    return {
      name: hero.name, hero: { ...hero }, // 副本：同名英雄各自独立
      hp: hero.maxHp, maxHp: hero.maxHp,
      hand: [], judgment: [], equipment: {}, alive: true,
    };
  });

  const shuffledDeck = shuffle(deck); // 副本：不污染调用方传入的牌堆数组
  const discardPile: Card[] = [];

  // 起始手牌（不走事件）
  for (const p of players) {
    drawCardsFromDeck(p, shuffledDeck, discardPile, 4);
  }

  return {
    state: {
      players,
      currentIndex: 0,
      deck: shuffledDeck, discardPile,
      round: 1, gameOver: false, winner: null,
      victoryCheck: options?.victoryCheck ?? lastManStanding,
    },
    deciders: options?.deciders ?? {},
    eventStack: createEventStack(),
    triggerSystem: new TriggerSystem(),
  };
}
