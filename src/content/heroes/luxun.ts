// ============================================================
// 陆逊 — 谦逊（锁定技） / 连营
// ============================================================

import { drawCards } from '../../position/cardActions.js';
import { defineSkill } from '../../effects/effects.js';
import { heroRegistry } from '../heroRegistry.js';
import type { GameEvent } from '../../events/index.js';
import type { CardMoveEventData } from '../../events/index.js';
import type { Game } from '../../game.js';
import type { Player } from '../../types.js';

/** 谦逊：锁定技，不能成为顺手牵羊/乐不思蜀的目标（targetFilter 时排除，不是 targeting 时取消） */
defineSkill({
  name: '谦逊',
  meta: { compulsory: true },
  effects: [
    { form: 'persistent', key: 'immuneShunShou', value: () => 1 },
    { form: 'persistent', key: 'immuneLeBu', value: () => 1 },
  ],
});

/** 连营：当你失去最后的手牌时，摸一张牌 */
const lianyingContent = async (
  game: Game, event: GameEvent<any>, owner: Player,
): Promise<void> => {
  await drawCards(game, { target: owner, count: 1 });
  console.log(`  ✨${owner.name} 发动【连营】！失去最后的手牌，摸了 1 张牌`);
};

defineSkill({
  name: '连营',
  effects: [{
    form: 'triggered',
    timing: 'cardMove.after',
    condition: (_game, event, owner) => {
      const { fromAreas } = event.data as CardMoveEventData;
      const lostHand = fromAreas.some(
        (a) => 'player' in a && a.player === owner && a.zone === 'hand',
      );
      return lostHand && owner.hand.cards.length === 0; // 移动后手牌为空
    },
    run: lianyingContent,
  }],
});

heroRegistry.register({
  name: '陆逊', maxHp: 3, sex: 'male', group: '吴', skills: ['谦逊', '连营'],
});
