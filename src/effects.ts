// ============================================================
// 效果（Effect）— 一等公民；技能 = 效果的命名集合 + 元数据
//
// 演进 9.2：效果 = 时点 + 条件 + 行为；技能是包装器（元数据 + 效果集合）；
// 裸效果是真实需求（常驻 kind 词汇、装备效果、临时效果、未来模式效果）。
//
// 本模块只有"注册面 + 查询面"，不含分发（分发在 skills.ts 的 installEffects）
// 与窗口接线（响应/转化由 responses.ts / playChoices.ts 查询）。
// 五种形态保留各自调用协议，但共享同一份"归属"信息（skill / equipType）。
// ============================================================

import { CardTag, CardType } from './types.js';
import type { Player, UsedCard } from './types.js';
import type { Game } from './game.js';
import type { GameEvent } from './events/index.js';
import { cardRegistry } from './cardRegistry.js';
import type { SelectionAnswers, SelectionPlan } from './selection.js';

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

export interface SkillMeta {
  name: string;
  /** 规则文本（来自 docs 导出数据；纯数据字段） */
  info?: string;
  /** 主公技：身份场开启（state.lord 已设）且自己不是主公时不发动 */
  lord?: boolean;
  /**
   * 锁定技抗性标签（Compulsory）：绑技能；供"令其他武将技能失效"类效果
   * 在失效判断**之前**检查抗性（消费者 = 阶段 3 第 3 项"技能失效/复原"）。
   * 与 effect 级 `auto`（自动发动）/`forced`（强制发动）是三件不同的事。
   */
  compulsory?: boolean;
}

export interface Skill {
  name: string;
  meta: SkillMeta;
  effects: Effect[];
}

// ============================================================
// 注册面（唯一入口）
// ============================================================

const _skills = new Map<string, Skill>();
const _bareEffects: Effect[] = [];

/** 定义一个技能（技能 = 元数据 + 效果集合）；同名重复定义即抛错（防缝合式重复注册） */
export function defineSkill(input: {
  name: string;
  meta?: Omit<SkillMeta, 'name'>;
  effects: Effect[];
}): Skill {
  if (_skills.has(input.name)) {
    throw new Error(`Skill "${input.name}" is already defined`);
  }
  const skill: Skill = {
    name: input.name,
    meta: { name: input.name, ...input.meta },
    effects: input.effects.map((e) => ({ ...e, skill: e.skill ?? input.name })),
  };
  _skills.set(skill.name, skill);
  return skill;
}

/** 注册裸效果（不归属任何技能：装备卡效果、未来模式/全局效果） */
export function registerBareEffect(effect: Effect): void {
  _bareEffects.push(effect);
}

// ============================================================
// 查询面
// ============================================================

export const skillRegistry = {
  get(name: string): Skill | undefined {
    return _skills.get(name);
  },
  all(): IterableIterator<Skill> {
    return _skills.values();
  },
};

/** 全部效果（技能效果按技能定义序，随后裸效果） */
export function allEffects(): Effect[] {
  const out: Effect[] = [];
  for (const skill of _skills.values()) out.push(...skill.effects);
  out.push(..._bareEffects);
  return out;
}

/** 某时点的触发型效果（技能来源在前、装备来源在后、裸效果最后；保持各自注册序） */
export function triggeredEffectsAt(timing: string): TriggeredEffect[] {
  const skills: TriggeredEffect[] = [];
  const equips: TriggeredEffect[] = [];
  const bare: TriggeredEffect[] = [];
  for (const e of allEffects()) {
    if (e.form !== 'triggered' || e.timing !== timing) continue;
    if (e.skill) skills.push(e);
    else if (e.equipType) equips.push(e);
    else bare.push(e);
  }
  return [...skills, ...equips, ...bare];
}

/** 全部触发型时点（installEffects 用） */
export function triggeredTimings(): string[] {
  const timings: string[] = [];
  for (const e of allEffects()) {
    if (e.form === 'triggered' && !timings.includes(e.timing)) timings.push(e.timing);
  }
  return timings;
}

/** 某键的全部常驻效果 */
export function persistentEffectsOf(key: string): PersistentEffect[] {
  return allEffects().filter((e): e is PersistentEffect => e.form === 'persistent' && e.key === key);
}

/** 所有响应型效果（respondsTo 过滤由调用方或本函数参数完成） */
export function responseEffectsFor(cardType?: CardType): ResponseEffect[] {
  return allEffects().filter(
    (e): e is ResponseEffect => e.form === 'response' && (cardType === undefined || e.respondsTo === cardType),
  );
}

/** 全部转化型效果 */
export function conversionEffects(): ConversionEffect[] {
  return allEffects().filter((e): e is ConversionEffect => e.form === 'conversion');
}

/** 全部主动型效果 */
export function activatedEffects(): ActivatedEffect[] {
  return allEffects().filter((e): e is ActivatedEffect => e.form === 'activated');
}

// ============================================================
// 局内技能实例（定义静态 + 局内实例，演进 9.2）
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

/** 获得技能：创建局内实例（未定义的技能名抛错；已拥有则抛错，防内容重复获得） */
export function gainSkill(player: Player, name: string): SkillInstance {
  const def = _skills.get(name);
  if (!def) throw new Error(`gainSkill: skill "${name}" is not defined`);
  if (player.skills.has(name)) throw new Error(`gainSkill: ${player.name} already has skill "${name}"`);
  const inst: SkillInstance = { def, disabled: false };
  player.skills.set(name, inst);
  return inst;
}

/** 失去技能：销毁局内实例（效果归属随之失效；未拥有时为 no-op） */
export function loseSkill(player: Player, name: string): void {
  player.skills.delete(name);
}

// ============================================================
// 归属与门槛（触发/常驻/响应/转化/主动共用）
// ============================================================

/** 玩家装备区是否装备了指定类型的牌 */
export function hasEquipped(player: Player, cardType: CardType): boolean {
  const eq = player.equipment;
  if (eq.weapon?.type === cardType) return true;
  if (eq.armor?.type === cardType) return true;
  if (eq.defensiveHorse?.type === cardType) return true;
  if (eq.offensiveHorse?.type === cardType) return true;
  return false;
}

/**
 * 效果是否归属于该玩家。
 * - 技能归属：查局内技能实例（存在且未失效）——获得/失去技能即时生效，无需注销 handler
 * - 装备归属：装备槽中含此类型牌
 * - 裸效果：恒真
 */
export function effectOwnedBy(effect: EffectCommon, owner: Player): boolean {
  if (effect.skill) return playerHasSkill(owner, effect.skill);
  if (effect.equipType) return hasEquipped(owner, effect.equipType);
  return true;
}

/** 主公门槛：归属技能标了 lord 时，身份场开启且自己不是主公则不成立 */
export function effectLordGate(game: Game, owner: Player, effect: EffectCommon): boolean {
  const skill = effect.skill ? _skills.get(effect.skill) : undefined;
  if (!skill?.meta.lord) return true;
  return !game.state.lord || owner === game.state.lord;
}

/** 装备牌类型 → 装备 tag（注册装备来源效果时用；供内容层书写便捷） */
export function isEquipTag(tag: CardTag): boolean {
  return tag === CardTag.Equip;
}

/** 便捷：卡牌定义是否存在（内容层注册装备效果前的守卫） */
export function cardDefExists(type: CardType): boolean {
  return !!cardRegistry.get(type);
}
