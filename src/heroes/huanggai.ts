// ============================================================
// 黄盖 — 苦肉（出牌阶段，你可以失去 1 点体力，然后摸两张牌；不限次数）
// ============================================================

import { drawCards } from '../cardActions.js';
import { loseHp } from '../life.js';
import { activeSkillRegistry } from '../skills.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

activeSkillRegistry.register({
  name: '苦肉',
  // 规则：需有体力可失去（不限次数，不加 usedSkills 限制）
  canUse: (game, player, ctx) => player.hp >= 1,
  selectionPlan: () => ({
    nextStep: () => null,
    result: (answers) => ({ answers }),
  }),
  execute: async (game, player) => {
    await loseHp(game, player, 1);
    await drawCards(game, { target: player, count: 2 });
    console.log(`  ✨${player.name} 发动【苦肉】！失去 1 点体力，摸了 2 张牌`);
  },
  ai: {
    // AI：避免把自己打到濒死
    shouldUse: (game, player) => player.hp > 1,
    priority: 0,
  },
});

heroRegistry.register({ name: '黄盖', maxHp: 4, sex: 'male', group: '吴', skills: ['苦肉'] });
