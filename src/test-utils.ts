// ============================================================
// 测试辅助 — 各测试文件共享
// ============================================================

import './cards.js'; // 触发卡牌注册（side-effect import）
import { STANDARD_DECK } from './cards.js';
import { cardRegistry } from './cardRegistry.js';
import { createGame } from './game.js';
import type { Game } from './game.js';
import { CardType } from './types.js';
import type { Card, GameState, Player } from './types.js';

export function makeCard(
  id: number, type: CardType, suit = '♠', number = 1,
): Card {
  const def = cardRegistry.get(type);
  return { id, type, name: def?.name ?? type, suit, number };
}

let nextId = 1000;

/** 生成一张 id 递增的新牌（发牌或制造"不在手牌"的牌用） */
export function makeUniqueCard(type: CardType, suit = '♠', number = 1): Card {
  return makeCard(nextId++, type, suit, number);
}

/** 默认测试阵容（刘备/曹操/孙权，均为已注册武将） */
export const DEFAULT_HEROES: string[] = ['刘备', '曹操', '孙权'];

export function freshGame(state?: Partial<GameState>, heroNames: string[] = DEFAULT_HEROES): Game {
  const g = createGame(STANDARD_DECK, heroNames);
  // 清空手牌以便精确控制测试
  for (const p of g.state.players) p.hand = [];
  if (state) g.state = { ...g.state, ...state };
  return g;
}

export function giveHand(player: Player, ...types: CardType[]): void {
  player.hand = types.map((t) => makeUniqueCard(t));
}
