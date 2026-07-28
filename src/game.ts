// ============================================================
// 三国杀最小原型 — 核心游戏逻辑
// 事件系统已接入，所有游戏动作通过工厂函数触发
// ============================================================

import { Card, CardType, GameState, Hero, Player } from './types.js';
import { EventType, GameEvent } from './events/index.js';
import type {
  DamageEventData,
  DrawEventData,
  RecoverEventData,
  DieEventData,
  TurnEventData,
  RoundEventData,
  GameEventData,
  PhaseEventData,
} from './events/index.js';

// ============================================================
// 游戏状态引用（供工厂函数在 content 中访问全局状态）
// ============================================================

let _gs: GameState | null = null;

/** 主循环调用，设置当前游戏实例 */
export function setGameState(gs: GameState): void {
  _gs = gs;
}

function gs(): GameState {
  if (!_gs) throw new Error('GameState not set — call setGameState() first');
  return _gs;
}

// ============================================================
// 牌堆
// ============================================================

let nextCardId = 1;

/** 创建一副简化牌堆（104张，2副标准扑克合并） */
export function createDeck(): Card[] {
  const suits = ['♠', '♥', '♣', '♦'];
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  const deck: Card[] = [];

  for (let copy = 0; copy < 2; copy++) {
    for (const suit of suits) {
      for (const num of numbers) {
        let type: CardType;
        if (suit === '♠' || suit === '♣') {
          type = CardType.Sha;
        } else if (suit === '♥') {
          type = num === 2 ? CardType.Tao : CardType.Shan;
        } else {
          type = CardType.Tao;
        }
        deck.push({ id: nextCardId++, type, suit, number: num });
      }
    }
  }
  return deck;
}

