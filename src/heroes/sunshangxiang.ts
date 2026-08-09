// ============================================================
// 孙尚香 — 结姻 / 枭姬
// ============================================================

import { discardCards, drawCards } from '../cardActions.js';
import { recover } from '../life.js';
import { askForTargets, askFromAreas } from '../choose.js';
import { activeSkillRegistry, skillRegistry } from '../skills.js';
import { heroRegistry } from '../heroRegistry.js';
import type { CardMoveEventData, GameEvent } from '../events/index.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

/** 结姻：出牌阶段限一次，弃置两张手牌，选择一名已受伤的男性角色，你与其各回复 1 点体力 */
const jieyinContent = async (game: Game, player: Player): Promise<void> => {
  // askForTargets：结姻选择谁（默认 AI：第一个已受伤的男性角色）
  const candidates = game.state.players.filter(
    (p) => p.alive && p !== player && p.hero.sex === 'male' && p.hp < p.maxHp,
  );
  const targets = askForTargets(game, player, '结姻：选择谁', candidates, 1);
  if (!targets) return;
  const target = targets[0];

  // askFromAreas：弃置哪两张手牌（默认 AI：逐张随机）
  for (let i = 0; i < 2; i++) {
    const card = askFromAreas(game, player, '结姻：弃置一张手牌', ['hand']);
    if (!card) break;
    await discardCards(game, player, [card]);
  }
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

/** 枭姬：当你失去装备区内的牌后，每失去一张摸两张牌 */
const xiaojiContent = async (
  game: Game, event: GameEvent<any>, owner: Player,
): Promise<void> => {
  const { fromAreas } = event.data as CardMoveEventData;
  const lost = fromAreas.filter(
    (a) => 'player' in a && a.player === owner && a.zone === 'equipment',
  ).length;
  if (lost === 0) return;
  await drawCards(game, { target: owner, count: lost * 2 });
  console.log(`  ✨${owner.name} 发动【枭姬】！失去 ${lost} 张装备区内的牌，摸了 ${lost * 2} 张牌`);
};

skillRegistry.register({
  name: '枭姬',
  trigger: 'cardMove.after',
  canTrigger: (_game, event, owner) => {
    const { fromAreas } = event.data as CardMoveEventData;
    return fromAreas.some(
      (a) => 'player' in a && a.player === owner && a.zone === 'equipment',
    );
  },
  content: xiaojiContent,
});

heroRegistry.register({
  name: '孙尚香', maxHp: 3, sex: 'female', group: '吴', skills: ['结姻', '枭姬'],
});
