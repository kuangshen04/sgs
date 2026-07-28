// ============================================================
// 三国杀最小原型 — 类型定义
// 所有类型直接写死，不做抽象
// ============================================================

/** 卡牌类型 */
export enum CardType {
  Sha = '杀',
  Shan = '闪',
  Tao = '桃',
}

/** 一张卡牌 */
export interface Card {
  id: number;
  type: CardType;
  suit: string;   // ♠ ♥ ♣ ♦
  number: number; // 1-13
}

/** 武将（写死） */
export interface Hero {
  name: string;
  maxHp: number;
}

/** 玩家状态 */
export interface Player {
  name: string;
  hero: Hero;
  hp: number;
  maxHp: number;
  hand: Card[];
  alive: boolean;
}

/** 游戏全局状态 */
export interface GameState {
  players: [Player, Player]; // 固定2人
  currentIndex: number;      // 当前回合玩家索引 0/1
  deck: Card[];
  discardPile: Card[];
  round: number;
  gameOver: boolean;
  winner: Player | null;
}
