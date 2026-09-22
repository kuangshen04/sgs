// ============================================================
// 效果（Effect）— 一等公民；技能 = 效果的命名集合 + 元数据
//
// adr/0004：效果 = 时点 + 条件 + 行为；技能是包装器（元数据 + 效果集合）；
// 裸效果是真实需求（常驻 kind 词汇、装备效果、临时效果、未来模式效果）。
//
// 本模块 = 效果词汇（五种形态的类型）+ 技能定义构造 + 局内技能实例；
// **不含**注册面与查询面（定义层的存放/查询在 `rules/ruleSet.ts` 的容器与规则集里，
// 即 `game.ruleSet.skills`），也不含分发（分发在 skills.ts 的 installEffects）
// 与窗口接线（响应/转化由 responseChoices.ts / playChoices.ts 查询）。
// 五种形态保留各自调用协议，但共享同一份"归属"信息（skill / equipType）。
// ============================================================

import { CardType } from '../types.js';
import type { Player, UsedCard } from '../types.js';
import { equippedUsedCard } from '../position/usedCardActions.js';
import type { Game } from '../game.js';
import type { GameEvent } from '../events/index.js';
import type { CardEffectEventData } from '../events/index.js';
import type { SelectionAnswers, SelectionPlan } from '../decision/selection.js';

/** 主动技能（activated 效果）的决策上下文（出牌阶段循环提供） */
export interface ActiveContext {
  shaUsed: boolean;
  /** 本回合已发动过的限次技能名 */
  usedSkills: ReadonlySet<string>;
  /** 本轮是否存在 AI 愿意使用的可用牌（制衡"没牌能出才换牌"等 AI 参考） */
  hasCardOption: boolean;
}

// ============================================================
// 效果形态
// ============================================================

/** 所有效果共享：归属（技能名 或 装备牌类型）与调试用名称 */
export interface EffectCommon {
  /** 归属技能名；裸效果为 undefined */
  skill?: string;
  /** 装备来源：装备槽中含此类型牌时归属成立（如诸葛连弩 / 马匹 / 丈八蛇矛） */
  equipType?: CardType;
  /** 调试/身份用名称（响应规则名等；未填时回退到 skill） */
  name?: string;
  /**
   * 自动发动（frequency.auto）：前端据此多一个"自动发动"按钮。
   * **现在不做**（无前端）；引擎侧不消费，仅占位词汇。默认 = 手动。
   */
  auto?: boolean;
}

/** 触发型效果：某时点响应事件（技能触发技 / 装备触发 / 裸效果） */
export interface TriggeredEffect extends EffectCommon {
  form: 'triggered';
  /** 时点，如 'damage.after'（事件类型 + before/after） */
  timing: string;
  /** 角色匹配谓词（在归属与主公门槛之后判断）；subject = 事件主体 */
  condition?: (
    game: Game, event: GameEvent<any>, owner: Player, subject: Player | undefined,
  ) => boolean;
  /** 发动效果（owner = 归属通过且（如非强制）已确认发动的角色） */
  run: (game: Game, event: GameEvent<any>, owner: Player) => Promise<void>;
  /**
   * 强制发动（forced）：不进行"是否发动"的询问（installEffects 据此跳过 askYesNo）。
   * 规则文本的"锁定技" = 内容层组合：技能打 `meta.compulsory`（抗性标签）
   * + 其触发效果打 `forced`；引擎不根据效果形态推导技能类型。
   */
  forced?: boolean;
}

/** 常驻型效果：规则决策点对该键的数值贡献（多来源叠加求和） */
export interface PersistentEffect extends EffectCommon {
  form: 'persistent';
  /** 效果键（查询点词汇，如 immuneSha / offensiveDistance / unlimitedSha） */
  key: string;
  /** 归属者对该键的贡献值（归属判定由引擎做，不再由 value 自己查技能/装备） */
  value: (owner: Player) => number;
}

/** 主动效果执行后的回执（供出牌阶段记录副作用） */
export interface ActivatedEffectResult {
  /** 本次发动是否消耗了"本回合使用杀次数"（如激将借盟友的杀当杀使用） */
  usedShaLimit?: boolean;
}

