// ============================================================
// 三国杀最小原型 — 技能注册
// 通过 skillRegistry.register() 向引擎注册每种技能。
// 加新技能只需：此处加一个 register 调用。
// 武将-技能绑定在数据层（Hero.skills 引用技能名）。
// ============================================================

import type { Game } from './game.js';
import { drawCards } from './game.js';
import type { GameEvent } from './events/index.js';
import { triggerSystem } from './events/index.js';
import type { DamageEventData, PhaseEventData, TurnEventData } from './events/index.js';
import type { Player } from './types.js';

// ============================================================
// 技能定义 & 注册表
// ============================================================

export interface SkillDef {
  name: string;
  /** 触发时点，如 'damage.after'（事件类型 + before/after 阶段） */
  trigger: string;
  content: (game: Game, event: GameEvent<any>) => Promise<void>;
}

const _skills = new Map<string, SkillDef>();

export const skillRegistry = {
  register(def: SkillDef): void {
    _skills.set(def.name, def);
  },
  get(name: string): SkillDef | undefined {
    return _skills.get(name);
  },
  /** 遍历所有已注册的 SkillDef */
  all(): IterableIterator<SkillDef> {
    return _skills.values();
  },
};

// ============================================================
// 分发
// ============================================================

/** 从事件数据推断技能拥有者：优先 target，其次 player */
function eventOwner(event: GameEvent<any>): Player | undefined {
  const data = event.data as { target?: Player; player?: Player };
  return data.target ?? data.player;
}

/**
 * 把 skillRegistry 中所有技能挂到 triggerSystem（按 trigger 分发）。
 * 每个进程调用一次；重复调用会重复注册 handler。
 */
export function registerSkills(): void {
  for (const skill of skillRegistry.all()) {
    triggerSystem.on(skill.trigger, async (event) => {
      const owner = eventOwner(event);
      if (!owner?.hero.skills?.includes(skill.name)) return;
      await skill.content(event.game, event);
    });
  }
}

// ============================================================
// 技能效果
// ============================================================

/** 遗计：受到伤害后，每 1 点伤害摸 2 张牌 */
const yijiContent = async (game: Game, event: GameEvent<any>): Promise<void> => {
  const { target, amount } = event.data as DamageEventData;
  const before = target.hand.length;
  await drawCards(game, { target, count: amount * 2 });
  console.log(
    `  ✨${target.name} 发动【遗计】！受到 ${amount} 点伤害，摸了 ${amount * 2} 张牌` +
    `（${before} → ${target.hand.length}）`,
  );
};

/** 英姿：摸牌阶段多摸一张牌 */
const yingziContent = async (game: Game, event: GameEvent<any>): Promise<void> => {
  const { player } = event.data as PhaseEventData;
  const before = player.hand.length;
  await drawCards(game, { target: player, count: 1 });
  console.log(
    `  ✨${player.name} 发动【英姿】！摸牌阶段多摸了 1 张牌` +
    `（${before} → ${player.hand.length}）`,
  );
};

/** 闭月：结束阶段摸一张牌（暂挂在 turn.after，正式结束阶段尚未建模） */
const biyueContent = async (game: Game, event: GameEvent<any>): Promise<void> => {
  const { player } = event.data as TurnEventData;
  const before = player.hand.length;
  await drawCards(game, { target: player, count: 1 });
  console.log(
    `  ✨${player.name} 发动【闭月】！回合结束摸了 1 张牌` +
    `（${before} → ${player.hand.length}）`,
  );
};

// ============================================================
// 注册
// ============================================================

skillRegistry.register({
  name: '遗计',
  trigger: 'damage.after',
  content: yijiContent,
});

skillRegistry.register({
  name: '英姿',
  trigger: 'drawPhase.before',
  content: yingziContent,
});

skillRegistry.register({
  name: '闭月',
  trigger: 'turn.after',
  content: biyueContent,
});
