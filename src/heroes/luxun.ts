// ============================================================
// 陆逊 — 谦逊（锁定技） / 连营
// ============================================================

import { drawCards } from '../cardActions.js';
import { effectRegistry } from '../persistentEffects.js';
import { skillRegistry } from '../skills.js';
import { heroRegistry } from '../heroRegistry.js';
import type { GameEvent } from '../events/index.js';
import type { CardMoveEventData } from '../events/index.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

// 锁定技：targetFilter 时排除目标（不是 targeting 时取消）
effectRegistry.register({
  kind: 'immuneShunShou',
  value: (player: Player) => (player.hero.skills?.includes('谦逊') ? 1 : 0),
});
effectRegistry.register({
  kind: 'immuneLeBu',
  value: (player: Player) => (player.hero.skills?.includes('谦逊') ? 1 : 0),
});

/** 连营：当你失去最后的手牌时，摸一张牌 */
const lianyingContent = async (
  game: Game, event: GameEvent<any>, owner: Player,
): Promise<void> => {
  await drawCards(game, { target: owner, count: 1 });
  console.log(`  ✨${owner.name} 发动【连营】！失去最后的手牌，摸了 1 张牌`);
};

skillRegistry.register({
  name: '连营',
  trigger: 'cardMove.after',
  canTrigger: (_game, event, owner) => {
    const { fromAreas } = event.data as CardMoveEventData;
    const lostHand = fromAreas.some(
      (a) => 'player' in a && a.player === owner && a.zone === 'hand',
    );
    return lostHand && owner.hand.length === 0; // 移动后手牌为空
  },
  content: lianyingContent,
});

heroRegistry.register({
  name: '陆逊', maxHp: 3, sex: 'male', group: '吴', skills: ['谦逊', '连营'],
});
