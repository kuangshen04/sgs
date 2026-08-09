// ============================================================
// 马超 — 马术（锁定技） / 铁骑
// ============================================================

import { CardType } from '../types.js';
import type { Player } from '../types.js';
import { displayNumber } from '../cardRegistry.js';
import { judge } from '../cardActions.js';
import { effectRegistry } from '../persistentEffects.js';
import { skillRegistry } from '../skills.js';
import { heroRegistry } from '../heroRegistry.js';
import type { GameEvent } from '../events/index.js';
import type { TargetingEventData, UseCardEventData } from '../events/index.js';
import { EventType } from '../events/index.js';
import type { Game } from '../game.js';

// 马术：锁定技，纯常驻效果
effectRegistry.register({
  kind: 'offensiveDistance',
  value: (player: Player) => (player.hero.skills?.includes('马术') ? 1 : 0),
});

/** 铁骑：使用杀指定目标后判定，红色则此杀不可闪避 */
const tieqiContent = async (
  game: Game, event: GameEvent<any>, owner: Player,
): Promise<void> => {
  const judgeCard = await judge(game, owner);
  if (judgeCard.suit === '♥' || judgeCard.suit === '♦') {
    const useCardEvent = event.getParent(EventType.UseCard);
    if (useCardEvent) {
      const marks = (useCardEvent.data as UseCardEventData).marks;
      if (marks) marks.unavoidable = true;
    }
    console.log(
      `  ✨${owner.name} 的铁骑判定为 ${judgeCard.suit}${displayNumber(judgeCard.number)}（红色），此杀不可闪避`,
    );
  } else {
    console.log(`  ${owner.name} 的铁骑判定为黑色，无事发生`);
  }
};

skillRegistry.register({
  name: '铁骑',
  trigger: 'targeting.after',
  canTrigger: (_game, event, owner) => {
    const { user, card } = event.data as TargetingEventData;
    return user === owner && card.type === CardType.Sha;
  },
  content: tieqiContent,
});

heroRegistry.register({
  name: '马超', maxHp: 4, sex: 'male', group: '蜀', skills: ['马术', '铁骑'],
});
