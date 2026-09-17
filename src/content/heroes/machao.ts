// ============================================================
// 马超 — 马术（锁定技） / 铁骑
// ============================================================

import { CardType } from '../../types.js';
import type { Player } from '../../types.js';
import { displayNumber } from '../cardRegistry.js';
import { judge } from '../../position/cardActions.js';
import { defineSkill } from '../../effects/effects.js';
import { heroRegistry } from '../heroRegistry.js';
import type { GameEvent } from '../../events/index.js';
import type { TargetingEventData } from '../../events/index.js';
import type { Game } from '../../game.js';

/** 马术：锁定技，纯常驻效果（归属由引擎按技能名判定） */
defineSkill({
  name: '马术',
  meta: { compulsory: true },
  effects: [{ form: 'persistent', key: 'offensiveDistance', value: () => 1 }],
});

/** 铁骑：使用杀指定目标后判定，红色则此杀对该目标不可闪避（per-target 位，取代旧的跨目标 marks） */
const tieqiContent = async (
  game: Game, event: GameEvent<any>, owner: Player,
): Promise<void> => {
  const judgeCard = await judge(game, owner);
  if (judgeCard.suit === '♥' || judgeCard.suit === '♦') {
    // targeting.after 的"当前目标"事件：置该目标的 disresponsive（随生效事件继承）
    (event.data as TargetingEventData).disresponsive = true;
    console.log(
      `  ✨${owner.name} 的铁骑判定为 ${judgeCard.suit}${displayNumber(judgeCard.number)}（红色），此杀不可闪避`,
    );
  } else {
    console.log(`  ${owner.name} 的铁骑判定为黑色，无事发生`);
  }
};

defineSkill({
  name: '铁骑',
  effects: [{
    form: 'triggered',
    timing: 'targeting.after',
    condition: (_game, event, owner) => {
      const { user, card } = event.data as TargetingEventData;
      return user === owner && card.type === CardType.Sha;
    },
    run: tieqiContent,
  }],
});

heroRegistry.register({
  name: '马超', maxHp: 4, sex: 'male', group: '蜀', skills: ['马术', '铁骑'],
});
