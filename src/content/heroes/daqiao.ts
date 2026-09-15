// ============================================================
// 大乔 — 国色（方片牌当乐不思蜀）/ 流离
// ============================================================

import { discardCards } from '../../position/cardActions.js';
import { cardRegistry } from '../cardRegistry.js';
import {
  askFromAreas, askForTargets, computeTargetOptions, handCardsStep, selectedCards,
  selectedPlayers, targetsStep,
} from '../../decision/choose.js';
import { defineSkill } from '../../effects/effects.js';
import type { GameEvent } from '../../events/index.js';
import type { TargetingEventData } from '../../events/index.js';
import { distanceTo, attackRange } from '../../flow/distance.js';
import { heroRegistry } from '../heroRegistry.js';
import { CardType } from '../../types.js';
import type { Card, UsedCard } from '../../types.js';
import type { Game } from '../../game.js';
import type { Player } from '../../types.js';

/** 方片牌（国色的转化来源） */
function isDiamond(card: Card): boolean {
  return card.suit === '♦';
}

/** 流离：成为杀的目标时，弃一张牌，将杀转移给攻击范围内的一名其他角色（不能是使用者） */
const liuliContent = async (
  game: Game, event: GameEvent<any>, owner: Player,
): Promise<void> => {
  const targeting = event as GameEvent<TargetingEventData>;
  const { user } = targeting.data;

  // 弃置一张牌（手牌/装备区；askFromAreas 默认 AI：随机）
  const cost = await askFromAreas(game, owner, '流离：弃置一张牌', ['hand', 'equipment']);
  if (!cost) return;
  await discardCards(game, owner, [cost]);

  // 新目标：攻击范围内其他角色（不能是使用者，不能是自己；askForTargets 默认 AI：第一个）
  const candidates = game.state.players.filter(
    (p) => p.alive && p !== owner && p !== user
      && distanceTo(game.state.players, owner, p) <= attackRange(owner),
  );
  const targets = await askForTargets(game, owner, '流离：将杀转移给谁', candidates, 1);
  if (!targets) return;
  const newTarget = targets[0];

  // 转移：修改 targeting 事件的目标（useCard 循环读取修改后的 target）
  targeting.data.target = newTarget;
  console.log(
    `  ✨${owner.name} 发动【流离】！弃 1 张牌，将杀转移给 ${newTarget.name}`,
  );
};

/**
 * 国色的目标规则 = 【乐不思蜀】的目标规则（含陆逊·谦逊的免疫与"判定区同名 UC"限制）。
 * 目标规则只看效果牌身份，故用一条空实体组成的描述符计算即可。
 */
function lebuTargets(game: Game, player: Player): Player[] {
  return computeTargetOptions(
    game, { type: CardType.LeBu, name: '乐不思蜀', physicalCards: [] }, player,
  ).map((t) => t.player);
}

/** 国色的效果牌：单牌转化 → 花色与点数由引擎按实体牌推导（无需在此声明） */
function makeVirtualLeBu(sources: Card[]): UsedCard {
  return { type: CardType.LeBu, name: '乐不思蜀', physicalCards: sources };
}

/**
 * 国色：你可以将一张方片牌当做【乐不思蜀】使用。
 * 转化牌进判定区后就是一条 `type = 乐不思蜀` 的驻留 UC：花色点数继承方片牌，
 * 判定阶段、无懈窗口、被拆/被顺都按 UC 身份走（演进 3.5），引擎侧无需特判。
 * 注：部分版本有"出牌阶段限一次"，涉及技能使用次数机制，暂不实现（见 TODO 阶段 3 第 6 项）。
 */
defineSkill({
  name: '国色',
  effects: [{
    form: 'conversion',
    toType: CardType.LeBu,
    canUse: (game, player) => {
      const def = cardRegistry.get(CardType.LeBu)!;
      return player.hand.cards.some(isDiamond)
        && def.canUse(player, game.state.players, false)
        && lebuTargets(game, player).length > 0; // 有合法目标才可选（含同名 UC / 谦逊限制）
    },
    selectionPlan: (game, player) => ({
      nextStep(answers) {
        if (!answers.source) {
          return handCardsStep('source', player, {
            prompt: '国色：选择一张方片牌当乐不思蜀',
            filter: isDiamond,
            min: 1,
            max: 1,
          });
        }
        if (!answers.target) {
          const candidates = lebuTargets(game, player);
          return targetsStep('target', player, candidates, {
            prompt: '国色：选择乐不思蜀的目标',
            min: 1,
            max: 1,
          });
        }
        return null;
      },
    }),
    resolve: (answers) => ({
      card: makeVirtualLeBu(selectedCards(answers, 'source')),
      targets: selectedPlayers(answers, 'target'),
    }),
    ai: {
      shouldUse: () => true,
      usePriority: cardRegistry.get(CardType.LeBu)!.ai.usePriority,
    },
  }],
});

defineSkill({
  name: '流离',
  effects: [{
    form: 'triggered',
    timing: 'targeting.before',
    condition: (game, event, owner) => {
      const { user, card, target } = event.data as TargetingEventData;
      if (target !== owner) return false;          // 大乔成为杀的目标时
      if (card.type !== CardType.Sha) return false;
      // 需有牌可弃（手牌/装备区）
      if (owner.hand.cards.length === 0
        && !owner.equipment.weapon && !owner.equipment.armor
        && !owner.equipment.defensiveHorse && !owner.equipment.offensiveHorse) return false;
      // 需有合法转移目标（攻击范围内、非使用者、非自己）
      return game.state.players.some(
        (p) => p.alive && p !== owner && p !== user
          && distanceTo(game.state.players, owner, p) <= attackRange(owner),
      );
    },
    run: liuliContent,
  }],
});

heroRegistry.register({
  name: '大乔', maxHp: 3, sex: 'female', group: '吴', skills: ['国色', '流离'],
});
