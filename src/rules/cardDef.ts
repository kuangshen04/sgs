// ============================================================
// 卡牌定义契约（内容 → 引擎的接口）
//
// 定义**长什么样**属于引擎侧契约：内容文件提供定义，引擎按定义驱动结算。
// 定义层的存放与查询在 `rules/ruleSet.ts`（容器 / 规则集），
// 具体内容住在 `content/`。
// ============================================================

import type { Card, CardTag, CardType, Player } from '../types.js';
import type { UsedCardInstance } from '../position/usedCards.js';
import type { Game } from '../game.js';
import type { CardEffectEventData, GameEvent, UseCardEventData } from '../events/index.js';

/** 卡牌效果函数：**对该目标**结算（单目标生效事件的内容，adr/0006） */
export type CardContentFn = (
  game: Game,
  data: CardEffectEventData,
  event: GameEvent<CardEffectEventData>,
) => Promise<void>;

/** 整张牌的开幕 / 收尾（可选）：亮牌一次、整体日志等 */
export type CardActionFn = (
  game: Game,
  data: UseCardEventData,
  event: GameEvent<UseCardEventData>,
  phase: 'before' | 'after',
) => Promise<void>;

/** 一张牌的完整定义（由 content/cards/ 下各文件装配时注册） */
export interface CardDef {
  type: CardType;
  name: string;
  /** 规则文本（纯数据；来自 docs 标包数据，未显式给出时按卡牌名自动填充） */
  info?: string;
  emoji: string;
  /** 对**该目标**结算（在该目标的单目标生效事件内执行） */
  content: CardContentFn;
  /**
   * 整张牌的开幕 / 收尾（可选）：在**逐目标生效之前 / 之后**各调用一次。
   * 用于"一次性的整体动作"，如五谷丰登亮牌一次（亮出的牌池放 `use.extra`）。
   */
  onAction?: CardActionFn;
  /**
   * 延时锦囊在判定阶段的结算效果（收到判定结果与该延时牌的 UC；可自行**迁移 UC**，如闪电移给下家）。
   * `judgeCard === null` = 本次被抵消（无判定牌、未执行效果）：延时牌仍在此决定收尾去向
   * （闪电按规则集依然流向合法下家；不处理则收尾进弃牌堆）。
   * 读规则读 UC（adr/0003）：类型/名称/花色取 UC 自身的规则身份。
   */
  delayContent?: (game: Game, target: Player, judgeCard: Card | null, uc: UsedCardInstance) => Promise<void>;
  /** 攻击范围（装备牌中的武器） */
  range?: number;
  /** 卡牌标签（基本牌/锦囊牌等） */
  tags: CardTag[];
  /** 规则层面：出牌阶段是否合法可用（规则层查询统一带 game：读规则读 UC，adr/0003） */
  canUse: (game: Game, player: Player, allPlayers: Player[], shaUsed: boolean) => boolean;
  /** 此牌可选择的合法目标列表（规则层面） */
  targetFilter: (game: Game, user: Player, allPlayers: Player[]) => Player[];
  /** 目标数量约束（规则层面）：固定数 或 'all' 表示合法目标全部 */
  targetCount: number | 'all';
  ai: {
    /** AI 层面：当前是否应该使用（策略；规则合法 ≠ 现在应该用） */
    shouldUse: (player: Player, shaUsed: boolean) => boolean;
    usePriority: number;     // AI 使用优先级（越大越优先）
    discardPriority: number; // 弃牌优先级（越小越先弃）
  };
}
