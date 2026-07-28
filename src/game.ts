// ============================================================
// 三国杀最小原型 — 核心游戏逻辑
// 纯面向过程，所有数据写死，无事件系统
// ============================================================

import { Card, CardType, GameState, Hero, Player } from './types.js';

// ============================================================
// 牌堆
// ============================================================

let nextCardId = 1;

/** 创建一副简化牌堆（104张，2副标准扑克合并） */
export function createDeck(): Card[] {
  const suits = ['♠', '♥', '♣', '♦'];
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  const deck: Card[] = [];

  // 2副牌
  for (let copy = 0; copy < 2; copy++) {
    for (const suit of suits) {
      for (const num of numbers) {
        let type: CardType;

        if (suit === '♠' || suit === '♣') {
          type = CardType.Sha;
        } else if (suit === '♥') {
          // ♥2 特殊处理为桃（增加桃的数量）
          type = num === 2 ? CardType.Tao : CardType.Shan;
        } else {
          // ♦ 全部是桃
          type = CardType.Tao;
        }

        deck.push({
          id: nextCardId++,
          type,
          suit,
          number: num,
        });
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

/** 创建一个新游戏 */
export function createGame(): GameState {
  // 写死的武将数据
  const liuBei: Hero = { name: '刘备', maxHp: 4 };
  const caoAcao: Hero = { name: '曹操', maxHp: 4 };

  const player1: Player = {
    name: '刘备',
    hero: liuBei,
    hp: liuBei.maxHp,
    maxHp: liuBei.maxHp,
    hand: [],
    alive: true,
  };

  const player2: Player = {
    name: '曹操',
    hero: caoAcao,
    hp: caoAcao.maxHp,
    maxHp: caoAcao.maxHp,
    hand: [],
    alive: true,
  };

  const deck = shuffle(createDeck());
  const discardPile: Card[] = [];

  // 各摸4张起始手牌
  drawCardsFromDeck(player1, deck, discardPile, 4);
  drawCardsFromDeck(player2, deck, discardPile, 4);

  return {
    players: [player1, player2],
    currentIndex: 0,
    deck,
    discardPile,
    round: 1,
    gameOver: false,
    winner: null,
  };
}

// ============================================================
// 摸牌
// ============================================================

/** 从牌堆摸牌，牌堆不够时洗入弃牌堆 */
function drawCardsFromDeck(
  player: Player,
  deck: Card[],
  discardPile: Card[],
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    if (deck.length === 0) {
      // 洗入弃牌堆
      if (discardPile.length === 0) {
        console.log('  ⚠️ 牌堆和弃牌堆都已空，无法摸牌');
        return;
      }
      const reshuffled = shuffle(discardPile);
      deck.push(...reshuffled);
      discardPile.length = 0;
      console.log('  🔄 弃牌堆重新洗入牌堆');
    }
    const card = deck.pop()!;
    player.hand.push(card);
  }
}

/** 摸牌阶段：当前玩家摸2张牌 */
export function drawPhase(state: GameState): void {
  const player = state.players[state.currentIndex];
  const before = player.hand.length;
  drawCardsFromDeck(player, state.deck, state.discardPile, 2);
  const after = player.hand.length;
  console.log(`[摸牌阶段] ${player.name} 摸了 ${after - before} 张牌`);
}

// ============================================================
// 出牌阶段（AI 自动决策）
// ============================================================

/** AI 出牌阶段 */
export function playPhase(state: GameState): void {
  const player = state.players[state.currentIndex];
  const enemy = state.players[1 - state.currentIndex];

  console.log(`[出牌阶段]`);

  let shaUsed = false; // 每回合限出1张杀（无技能加成）

  // 按顺序尝试：先吃桃，再出杀
  // 遍历手牌，跳过已处理的
  let i = 0;
  while (i < player.hand.length) {
    const card = player.hand[i];

    if (card.type === CardType.Tao && player.hp < player.maxHp) {
      // 受伤时吃桃
      useTao(state, player, i);
      // 使用后索引不变（数组已缩短）
      continue;
    }

    if (card.type === CardType.Sha && !shaUsed) {
      // 出杀
      shaUsed = true;
      useSha(state, player, enemy, i);
      continue;
    }

    i++;
  }
}

/** 使用桃 */
function useTao(
  state: GameState,
  player: Player,
  handIndex: number,
): void {
  const card = player.hand.splice(handIndex, 1)[0];
  state.discardPile.push(card);
  player.hp = Math.min(player.hp + 1, player.maxHp);
  console.log(
    `  ${player.name} 使用了 🍑桃 (${card.suit}${displayNumber(card.number)})，` +
    `体力恢复到 ${player.hp}/${player.maxHp}`,
  );
}

/** 使用杀 */
function useSha(
  state: GameState,
  attacker: Player,
  defender: Player,
  handIndex: number,
): void {
  const card = attacker.hand.splice(handIndex, 1)[0];
  state.discardPile.push(card);
  console.log(
    `  ${attacker.name} 对 ${defender.name} 使用了 🗡️杀 (${card.suit}${displayNumber(card.number)})`,
  );
  resolveSha(state, defender);
}

/** 结算杀：检查闪 → 伤害 */
function resolveSha(state: GameState, defender: Player): void {
  // 检查防御方是否有闪
  const shanIndex = defender.hand.findIndex((c) => c.type === CardType.Shan);

  if (shanIndex >= 0) {
    // 有闪 → 出闪抵消
    const shanCard = defender.hand.splice(shanIndex, 1)[0];
    state.discardPile.push(shanCard);
    console.log(
      `  ${defender.name} 使用了 🛡️闪 (${shanCard.suit}${displayNumber(shanCard.number)})，抵消了攻击`,
    );
  } else {
    // 无闪 → 受到伤害
    defender.hp -= 1;
    console.log(
      `  💥 ${defender.name} 没有闪，受到1点伤害！` +
      `体力: ${defender.hp}/${defender.maxHp}`,
    );

    // 检查死亡
    if (defender.hp <= 0) {
      dieCheck(state, defender);
    }
  }
}

// ============================================================
// 弃牌阶段
// ============================================================

/** 弃牌阶段：手牌数不能超过当前体力值 */
export function discardPhase(state: GameState): void {
  const player = state.players[state.currentIndex];

  if (player.hand.length <= player.hp) return;

  const excess = player.hand.length - player.hp;
  console.log(
    `[弃牌阶段] ${player.name} 手牌数(${player.hand.length}) > 体力(${player.hp})，需要弃置 ${excess} 张`,
  );

  // 弃牌优先级：杀 > 闪 > 桃（桃最宝贵，闪次之）
  const priority: Record<string, number> = {
    [CardType.Sha]: 0,
    [CardType.Shan]: 1,
    [CardType.Tao]: 2,
  };

  // 按优先级排序后弃掉前面的
  const sorted = [...player.hand].sort(
    (a, b) => priority[a.type] - priority[b.type],
  );

  // 移除优先级最低的 excess 张
  const toDiscard = new Set(sorted.slice(0, excess).map((c) => c.id));

  player.hand = player.hand.filter((c) => {
    if (toDiscard.has(c.id)) {
      state.discardPile.push(c);
      console.log(
        `  弃置了 ${cardEmoji(c.type)} (${c.suit}${displayNumber(c.number)})`,
      );
      return false;
    }
    return true;
  });
}

// ============================================================
// 死亡 & 胜利
// ============================================================

/** 检查玩家是否死亡 */
function dieCheck(state: GameState, player: Player): void {
  if (player.hp <= 0) {
    player.alive = false;
    state.gameOver = true;
    // 赢家是另一个存活的玩家
    state.winner = state.players.find((p) => p !== player)!;
    console.log(`\n💀 ${player.name} 阵亡！`);
  }
}

// ============================================================
// 完整回合
// ============================================================

/** 执行一个玩家的完整回合 */
export function playerTurn(state: GameState): void {
  const player = state.players[state.currentIndex];

  if (!player.alive) {
    console.log(`${player.name} 已阵亡，跳过回合`);
    return;
  }

  // 1. 摸牌阶段
  drawPhase(state);
  if (state.gameOver) return;

  // 2. 出牌阶段
  playPhase(state);
  if (state.gameOver) return;

  // 3. 弃牌阶段
  discardPhase(state);
}

// ============================================================
// 显示
// ============================================================

/** 卡牌类型 → emoji */
function cardEmoji(type: CardType): string {
  switch (type) {
    case CardType.Sha:
      return '🗡️';
    case CardType.Shan:
      return '🛡️';
    case CardType.Tao:
      return '🍑';
  }
}

/** 点数 → 显示字符串 (1→A, 11→J, 12→Q, 13→K) */
function displayNumber(n: number): string {
  switch (n) {
    case 1:
      return 'A';
    case 11:
      return 'J';
    case 12:
      return 'Q';
    case 13:
      return 'K';
    default:
      return String(n);
  }
}

/** 手牌按类型排序后显示 */
function handDisplay(hand: Card[]): string {
  if (hand.length === 0) return '（空）';

  const sorted = [...hand].sort((a, b) => {
    const order: Record<string, number> = {
      [CardType.Sha]: 0,
      [CardType.Shan]: 1,
      [CardType.Tao]: 2,
    };
    return (order[a.type] ?? 0) - (order[b.type] ?? 0);
  });

  return sorted
    .map((c) => `${cardEmoji(c.type)}${c.suit}${displayNumber(c.number)}`)
    .join(' ');
}

/** 体力条 */
function hpBar(current: number, max: number): string {
  const filled = '❤️'.repeat(current);
  const empty = '🖤'.repeat(max - current);
  return filled + empty + ` (${current}/${max})`;
}

/** 打印游戏状态 */
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

/** 中英文混排的 padEnd（粗略处理，中文算2宽） */
function padEnd(str: string, len: number): string {
  let width = 0;
  for (const ch of str) {
    width += /[一-鿿　-〿＀-￯]/.test(ch) ? 2 : 1;
  }
  return str + ' '.repeat(Math.max(0, len - width));
}
