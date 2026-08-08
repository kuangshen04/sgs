// ============================================================
// 司马懿 — 反馈 / 鬼才
// ============================================================

import { discardCards } from '../cardActions.js';
import { cardEmoji, displayNumber } from '../cardRegistry.js';
import { selectCardFromAreas, takeCardFromAreas } from '../areas.js';
import { skillRegistry, subjectIsOwner } from '../skills.js';
import type { GameEvent } from '../events/index.js';
import type { DamageEventData, JudgeEventData } from '../events/index.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

/** 反馈：受到伤害后，获得伤害来源区域内的一张牌 */
const fankuiContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const { source } = event.data as DamageEventData;
  if (!source) return; // 无来源伤害
  const card = selectCardFromAreas(source);
  if (!card) return;
  takeCardFromAreas(source, card);
  owner.hand.push(card);
  console.log(`  ✨${owner.name} 发动【反馈】！获得 ${source.name} 的一张牌`);
};

/** 鬼才：一名角色的判定牌生效前，你可以打出一张手牌代替之 */
const guicaiContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const judgeEvent = event as GameEvent<JudgeEventData>;
  // TODO(玩家选择): 鬼才打出哪张手牌替换判定牌——目前写死为第一张
  const card = owner.hand[0];
  await discardCards(game, owner, [card]);
  judgeEvent.data.card = card;
  console.log(
    `  ✨${owner.name} 发动【鬼才】！打出 ${cardEmoji(card.type)} ` +
    `(${card.suit}${displayNumber(card.number)}) 代替判定牌`,
  );
};

skillRegistry.register({
  name: '反馈',
  trigger: 'damage.after',
  canTrigger: subjectIsOwner,
  content: fankuiContent,
});

skillRegistry.register({
  name: '鬼才',
  trigger: 'judge.judging',
  // 响应型：任何角色的判定都可响应，不看事件主体
  canTrigger: (_game, _event, owner) => owner.hand.length > 0,
  content: guicaiContent,
});

heroRegistry.register({ name: '司马懿', maxHp: 3, sex: 'male', group: '魏', skills: ['反馈', '鬼才'] });
