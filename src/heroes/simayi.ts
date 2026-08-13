// ============================================================
// 司马懿 — 反馈 / 鬼才
// ============================================================

import { moveCards } from '../cardActions.js';
import { cardEmoji, displayNumber } from '../cardRegistry.js';
import { askForCard, askFromAreas } from '../choose.js';
import { skillRegistry, subjectIsOwner } from '../skills.js';
import type { GameEvent } from '../events/index.js';
import type { DamageEventData, JudgeEventData } from '../events/index.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import { CardType } from '../types.js';
import type { Player } from '../types.js';

/** 反馈：受到伤害后，获得伤害来源区域内的一张牌 */
const fankuiContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const { source } = event.data as DamageEventData;
  if (!source) return; // 无来源伤害
  // askFromAreas：获得伤害来源区域内哪张牌（默认 AI：随机）
  const card = askFromAreas(game, source, '反馈：获得伤害来源一张牌');
  if (!card) return;
  await moveCards(game, {
    to: { player: owner, zone: 'hand' }, cards: [card], reason: 'give',
  });
  console.log(`  ✨${owner.name} 发动【反馈】！获得 ${source.name} 的一张牌`);
};

/** 鬼才：一名角色的判定牌生效前，你可以打出一张手牌代替之 */
const guicaiContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const judgeEvent = event as GameEvent<JudgeEventData>;
  // askForCard：打出哪张手牌替换判定牌（默认 AI：第一张；任意手牌均可）
  const card = askForCard(game, owner, '鬼才：打出一张手牌代替判定牌', Object.values(CardType));
  if (!card) return;
  const original = judgeEvent.data.card;
  // 原判定牌离开处理区进弃牌堆
  if (original) {
    await moveCards(game, {
      to: { zone: 'discardPile' }, cards: [original], reason: 'judge',
    });
  }
  // 替换牌进入处理区，作为新的判定牌
  await moveCards(game, {
    to: { zone: 'processing' }, cards: [card], reason: 'judge',
  });
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
