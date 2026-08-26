// ============================================================
// 华佗 — 青囊
// ============================================================

import { discardCards, useCard } from '../cardActions.js';
import { recover } from '../life.js';
import { handCardsStep, targetsStep, selectedCards, selectedPlayers } from '../choose.js';
import { activeSkillRegistry } from '../skills.js';
import { responseRuleRegistry } from '../responses.js';
import { heroRegistry } from '../heroRegistry.js';
import { CardType } from '../types.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';
import type { UsedCard } from '../types.js';

activeSkillRegistry.register({
  name: '青囊',
  canUse: (game, player, ctx) =>
    !ctx.usedSkills.has('青囊') &&                              // 每回合限一次
    player.hand.length >= 1 &&                                  // 需弃 1 张手牌
    game.state.players.some((p) => p.alive && p.hp < p.maxHp),  // 需有受伤角色
  selectionPlan: (game, player) => ({
    nextStep(answers) {
      if (!answers.target) {
        // 原版：任意受伤角色；AI 默认优先自己
        const candidates = game.state.players.filter((p) => p.alive && p.hp < p.maxHp);
        return targetsStep('target', player, candidates, {
          prompt: '青囊：选择回复的受伤角色',
          min: 1,
          max: 1,
        });
      }
      if (!answers.card) {
        return handCardsStep('card', player, {
          prompt: '青囊：选择弃置的手牌',
          min: 1,
          max: 1,
        });
      }
      return null;
    },
  }),
  execute: async (game, player, answers) => {
    const cards = selectedCards(answers, 'card');
    const [target] = selectedPlayers(answers, 'target');
    if (!target || cards.length === 0) return;
    await discardCards(game, player, cards);
    await recover(game, { target, amount: 1 });
    console.log(`  ✨${player.name} 发动【青囊】！弃置 ${cards.length} 张手牌，回复 1 点体力`);
  },
  ai: {
    // AI：只给自己回血
    shouldUse: (game, player) => player.hp < player.maxHp,
    priority: 0,
  },
});

/** 急救：回合外，可以将一张红色牌当桃使用（救人） */
responseRuleRegistry.register({
  name: '急救',
  respondsTo: CardType.Tao,
  ownerSkill: '急救',
  canUse: (game, player, request) =>
    request.type === 'use'
    && !!request.target
    && game.state.players[game.state.currentIndex] !== player // 回合外
    && player.hand.some((c) => c.suit === '♥' || c.suit === '♦'),
  selectionPlan: (_game, player) => ({
    nextStep(answers) {
      if (answers.source) return null;
      return handCardsStep('source', player, {
        prompt: '急救：选择一张红色牌当桃',
        filter: (c) => c.suit === '♥' || c.suit === '♦',
        min: 1,
        max: 1,
      });
    },
  }),
  resolve: async (game, player, request, answers) => {
    const source = selectedCards(answers, 'source')[0];
    if (!source || !request.target) return 'done';
    const used: UsedCard = {
      type: CardType.Tao,
      name: '桃',
      suit: source.suit,
      number: source.number,
      physicalCards: [source],
    };
    await useCard(game, { player, card: used, targets: [request.target] });
    return 'done';
  },
  ai: {
    shouldUse: () => true,
    priority: 50,
  },
});

heroRegistry.register({ name: '华佗', maxHp: 3, sex: 'male', group: '群', skills: ['青囊', '急救'] });
