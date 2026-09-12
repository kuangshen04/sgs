// ============================================================
// 测试辅助 — 各测试文件共享
// 阶段 2：所有区域为受控容器 CardArea，测试的"区域重置/发牌"也走容器方法
// （不保留测试专用直写 API——容器方法即唯一写通道，索引由容器同步）。
// ============================================================

import './content/cards/index.js'; // 触发卡牌注册（side-effect import）
import { STANDARD_DECK } from './content/cards/index.js';
import { cardRegistry } from './content/cardRegistry.js';
import { createGame } from './game.js';
import type { Game } from './game.js';
import { CardType, CardTag } from './types.js';
import type { Card, GameState, Player } from './types.js';
import type { CardArea } from './position/cardArea.js';

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
  const g = createGame(STANDARD_DECK, heroNames);
  // 清空手牌以便精确控制测试（容器方法，同步索引）
  for (const p of g.state.players) p.hand.clear();
  if (state) {
    const { deck, discardPile, processing, ...rest } = state;
    if (deck) g.state.deck.replaceAll(deck);
    if (discardPile) g.state.discardPile.replaceAll(discardPile);
    if (processing) g.state.processing.replaceAll(processing);
    Object.assign(g.state, rest);
  }
  return g;
}

/** 给玩家一组新牌（替换整个手牌；容器 replaceAll = 清空 + 入区/入索引） */
export function giveHand(player: Player, ...types: CardType[]): void {
  player.hand.replaceAll(types.map((t) => makeUniqueCard(t)));
}

/** 直接在某区域放置一组牌（测试置场用；跳过移动事件） */
export function placeIn(area: CardArea, ...cards: Card[]): void {
  area.addAll(cards);
}

/** 直接把牌放进玩家装备槽位（测试置场用；同步引擎索引，槽位按牌类型决定） */
export function equipAt(game: Game, player: Player, card: Card): void {
  const def = cardRegistry.get(card.type);
  let slot: keyof typeof player.equipment;
  if (def?.tags.includes(CardTag.Weapon)) slot = 'weapon';
  else if (def?.tags.includes(CardTag.Armor)) slot = 'armor';
  else if (def?.tags.includes(CardTag.DefensiveHorse)) slot = 'defensiveHorse';
  else slot = 'offensiveHorse';
  const old = player.equipment[slot];
  if (old) game.cardIndex.delete(old.id); // 顶掉旧装备（测试置场不触发移动事件）
  player.equipment[slot] = card;
  game.cardIndex.set(card.id, { player, zone: 'equipment' });
}
