// ============================================================
// 规则集（RuleSet）与容器（Container）— 定义层的装配点与查询面
//
// 两层分开（这是本模块存在的全部理由）：
//   - **容器** = 装配期入口（register / useInfo / addSetupHook）：谁造谁释放。
//     生命周期与 game **无关**——一套内容服务很多局（`docs/代码结构.md` 约定一）；
//     测试可以每个用例造一个只装了它需要的卡牌的容器，跑完即弃。
//   - **规则集** = 运行期窄接口（只读查询）：交给 `createGame` 后由 `game.ruleSet` 引用。
//     game 只持引用，不构造、不释放，也不提供"按名字查服务"的动态查找。
//
// 当前取舍（DI 落地后预计调整）：`game` 持有规则集引用。将来做完整 DI 时，
// 服务（decision / rng / victory）同样在装配期解析后交给 game，而不是让 game 持容器。
//
// 内容的注册一律走**显式装配**（`content/standardPack.ts` 的 installXxxPack），
// 不再有 import 副作用——"这局装了哪些内容"必须是可见的事实。
// ============================================================

import type { CardType, HeroDef } from '../types.js';
import type { CardDef } from './cardDef.js';
import { defineSkill } from '../effects/effects.js';
import type {
  ActivatedEffect,
  ConversionEffect,
  Effect,
  PersistentEffect,
  ResponseEffect,
  Skill,
  SkillInput,
  TriggeredEffect,
} from '../effects/effects.js';
import type { Game } from '../game.js';

// ============================================================
// 三个定义索引（只读查询面）
// ============================================================

export interface CardDefIndex {
  get(type: CardType): CardDef | undefined;
  /** 遍历所有已注册的 CardDef */
  all(): IterableIterator<CardDef>;
}

/**
 * 技能定义索引 + **效果查询面**（定义层的查询属于规则书本身）。
 * 裸效果（装备效果、无懈响应窗口等）与技能效果在同一份效果集合里查询：
 * 顺序 = 技能效果（按技能定义序）→ 裸效果（按注册序）。
 */
export interface SkillDefIndex {
  get(name: string): Skill | undefined;
  all(): IterableIterator<Skill>;
  /** 全部效果（技能效果在前、裸效果在后） */
  effects(): Effect[];
  /** 某时点的触发型效果（技能来源在前、装备来源在后、裸效果最后；保持各自注册序） */
  triggeredAt(timing: string): TriggeredEffect[];
  /** 全部触发型时点（installEffects 用） */
  timings(): string[];
  /** 某键的全部常驻效果 */
  persistentOf(key: string): PersistentEffect[];
  /** 所有响应型效果（respondsTo 过滤由调用方或本函数参数完成） */
  responsesFor(cardType?: CardType): ResponseEffect[];
  /** 全部转化型效果 */
  conversions(): ConversionEffect[];
  /** 全部主动型效果 */
  activated(): ActivatedEffect[];
}

export interface HeroDefIndex {
  get(name: string): HeroDef | undefined;
  /** 遍历所有已注册的 HeroDef */
  all(): IterableIterator<HeroDef>;
}

// ============================================================
// 规则集与容器
// ============================================================

/**
 * 内容提供的"开局钩子"：引擎在建局时装上（content → 引擎，方向不倒置）。
 * 首个用例 = 无懈可击的响应窗口（卡牌级全局触发器）。
 */
export type SetupHook = (game: Game) => void;

/** 运行期窄接口：引擎只读（`game.ruleSet`），注册面留在 Container */
export interface RuleSet {
  cards: CardDefIndex;
  skills: SkillDefIndex;
  heroes: HeroDefIndex;
  setupHooks: readonly SetupHook[];
}

/** 规则文本（info）数据源：内容包在装配时提供（见 content/info.ts） */
export interface InfoSource {
  skillInfo?: (name: string) => string | undefined;
  cardInfo?: (name: string) => string | undefined;
}

