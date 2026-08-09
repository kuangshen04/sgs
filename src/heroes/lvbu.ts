// ============================================================
// 吕布 — 无双（锁定技：杀需两张闪；决斗响应需两张杀）
// ============================================================

import { CardType } from '../types.js';
import { skillRegistry } from '../skills.js';
import { heroRegistry } from '../heroRegistry.js';
import type { GameEvent } from '../events/index.js';
import type { TargetingEventData, UseCardEventData } from '../events/index.js';
import { EventType } from '../events/index.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

/** 无双：使用杀指定目标后，目标需使用两张闪（逐张响应） */
const wushuangContent = async (
  game: Game, event: GameEvent<any>, owner: Player,
): Promise<void> => {
  const useCardEvent = event.getParent(EventType.UseCard);
  if (!useCardEvent) return;
  const marks = (useCardEvent.data as UseCardEventData).marks;
  if (!marks) return;
  marks.shanRequired = 2;
  console.log(`  ✨${owner.name} 的无双发动，目标需使用两张闪`);
};

skillRegistry.register({
  name: '无双',
  trigger: 'targeting.after',
  canTrigger: (_game, event, owner) => {
    const { user, card } = event.data as TargetingEventData;
    if (user !== owner) return false;
    return card.type === CardType.Sha;
    // 决斗部分（每次响应需两张杀）待决斗响应流程（TODO）
  },
  content: wushuangContent,
});

heroRegistry.register({ name: '吕布', maxHp: 4, sex: 'male', group: '群', skills: ['无双'] });
