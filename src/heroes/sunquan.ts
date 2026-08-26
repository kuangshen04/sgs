// ============================================================
// 孙权 — 制衡
// ============================================================

import { moveCards, drawCards } from '../cardActions.js';
import { cardsStep, selectedCards } from '../choose.js';
import { equipmentCards } from '../areas.js';
import { activeSkillRegistry } from '../skills.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

activeSkillRegistry.register({
  name: '制衡',
  canUse: (game, player, ctx) =>
    !ctx.usedSkills.has('制衡') && // 规则：每回合限一次
    (player.hand.length > 0 || equipmentCards(player).length > 0), // 需有可弃的牌
  selectionPlan: (game, player) => ({
    nextStep(answers) {
      if (!answers.cards) {
        const candidates = [...player.hand, ...equipmentCards(player)];
        return cardsStep('cards', candidates, {
          prompt: '制衡：选择要弃置的手牌',
          min: 0,
          max: candidates.length,
          ai: (ctx) => ctx.step.options, // 默认全选
        });
      }
      return null;
    },
  }),
  execute: async (game, player, answers) => {
    const cards = selectedCards(answers, 'cards');
    if (cards.length === 0) return;
    await moveCards(game, {
      to: { zone: 'discardPile' }, cards, reason: 'discard',
    });
    await drawCards(game, { target: player, count: cards.length });
    console.log(
      `  ✨${player.name} 发动【制衡】！弃置 ${cards.length} 张牌，摸了 ${cards.length} 张牌`,
    );
  },
  ai: {
    // AI：本轮选不出想出的牌时才换牌
    shouldUse: (_game, _player, ctx) => !ctx.hasCardOption,
    priority: 0,
  },
});

heroRegistry.register({ name: '孙权', maxHp: 4, sex: 'male', group: '吴', skills: ['制衡'] });
