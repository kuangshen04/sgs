// ============================================================
// 三国杀最小原型 — 类型定义
// 所有类型直接写死，不做抽象
// ============================================================

import type { CardArea } from './position/cardArea.js';
import type { SkillInstance } from './effects/effects.js';

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
  RenWangDun = '仁王盾',
  CiXiongShuangGuJian = '雌雄双股剑',
  QingGangJian = '青釭剑',
  QingLongYanYueDao = '青龙偃月刀',
  ZhangBaSheMao = '丈八蛇矛',
  GuanShiFu = '贯石斧',
  FangTianHuaJi = '方天画戟',
  DiLu = '的卢',
  ZhuaHuangFeiDian = '爪黄飞电',
  DaYuan = '大宛',
  ZiXin = '紫骍',
  JieDao = '借刀杀人',
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

/** 牌的颜色（由花色派生；无花色 → 无颜色） */
export type CardColor = 'red' | 'black';

/** 花色 → 颜色；无花色返回 null */
export function colorOfSuit(suit: string | null | undefined): CardColor | null {
  if (suit === '♥' || suit === '♦') return 'red';
  if (suit === '♠' || suit === '♣') return 'black';
  return null;
}

/**
 * 一次“使用中的牌”：效果牌 / 虚拟牌描述符。
 * 与物理 Card 不同，它不占任何 CardLocation；physicalCards 是本次使用
 * 实际消耗并进入处理区的实体牌。
 *
 * 规则身份（花色/点数/颜色）由实体组成**推导**（标包转化规则，见 usedCards.deriveCardFace）：
 *   - 单牌转化 → 继承该实体牌的花色与点数；
 *   - 无牌转化 → 无花色、无点数、无颜色；
 *   - 多牌转化 → 无花色、无点数；所有实体牌同色则有该颜色，否则无颜色；
 *   - 特殊声明 → 以声明为准。
 * 三个字段因此可省略（= 交给引擎推导）；UC 实例上的取值是推导结果（可为 null）。
 */
export interface UsedCard {
  type: CardType;
  name: string;
  suit?: string | null;
  number?: number | null;
  color?: CardColor | null;
  physicalCards: Card[];
}

/** 武将定义（内容包装配进容器；createGame 通过名字引用，可重复） */
export interface HeroDef {
  name: string;
  maxHp: number;
  sex: HeroSex;
  group: HeroGroup;
  /** 能否当主公（身份场用；标包主公候选 = 刘备/曹操/孙权） */
  isLord?: boolean;
  /** 拥有的技能名列表（引用规则集里的 Skill.name） */
  skills?: string[];
}

/** 性别（对应标包数据中的 sex 字段） */
export type HeroSex = 'male' | 'female';

/** 势力（标包四势力） */
export type HeroGroup = '魏' | '蜀' | '吴' | '群';

/** 玩家状态 */
export interface Player {
  name: string;
  hero: HeroDef;
  hp: number;
  maxHp: number;
  /** 手牌（受控容器 CardArea，阶段 2） */
  hand: CardArea;
  /** 判定区（延时锦囊；受控容器 CardArea，阶段 2） */
  judgment: CardArea;
  /** 装备区 */
  equipment: PlayerEquipment;
  /**
   * 局内技能实例表（权威）：开局按 hero.skills 建立；获得/失去技能 = 实例增删；
   * 技能失效状态挂在实例上。hero.skills 仅作"初始技能清单"内容数据。
   */
  skills: Map<string, SkillInstance>;
  alive: boolean;
  /** 本回合是否被乐不思蜀跳过出牌阶段（回合开始重置） */
  skipPlayPhase?: boolean;
  /** 本回合是否跳过弃牌阶段（克己可设置；回合开始重置） */
  skipDiscardPhase?: boolean;
}

/**
 * 卡牌位置（统一位置模型的基础）。
 * 玩家三区（hand/equipment/judgment）+ 牌堆/弃牌堆；
 * processing（处理区）等后续需要时再加。
 * 注意：牌堆顶/底不是位置，是移动时的取放策略（toPosition）。
 */
export type CardLocation =
  | { player: Player; zone: 'hand' | 'equipment' | 'judgment' }
  | { zone: 'deck' | 'discardPile' | 'processing' };

/** 移动原因（CardMove 事件的语义标签；转化牌/虚拟牌可能扩展） */
export type CardMoveReason =
  | 'draw'        // 摸牌
  | 'judge'       // 判定
  | 'discard'     // 弃置
  | 'play'        // 打出（响应）
  | 'use'         // 使用消耗/置入判定区
  | 'equip'       // 装备入槽
  | 'replace'     // 顶掉旧装备
  | 'give'        // 交给/获得
  | 'obtain'      // 从弃牌堆/牌堆取回
  | 'transfer'    // 判定区转移（闪电）
  | 'resolve'     // 延时牌结算
  | 'reveal'      // 亮出（五谷丰登等）
  | 'virtualBroken' // 驻留 UsedCard 被破坏：其剩余实体牌置入弃牌堆
  | 'reshuffle';  // 洗牌（弃牌堆 → 牌堆）

/**
 * 响应过程状态（随 useCard 事件生命周期存在）。
 * 铁骑等在 targeting.after 写入，响应流程读取。
 * 注：所需闪数（无双）自阶段 3 起改为常驻查询 'shaRequired'，不再走此标记。
 */
export interface RespondMarks {
  /** 不可闪避（铁骑判定红色后设置） */
  unavoidable?: boolean;
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
  deck: CardArea;
  discardPile: CardArea;
  /** 处理区：正在结算中的牌（使用/打出后、结算完成前） */
  processing: CardArea;
  /** 当前主公（身份场）；undefined = 未启用身份场，主公技按普通技能处理 */
  lord?: Player;
  round: number;
  gameOver: boolean;
  winner: Player | null;
  victoryCheck: VictoryCondition;
}