/** 装配期入口：规则集 + 注册面（谁造谁释放） */
export interface Container extends RuleSet {
  cards: CardDefIndex & { register(def: CardDef): void };
  skills: SkillDefIndex & {
    /** 注册技能（同名重复定义即抛错，防缝合式重复注册） */
    register(skill: Skill): void;
    /** 构造 + 注册（内容文件里的常用写法：`c.skills.define({ name, effects })`） */
    define(input: SkillInput): Skill;
    /** 注册裸效果（不归属任何技能：装备卡效果、卡牌级响应窗口等） */
    registerBareEffect(effect: Effect): void;
  };
  heroes: HeroDefIndex & { register(def: HeroDef): void };
  /** 设置规则文本数据源（装配期一次；之后 register 时按名字回填 info） */
  useInfo(src: InfoSource): void;
  /** 注册开局钩子 */
  addSetupHook(hook: SetupHook): void;
}

/** 造一个空容器（内容由装配函数装进来：见 content/standardPack.ts） */
export function createContainer(): Container {
  const cardDefs = new Map<CardType, CardDef>();
  const skillDefs = new Map<string, Skill>();
  const bareEffects: Effect[] = [];
  const heroDefs = new Map<string, HeroDef>();
  const setupHooks: SetupHook[] = [];
  let info: InfoSource | undefined;

  /** 全部效果：技能效果（按技能定义序）在前，裸效果（按注册序）在后 */
  const allEffects = (): Effect[] => {
    const out: Effect[] = [];
    for (const skill of skillDefs.values()) out.push(...skill.effects);
    out.push(...bareEffects);
    return out;
  };

  const skills: SkillDefIndex = {
    get: (name) => skillDefs.get(name),
    all: () => skillDefs.values(),
    effects: allEffects,
    triggeredAt(timing) {
      const fromSkills: TriggeredEffect[] = [];
      const fromEquips: TriggeredEffect[] = [];
      const bare: TriggeredEffect[] = [];
      for (const e of allEffects()) {
        if (e.form !== 'triggered' || e.timing !== timing) continue;
        if (e.skill) fromSkills.push(e);
        else if (e.equipType) fromEquips.push(e);
        else bare.push(e);
      }
      return [...fromSkills, ...fromEquips, ...bare];
    },
    timings() {
      const timings: string[] = [];
      for (const e of allEffects()) {
        if (e.form === 'triggered' && !timings.includes(e.timing)) timings.push(e.timing);
      }
      return timings;
    },
    persistentOf: (key) =>
      allEffects().filter((e): e is PersistentEffect => e.form === 'persistent' && e.key === key),
    responsesFor: (cardType) =>
      allEffects().filter(
        (e): e is ResponseEffect =>
          e.form === 'response' && (cardType === undefined || e.respondsTo === cardType),
      ),
    conversions: () => allEffects().filter((e): e is ConversionEffect => e.form === 'conversion'),
    activated: () => allEffects().filter((e): e is ActivatedEffect => e.form === 'activated'),
  };

  const registerSkill = (skill: Skill): void => {
    if (skillDefs.has(skill.name)) {
      throw new Error(`Skill "${skill.name}" is already defined`);
    }
    skillDefs.set(skill.name, {
      ...skill,
      info: skill.info ?? info?.skillInfo?.(skill.name),
    });
  };

  return {
    cards: {
      get: (type) => cardDefs.get(type),
      all: () => cardDefs.values(),
      register(def) {
        // 规则文本：未显式给出时按卡牌名从数据源取（见 content/info.ts）
        cardDefs.set(def.type, { ...def, info: def.info ?? info?.cardInfo?.(def.name) });
      },
    },
    skills: {
      ...skills,
      register: registerSkill,
      define(input) {
        const skill = defineSkill(input);
        registerSkill(skill);
        return skill;
      },
      registerBareEffect(effect) {
        bareEffects.push(effect);
      },
    },
    heroes: {
      get: (name) => heroDefs.get(name),
      all: () => heroDefs.values(),
      register(def) {
        heroDefs.set(def.name, def);
      },
    },
    setupHooks,
    useInfo(src) {
      info = src;
    },
    addSetupHook(hook) {
      setupHooks.push(hook);
    },
  };
}
