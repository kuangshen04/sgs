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

/**
 * 一次“使用中的牌”：效果牌 / 虚拟牌描述符。
 * 与物理 Card 不同，它不占任何 CardLocation；physicalCards 是本次使用
 * 实际消耗并进入处理区的实体牌。
 */
export interface UsedCard {
  type: CardType;
  name: string;
  suit: string;
  number: number;
  physicalCards: Card[];
}

/** 武将定义（注册到 heroRegistry，createGame 通过名字引用，可重复） */
export interface HeroDef {
  name: string;
  maxHp: number;
  sex: HeroSex;
  group: HeroGroup;
  /** 能否当主公（身份场用；标包主公候选 = 刘备/曹操/孙权） */
  isLord?: boolean;
  /** 拥有的技能名列表（引用 skillRegistry 中的 SkillDef.name） */
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
  hand: Card[];
  /** 判定区（延时锦囊） */
  judgment: Card[];
  /** 装备区 */
  equipment: PlayerEquipment;
  alive: boolean;
  /** 本回合是否被乐不思蜀跳过出牌阶段（回合开始重置） */
  skipPlayPhase?: boolean;
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
  | 'reshuffle';  // 洗牌（弃牌堆 → 牌堆）

/**
 * 响应过程状态（随 useCard 事件生命周期存在）。
 * targeting.after 的锁定技（无双/铁骑）写入，响应流程读取。
 * 单例技能特判，不做通用机制（无双是唯一修改响应数的技能）。
 */
export interface RespondMarks {
  /** 所需闪数（无双①：杀的目标需两张闪；普通杀不设置，默认 1） */
  shanRequired?: number;
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
  deck: Card[];
  discardPile: Card[];
  /** 处理区：正在结算中的牌（使用/打出后、结算完成前） */
  processing: Card[];
  /** 当前主公（身份场）；undefined = 未启用身份场，主公技按普通技能处理 */
  lord?: Player;
  round: number;
  gameOver: boolean;
  winner: Player | null;
  victoryCheck: VictoryCondition;
}
