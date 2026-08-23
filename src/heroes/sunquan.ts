// ============================================================
// 孙权 — 制衡
// ============================================================

import { discardCards, drawCards } from '../cardActions.js';
import { handCardsStep, selectedCards } from '../choose.js';
import { activeSkillRegistry } from '../skills.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

activeSkillRegistry.register({
  name: '制衡',
  canUse: (game, player, ctx) =>
    !ctx.usedSkills.has('制衡') && // 规则：每回合限一次
    player.hand.length > 0,        // 规则：简化模型需有牌可弃
  selectionPlan: (game, player) => ({
    nextStep(answers) {
      if (!answers.cards) {
        return handCardsStep('cards', player, {
          prompt: '制衡：选择要弃置的手牌',
          min: 0,
          max: player.hand.length,
          ai: (ctx) => ctx.step.options, // 默认全选（保留旧行为）
        });
      }
      return null;
    },
  }),
  execute: async (game, player, answers) => {
    const cards = selectedCards(answers, 'cards');
    if (cards.length === 0) return;
    await discardCards(game, player, cards);
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
