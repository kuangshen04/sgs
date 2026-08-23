// ============================================================
// 大乔 — 流离
// ============================================================

import { discardCards } from '../cardActions.js';
import { askFromAreas, askForTargets } from '../choose.js';
import { skillRegistry } from '../skills.js';
import type { GameEvent } from '../events/index.js';
import type { TargetingEventData } from '../events/index.js';
import { distanceTo, attackRange } from '../distance.js';
import { heroRegistry } from '../heroRegistry.js';
import { CardType } from '../types.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

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

skillRegistry.register({
  name: '流离',
  trigger: 'targeting.before',
  canTrigger: (game, event, owner) => {
    const { user, card, target } = event.data as TargetingEventData;
    if (target !== owner) return false;          // 大乔成为杀的目标时
    if (card.type !== CardType.Sha) return false;
    // 需有牌可弃（手牌/装备区）
    if (owner.hand.length === 0
      && !owner.equipment.weapon && !owner.equipment.armor
      && !owner.equipment.defensiveHorse && !owner.equipment.offensiveHorse) return false;
    // 需有合法转移目标（攻击范围内、非使用者、非自己）
    return game.state.players.some(
      (p) => p.alive && p !== owner && p !== user
        && distanceTo(game.state.players, owner, p) <= attackRange(owner),
    );
  },
  content: liuliContent,
});

heroRegistry.register({ name: '大乔', maxHp: 3, sex: 'female', group: '吴', skills: ['流离'] });