/** Fisher-Yates 洗牌 */
export function shuffle(deck: Card[]): Card[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ============================================================
// 游戏初始化
// ============================================================

export function createGame(): GameState {
  const liuBei: Hero = { name: '刘备', maxHp: 4 };
  const caoAcao: Hero = { name: '曹操', maxHp: 4 };

  const player1: Player = {
    name: '刘备', hero: liuBei,
    hp: liuBei.maxHp, maxHp: liuBei.maxHp,
    hand: [], alive: true,
  };
  const player2: Player = {
    name: '曹操', hero: caoAcao,
    hp: caoAcao.maxHp, maxHp: caoAcao.maxHp,
    hand: [], alive: true,
  };

  const deck = shuffle(createDeck());
  const discardPile: Card[] = [];

  // 起始手牌（不走事件）
  drawCardsFromDeck(player1, deck, discardPile, 4);
  drawCardsFromDeck(player2, deck, discardPile, 4);

  return {
    players: [player1, player2],
    currentIndex: 0,
    deck, discardPile,
    round: 1, gameOver: false, winner: null,
  };
}

// ============================================================
// 摸牌工具
// ============================================================

function drawCardsFromDeck(
  player: Player, deck: Card[], discardPile: Card[], count: number,
): void {
  for (let i = 0; i < count; i++) {
    if (deck.length === 0) {
      if (discardPile.length === 0) {
        console.log('  ⚠️ 牌堆和弃牌堆都已空，无法摸牌');
        return;
      }
      const reshuffled = shuffle(discardPile);
      deck.push(...reshuffled);
      discardPile.length = 0;
      console.log('  🔄 弃牌堆重新洗入牌堆');
    }
    player.hand.push(deck.pop()!);
  }
}

// ============================================================
// Action 工厂函数
// ============================================================

/** 造成伤害 */
export async function damage(
  data: DamageEventData,
): Promise<GameEvent<DamageEventData>> {
  return new GameEvent<DamageEventData>(EventType.Damage, data)
    .execute(async (event) => {
      event.data.target.hp -= event.data.amount;
      console.log(
        `  💥 ${event.data.target.name} 受到${event.data.amount}点伤害！` +
        `体力: ${event.data.target.hp}/${event.data.target.maxHp}`,
      );
      if (event.data.target.hp <= 0) {
        await die({ player: event.data.target });
      }
    });
}

/** 恢复体力 */
export async function recover(
  data: RecoverEventData,
): Promise<GameEvent<RecoverEventData>> {
  return new GameEvent<RecoverEventData>(EventType.Recover, data)
    .execute(async (event) => {
      event.data.target.hp = Math.min(
        event.data.target.hp + event.data.amount,
        event.data.target.maxHp,
      );
    });
}

/** 摸牌 */
export async function drawCards(
  data: DrawEventData,
): Promise<GameEvent<DrawEventData>> {
  const state = gs();
  return new GameEvent<DrawEventData>(EventType.Draw, data)
    .execute(async (event) => {
      drawCardsFromDeck(
        event.data.target, state.deck, state.discardPile, event.data.count,
      );
    });
}

/** 死亡结算 */
export async function die(
  data: DieEventData,
): Promise<GameEvent<DieEventData>> {
  const state = gs();
  return new GameEvent<DieEventData>(EventType.Die, data)
    .execute(async (event) => {
      event.data.player.alive = false;
      state.gameOver = true;
      state.winner = state.players.find((p) => p !== event.data.player)!;
      console.log(`\n💀 ${event.data.player.name} 阵亡！`);
    });
}

// ============================================================
// Boundary 工厂函数（轮/回合/阶段）
// 每个工厂 content 硬编码，不暴露 body 参数
// ============================================================

/** 回合：依次执行摸牌 → 出牌 → 弃牌三个阶段 */
export async function turn(
  data: TurnEventData,
): Promise<GameEvent<TurnEventData>> {
  const state = gs();
  return new GameEvent<TurnEventData>(EventType.Turn, data)
    .execute(async () => {
      await drawPhase({ player: data.player, round: data.round });
      if (state.gameOver) return;
      await playPhase({ player: data.player, round: data.round });
      if (state.gameOver) return;
      await discardPhase({ player: data.player, round: data.round });
    });
}

/** 摸牌阶段：摸2张牌 */
export async function drawPhase(
  data: PhaseEventData,
): Promise<GameEvent<PhaseEventData>> {
  return new GameEvent<PhaseEventData>(EventType.DrawPhase, data)
    .execute(async (event) => {
      const player = event.data.player;
      const before = player.hand.length;
      await drawCards({ target: player, count: 2 });
      const after = player.hand.length;
      console.log(`[摸牌阶段] ${player.name} 摸了 ${after - before} 张牌`);
    });
}

/** 出牌阶段：AI 自动决策（吃桃 → 出杀） */
export async function playPhase(
  data: PhaseEventData,
): Promise<GameEvent<PhaseEventData>> {
  const state = gs();
  return new GameEvent<PhaseEventData>(EventType.PlayPhase, data)
    .execute(async (event) => {
      console.log(`[出牌阶段]`);
      const player = event.data.player;
      const enemy = state.players.find((p) => p !== player)!;

      let shaUsed = false;
      let i = 0;
      while (i < player.hand.length) {
        const card = player.hand[i];

        if (card.type === CardType.Tao && player.hp < player.maxHp) {
          player.hand.splice(i, 1);
          await useTao(player, card);
          continue;
        }

        if (card.type === CardType.Sha && !shaUsed) {
          shaUsed = true;
          player.hand.splice(i, 1);
          await useSha(player, enemy, card);
          continue;
        }

        i++;
      }
    });
}

/** 弃牌阶段：手牌数不能超过当前体力值 */
export async function discardPhase(
  data: PhaseEventData,
): Promise<GameEvent<PhaseEventData>> {
  return new GameEvent<PhaseEventData>(EventType.DiscardPhase, data)
    .execute(async (event) => {
      doDiscard(event.data.player);
    });
}

/** 一整局游戏：主循环 */
export async function runGame(): Promise<GameEvent<GameEventData>> {
  const state = gs();
  return new GameEvent<GameEventData>(EventType.Game, {})
    .execute(async () => {
      while (!state.gameOver) {
        await round({ round: state.round });
        state.round++;
      }
    });
}

/** 一轮：所有玩家依次执行回合 */
export async function round(
  data: RoundEventData,
): Promise<GameEvent<RoundEventData>> {
  const state = gs();
  return new GameEvent<RoundEventData>(EventType.Round, data)
    .execute(async () => {
      for (let i = 0; i < state.players.length; i++) {
        state.currentIndex = i;
        const player = state.players[i];

        console.log(`\n━━━ 第 ${data.round} 轮 · ${player.name} 的回合 ━━━`);
        await playerTurn(state);

        if (state.gameOver) return;
        printState(state);
      }
    });
}

// ============================================================
// 出牌阶段内部逻辑
// ============================================================

/** 使用桃 */
async function useTao(player: Player, card: Card): Promise<void> {
  gs().discardPile.push(card);
  const before = player.hp;

  await recover({ target: player, amount: 1 });

  console.log(
    `  ${player.name} 使用了 🍑桃 (${card.suit}${displayNumber(card.number)})，` +
    `体力恢复到 ${before}→${player.hp}/${player.maxHp}`,
  );
}

/** 使用杀 */
async function useSha(attacker: Player, defender: Player, card: Card): Promise<void> {
  gs().discardPile.push(card);
  console.log(
    `  ${attacker.name} 对 ${defender.name} 使用了 🗡️杀 (${card.suit}${displayNumber(card.number)})`,
  );
  await resolveSha(attacker, defender);
}

/** 结算杀：检查闪 → 伤害 */
async function resolveSha(attacker: Player, defender: Player): Promise<void> {
  const shanIndex = defender.hand.findIndex((c) => c.type === CardType.Shan);

  if (shanIndex >= 0) {
    const shanCard = defender.hand.splice(shanIndex, 1)[0];
    gs().discardPile.push(shanCard);
    console.log(
      `  ${defender.name} 使用了 🛡️闪 (${shanCard.suit}${displayNumber(shanCard.number)})，抵消了攻击`,
    );
  } else {
    await damage({ target: defender, source: attacker, amount: 1 });
  }
}

// ============================================================
// 弃牌阶段逻辑
// ============================================================

function doDiscard(player: Player): void {
  const state = gs();

  if (player.hand.length <= player.hp) {
    if (player.hand.length > 0) {
      console.log(`[弃牌阶段] ${player.name} 手牌数(${player.hand.length}) ≤ 体力(${player.hp})，无需弃牌`);
    }
    return;
  }

  const excess = player.hand.length - player.hp;
  console.log(
    `[弃牌阶段] ${player.name} 手牌数(${player.hand.length}) > 体力(${player.hp})，需要弃置 ${excess} 张`,
  );

  const priority: Record<string, number> = {
    [CardType.Sha]: 0, [CardType.Shan]: 1, [CardType.Tao]: 2,
  };
  const sorted = [...player.hand].sort(
    (a, b) => priority[a.type] - priority[b.type],
  );
  const toDiscard = new Set(sorted.slice(0, excess).map((c) => c.id));

  player.hand = player.hand.filter((c) => {
    if (toDiscard.has(c.id)) {
      state.discardPile.push(c);
      console.log(`  弃置了 ${cardEmoji(c.type)} (${c.suit}${displayNumber(c.number)})`);
      return false;
    }
    return true;
  });
}

// ============================================================
// 回合
// ============================================================

/** 执行一个玩家的完整回合 */
export async function playerTurn(state: GameState): Promise<void> {
  const player = state.players[state.currentIndex];

  if (!player.alive) {
    console.log(`${player.name} 已阵亡，跳过回合`);
    return;
  }

  await turn({ player, round: state.round });
}

// ============================================================
// 显示
// ============================================================

function cardEmoji(type: CardType): string {
  switch (type) {
    case CardType.Sha:  return '🗡️';
    case CardType.Shan: return '🛡️';
    case CardType.Tao:  return '🍑';
  }
}

function displayNumber(n: number): string {
  switch (n) {
    case 1:  return 'A';
    case 11: return 'J';
    case 12: return 'Q';
    case 13: return 'K';
    default: return String(n);
  }
}

function handDisplay(hand: Card[]): string {
  if (hand.length === 0) return '（空）';
  const sorted = [...hand].sort((a, b) => {
    const order: Record<string, number> = {
      [CardType.Sha]: 0, [CardType.Shan]: 1, [CardType.Tao]: 2,
    };
    return (order[a.type] ?? 0) - (order[b.type] ?? 0);
  });
  return sorted
    .map((c) => `${cardEmoji(c.type)}${c.suit}${displayNumber(c.number)}`)
    .join(' ');
}

function hpBar(current: number, max: number): string {
  return '❤️'.repeat(current) + '🖤'.repeat(max - current) + ` (${current}/${max})`;
}

export function printState(state: GameState): void {
  const [p1, p2] = state.players;
  console.log(`
╔══════════════════════════════════════╗
║        🏯 三国杀 · 最小原型         ║
╠══════════════════════════════════════╣
║ ${padEnd(p1.name, 4)} ${hpBar(p1.hp, p1.maxHp).padEnd(24)}║
║   手牌: ${padEnd(handDisplay(p1.hand), 28)}║
║                                      ║
║ ${padEnd(p2.name, 4)} ${hpBar(p2.hp, p2.maxHp).padEnd(24)}║
║   手牌: ${padEnd(handDisplay(p2.hand), 28)}║
║                                      ║
║ 牌堆: ${String(state.deck.length).padStart(3)}张 | 弃牌堆: ${String(state.discardPile.length).padStart(3)}张 | 第${state.round}轮 ║
╚══════════════════════════════════════╝`);
}

function padEnd(str: string, len: number): string {
  let width = 0;
  for (const ch of str) {
    width += /[一-鿿　-〿＀-￯]/.test(ch) ? 2 : 1;
  }
  return str + ' '.repeat(Math.max(0, len - width));
}
