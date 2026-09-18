// ============================================================
// 貂蝉 — 离间 / 闭月
// ============================================================

import { CardType } from '../../types.js';
import type { Card, Player } from '../../types.js';
import { discardCards } from '../../position/cardActions.js';
import { equipmentCards } from '../../position/areas.js';
import { effectRegistry } from '../../effects/persistentEffects.js';
import { cardRegistry } from '../cardRegistry.js';
import {
  cardsStep, selectedCards, selectedPlayers, targetsStep,
} from '../../decision/choose.js';
import { drawCards } from '../../position/cardActions.js';
import { subjectIsOwner } from '../../effects/skills.js';
import { defineSkill } from '../../effects/effects.js';
import type { ActivatedEffect } from '../../effects/effects.js';
import { useVirtualCard } from '../../flow/useCard.js';
import type { GameEvent } from '../../events/index.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../../game.js';

// ============================================================
// 离间（0 牌转化 + 视为他人使用 + 不可被无懈 + 出牌阶段限一次）
// ============================================================

/** 可弃置的牌：手牌 + 装备区（"弃置一张牌"） */
function discardable(player: Player): Card[] {
  return [...player.hand.cards, ...equipmentCards(player)];
}

/** 存活的其他男性角色（离间的两名候选都必须是男性） */
function maleOthers(game: Game, player: Player): Player[] {
  return game.state.players.filter(
    (p) => p.alive && p !== player && p.hero.sex === 'male',
  );
}

/** 决斗者 A 能对谁使用决斗（复用【决斗】的目标规则：排除空城等免疫） */
function duelTargetsOf(game: Game, duelist: Player): Player[] {
  const def = cardRegistry.get(CardType.JueDou)!;
  return def.targetFilter(game, duelist, game.state.players);
}

/** 是否存在"一名男性对另一名男性使用决斗"的合法组合 */
function hasLijianPair(game: Game, player: Player): boolean {
  const males = maleOthers(game, player);
  return males.some((a) =>
    duelTargetsOf(game, a).some((b) => b !== a && b.hero.sex === 'male' && b !== player),
  );
}

/**
 * 离间：出牌阶段限一次。弃置一张牌，视为一名男性角色对另一名男性角色使用一张【决斗】。
 * - **0 牌转化**：决斗 UC 没有实体牌（弃置的牌只是 cost，不进处理区当决斗的实体牌）；
 * - **视为他人使用**：`useCard` 的 player = 被指定的男性角色 A（伤害来源、技能归属都随 A）；
 * - **不可被无懈可击响应**：`unoffsetable`（事件级，演进 3.6 U2）；
 * - **限一次**：`ctx.usedSkills`（playPhase 记名，越过则不可用）。
 */
const lijianEffect: ActivatedEffect = {
  form: 'activated',
  canUse: (game, player, ctx) =>
    !ctx.usedSkills.has('离间')
    && discardable(player).length > 0
    && hasLijianPair(game, player),
  selectionPlan: (game, player) => ({
    nextStep(answers) {
      if (!answers.cost) {
        return cardsStep('cost', discardable(player), {
          prompt: '离间：弃置一张牌',
          min: 1,
          max: 1,
        });
      }
      const males = maleOthers(game, player);
      if (!answers.duelist) {
        return targetsStep('duelist', player, males, {
          prompt: '离间：选择使用【决斗】的男性角色',
          min: 1,
          max: 1,
        });
      }
      if (!answers.target) {
        const duelist = selectedPlayers(answers, 'duelist')[0];
        const candidates = duelTargetsOf(game, duelist).filter(
          (b) => b.hero.sex === 'male' && b !== player,
        );
        return targetsStep('target', player, candidates, {
          prompt: `离间：选择 ${duelist.name} 的决斗目标`,
          min: 1,
          max: 1,
        });
      }
      return null;
    },
  }),
  execute: async (game, player, answers) => {
    const cost = selectedCards(answers, 'cost')[0];
    const duelist = selectedPlayers(answers, 'duelist')[0];
    const target = selectedPlayers(answers, 'target')[0];
    if (!cost || !duelist || !target) return;

    await discardCards(game, player, [cost]);
    const used = await useVirtualCard(game, {
      player: duelist,
      card: { type: CardType.JueDou, name: '决斗', physicalCards: [] }, // 0 牌转化
      targets: [target],
      unoffsetable: true,
    });
    if (!used) return;
    console.log(
      `  ✨${player.name} 发动【离间】！弃置一张牌，视为 ${duelist.name} 对 ${target.name} 使用决斗`,
    );
  },
  ai: {
    // AI 决策点（真人/前端接入时在此注入）：默认与【决斗】同优先级、有牌可弃即愿意发动
    shouldUse: (game, player) => hasLijianPair(game, player),
    priority: cardRegistry.get(CardType.JueDou)!.ai.usePriority,
  },
};

defineSkill({ name: '离间', effects: [lijianEffect] });

// ============================================================
// 闭月
// ============================================================

/** 闭月：结束阶段摸一张牌 */
const biyueContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const before = owner.hand.cards.length;
  await drawCards(game, { target: owner, count: 1 });
  console.log(
    `  ✨${owner.name} 发动【闭月】！回合结束摸了 1 张牌` +
    `（${before} → ${owner.hand.cards.length}）`,
  );
};

defineSkill({
  name: '闭月',
  effects: [{
    form: 'triggered',
    timing: 'endPhase.before',
    condition: subjectIsOwner,
    run: biyueContent,
  }],
});

heroRegistry.register({
  name: '貂蝉', maxHp: 3, sex: 'female', group: '群', skills: ['离间', '闭月'],
});