/** 主动型效果：出牌阶段可主动发动（含激将这类"借牌当杀"） */
export interface ActivatedEffect extends EffectCommon {
  form: 'activated';
  /** 规则层面：当前是否合法可用（次数限制、前提条件等） */
  canUse: (game: Game, player: Player, ctx: ActiveContext) => boolean;
  /** 选择计划（从"已选该效果"开始；无选择步骤时 nextStep 直接返回 null） */
  selectionPlan: (game: Game, player: Player, ctx: ActiveContext) => SelectionPlan;
  /** 执行：只依据确认后的 answers 执行，不再做选择；可返回副作用回执 */
  execute: (game: Game, player: Player, answers: SelectionAnswers) => Promise<ActivatedEffectResult | void>;
  /** AI 层面策略：规则合法 ≠ 现在应该用 */
  ai: {
    shouldUse: (game: Game, player: Player, ctx: ActiveContext) => boolean;
    priority: number;
  };
}

/** 响应型效果：响应窗口提供的"打出/使用"规则（武圣·当杀、龙胆、八卦阵…） */
export interface ResponseEffect extends EffectCommon {
  form: 'response';
  /** 只对哪种响应牌型生效（闪 / 杀 / 桃 / 无懈） */
  respondsTo: CardType;
  /**
   * 本效果成功时产出的**零牌虚拟牌**类型（如八卦阵视为打出一张闪）。
   * 声明后由响应执行方按"打出 = UC 进处理区 → 收尾"生成一条 0 实体牌 UC；
   * 借他人真牌（护驾/激将）不声明（牌由被借者的响应流程消费）。
   */
  virtualCard?: CardType;
  canUse: (game: Game, player: Player, request: ResponseRequest) => boolean;
  selectionPlan: (game: Game, player: Player, request: ResponseRequest) => SelectionPlan;
  resolve: (
    game: Game, player: Player, request: ResponseRequest, answers: SelectionAnswers,
  ) => Promise<ResponseOutcome>;
  ai: {
    shouldUse: (game: Game, player: Player, request: ResponseRequest) => boolean;
    priority: number;
  };
}

/** 转化型效果：一张牌视为另一张使用/打出（武圣、龙胆、奇袭、丈八蛇矛…） */
export interface ConversionEffect extends EffectCommon {
  form: 'conversion';
  toType: CardType;
  /** 规则：有符合条件源牌 && 效果牌规则合法（如杀的次数/范围） */
  canUse: (game: Game, player: Player, shaUsed: boolean) => boolean;
  /** 完整选择计划：源牌步 + 目标步（内部按源牌派生 UsedCard） */
  selectionPlan: (game: Game, player: Player) => SelectionPlan;
  /** 确认后将答案解码为可直接交给 useCard 的虚拟牌与目标 */
  resolve: (answers: SelectionAnswers) => { card: UsedCard; targets: Player[] };
  ai: {
    shouldUse: (game: Game, player: Player, shaUsed: boolean) => boolean;
    usePriority: number;
  };
}

/** 响应请求（响应窗口的输入） */
export interface ResponseRequest {
  type: 'play' | 'use';
  cardType: CardType;
  /** 使用型的目标（急救 / 桃的濒死角色） */
  target?: Player;
  /** 本次响应所针对的"生效"（如无懈抵消的那次 cardEffect）；随响应下传给使用者 */
  respondTo?: CardEffectEventData;
}

/** 单次响应结果：done 成功；retry 未成功可重新询问（如八卦阵判定失败） */
export type ResponseOutcome = 'done' | 'retry';

export type Effect =
  | TriggeredEffect
  | PersistentEffect
  | ActivatedEffect
  | ResponseEffect
  | ConversionEffect;

// ============================================================
// 技能 = 效果的命名集合 + 元数据
// ============================================================

/** 技能元数据（技能身份是 `Skill.name`；这里只放规则标签） */
export interface SkillMeta {
  /** 主公技：身份场开启（state.lord 已设）且自己不是主公时不发动 */
  lord?: boolean;
  /**
   * 锁定技抗性标签（Compulsory）：绑技能；供"令其他武将技能失效"类效果
   * 在失效判断**之前**检查抗性（消费者 = 后者出现时再接）。
   * 与 effect 级 `auto`（自动发动）/`forced`（强制发动）是三件不同的事。
   */
  compulsory?: boolean;
}

