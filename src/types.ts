// ============================================================
// 三国杀最小原型 — 类型定义
// 所有类型直接写死，不做抽象
// ============================================================

/** 卡牌类型 */
export enum CardType {
  Sha = '杀',
  Shan = '闪',
  Tao = '桃',
  WuZhong = '无中生有',
  JueDou = '决斗',
  NanMan = '南蛮入侵',
  WanJian = '万箭齐发',
  TaoYuan = '桃园结义',
  GuoHe = '过河拆桥',
  ShunShou = '顺手牵羊',
  WuXie = '无懈可击',
}

/** 卡牌标签（分类） */
export enum CardTag {
  Basic = 'basic',   // 基本牌
  Trick = 'trick',   // 锦囊牌
}

/** 一张卡牌 */
export interface Card {
  id: number;
  type: CardType;
  name: string;   // 显示名，如 杀、闪、桃
  suit: string;   // ♠ ♥ ♣ ♦
  number: number; // 1-13
}

/** 武将定义（注册到 heroRegistry，createGame 通过名字引用，可重复） */
export interface HeroDef {
  name: string;
  maxHp: number;
  /** 拥有的技能名列表（引用 skillRegistry 中的 SkillDef.name） */
  skills?: string[];
}

/** 玩家状态 */
export interface Player {
  name: string;
  hero: HeroDef;
  hp: number;
  maxHp: number;
  hand: Card[];
  alive: boolean;
}

/** 胜利条件：返回获胜者，或 null 表示游戏继续 */
export type VictoryCondition = (state: GameState) => Player | null;

/** 游戏全局状态 */
export interface GameState {
  players: Player[];         // 参数化玩家数
  currentIndex: number;      // 当前回合玩家索引
  deck: Card[];
  discardPile: Card[];
  round: number;
  gameOver: boolean;
  winner: Player | null;
  victoryCheck: VictoryCondition;
}
