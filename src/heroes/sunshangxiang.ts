// ============================================================
// 孙尚香 — 结姻
// 枭姬（失去装备区内的牌后摸两张）待"失去牌触发"系统，暂未实现。
// ============================================================

import { discardCards } from '../cardActions.js';
import { recover } from '../life.js';
import { activeSkillRegistry } from '../skills.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

/** 结姻：出牌阶段限一次，弃置两张手牌，选择一名已受伤的男性角色，你与其各回复 1 点体力 */
const jieyinContent = async (game: Game, player: Player): Promise<void> => {
  // TODO(玩家选择): 结姻选择谁——目前写死为"第一个已受伤的男性角色"
  const target = game.state.players.find(
    (p) => p.alive && p !== player && p.hero.sex === 'male' && p.hp < p.maxHp,
  );
  if (!target) return;

  // TODO(玩家选择): 弃置哪两张手牌——目前写死为前两张（简化）
  discardCards(game, player, [...player.hand].slice(0, 2));
  await recover(game, { target: player, amount: 1 });
  await recover(game, { target, amount: 1 });
  console.log(
    `  ✨${player.name} 发动【结姻】！弃置两张手牌，` +
    `自己与 ${target.name} 各回复 1 点体力`,
  );
};

activeSkillRegistry.register({
  name: '结姻',
  // 规则：每回合限一次，需弃两张手牌，且存在已受伤的男性角色
  canUse: (game, player, ctx) =>
    !ctx.usedSkills.has('结姻') &&
    player.hand.length >= 2 &&
    game.state.players.some(
      (p) => p.alive && p !== player && p.hero.sex === 'male' && p.hp < p.maxHp,
    ),
  content: jieyinContent,
  ai: {
    // AI：自己受伤且有余牌时才发动（保守：至少自己回 1 血）
    shouldUse: (game, player) => player.hp < player.maxHp && player.hand.length >= 2,
    priority: 0,
  },
});

heroRegistry.register({
  name: '孙尚香', maxHp: 3, sex: 'female', group: '吴', skills: ['结姻'],
});