export interface Skill {
  name: string;
  /** 规则文本（纯数据；来自 docs 标包数据，未显式给出时按技能名自动填充） */
  info?: string;
  meta: SkillMeta;
  effects: Effect[];
}

// ============================================================
// 定义构造（纯函数：不注册、不查数据源）
// ============================================================

/** 技能定义的构造输入（`defineSkill` / `container.skills.define`） */
export interface SkillInput {
  name: string;
  /** 规则文本；省略时由容器按技能名从数据源回填（见 content/info.ts） */
  info?: string;
  meta?: SkillMeta;
  effects: Effect[];
}

/**
 * 定义一个技能（技能 = 元数据 + 效果集合）——**纯构造**：
 * 注册到容器（`container.skills.register`）时才做同名查重与规则文本回填。
 */
export function defineSkill(input: SkillInput): Skill {
  return {
    name: input.name,
    info: input.info,
    meta: { ...input.meta },
    effects: input.effects.map((e) => ({ ...e, skill: e.skill ?? input.name })),
  };
}

// ============================================================
// 局内技能实例（定义静态 + 局内实例，adr/0004）
// ============================================================

/**
 * 局内技能实例：定义层（`def`：效果集合 + 元数据）静态共享；
 * 局内状态挂在实例上（失效标记、将来的次数/临时数据）。
 */
export interface SkillInstance {
  /** 静态定义引用（内容模板，跨局共享） */
  readonly def: Skill;
  /** 局内失效标记（临时失去效果；施加/复原由"技能失效/复原"项提供） */
  disabled: boolean;
}

/** 查玩家的技能实例；没有则 undefined */
export function skillInstance(player: Player, name: string): SkillInstance | undefined {
  return player.skills.get(name);
}

/** 是否有该技能且未失效（规则/效果归属判定用） */
export function playerHasSkill(player: Player, name: string): boolean {
  const inst = player.skills.get(name);
  return !!inst && !inst.disabled;
}

/** 该技能是否处于失效状态 */
export function playerSkillDisabled(player: Player, name: string): boolean {
  const inst = player.skills.get(name);
  return !!inst && inst.disabled;
}

/**
 * 获得技能：按定义创建局内实例（已拥有则抛错，防内容重复获得）。
 * 定义由调用方给出（`player.hero.skills` 的解析在 createGame 里做）——
 * 本函数不查注册表，故不需要 game。
 */
export function gainSkill(player: Player, skill: Skill): SkillInstance {
  if (player.skills.has(skill.name)) {
    throw new Error(`gainSkill: ${player.name} already has skill "${skill.name}"`);
  }
  const inst: SkillInstance = { def: skill, disabled: false };
  player.skills.set(skill.name, inst);
  return inst;
}

/** 失去技能：销毁局内实例（效果归属随之失效；未拥有时为 no-op） */
export function loseSkill(player: Player, name: string): void {
  player.skills.delete(name);
}

// ============================================================
// 归属与门槛（触发/常驻/响应/转化/主动共用）
// ============================================================

/**
 * 效果是否归属于该玩家（**归属 = 唯一的效果生命周期开关**，每次查询重算）。
 * - 技能归属：查局内技能实例（存在且未失效）——获得/失去技能即时生效，无需注销 handler
 * - 装备归属：解析到该玩家装备区里**未失效的那条 UC**（读规则读 UC，adr/0003）
 *   ——装备进出 / 失效 / 复原同样即时生效，不需要 grant/revoke 同步
 * - 裸效果：恒真
 */
export function effectOwnedBy(game: Game, effect: EffectCommon, owner: Player): boolean {
  if (effect.skill) return playerHasSkill(owner, effect.skill);
  if (effect.equipType) return !!equippedUsedCard(game, owner, effect.equipType);
  return true;
}

/** 主公门槛：归属技能标了 lord 时，身份场开启且自己不是主公则不成立 */
export function effectLordGate(game: Game, owner: Player, effect: EffectCommon): boolean {
  const skill = effect.skill ? game.ruleSet.skills.get(effect.skill) : undefined;
  if (!skill?.meta.lord) return true;
  return !game.state.lord || owner === game.state.lord;
}
