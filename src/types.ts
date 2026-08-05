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
  WuGu = '五谷丰登',
  LeBu = '乐不思蜀',
  ShanDian = '闪电',
  ZhugeLianNu = '诸葛连弩',
  BaGuaZhen = '八卦阵',
  JueYing = '绝影',
  ChiTu = '赤兔',
  QiLinGong = '麒麟弓',
  HanBingJian = '寒冰剑',
  GuoHe = '过河拆桥',
  ShunShou = '顺手牵羊',
  WuXie = '无懈可击',
}

/** 卡牌标签（分类） */
export enum CardTag {
  Basic = 'basic',   // 基本牌
  Trick = 'trick',   // 锦囊牌
  Delay = 'delay',   // 延时锦囊
  Equip = 'equip',   // 装备牌
  Weapon = 'weapon',
  Armor = 'armor',
  DefensiveHorse = 'defensiveHorse',  // 防御马：其他角色计算与你的距离+1
  OffensiveHorse = 'offensiveHorse',  // 进攻马：你计算与其他角色的距离-1
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
  /** 判定区（延时锦囊） */
  judgment: Card[];
  /** 装备区 */
  equipment: PlayerEquipment;
  alive: boolean;
  /** 本回合是否被乐不思蜀跳过出牌阶段（回合开始重置） */
  skipPlayPhase?: boolean;
}

/** 装备区：武器 / 防具 / 防御马 / 进攻马 四个栏位 */
export interface PlayerEquipment {
  weapon?: Card;
  armor?: Card;
  defensiveHorse?: Card; // 防御马（其他角色与你距离+1）
  offensiveHorse?: Card; // 进攻马（你与其他角色距离-1）
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
