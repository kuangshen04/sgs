// ============================================================
// 郭嘉 — 遗计 / 天妒
// ============================================================

import { drawCards, takeFromProcessing } from '../cardActions.js';
import { cardEmoji, displayNumber } from '../cardRegistry.js';
import { askForTargets } from '../choose.js';
import { skillRegistry, subjectIsOwner } from '../skills.js';
import type { GameEvent } from '../events/index.js';
import type { DamageEventData, JudgeEventData } from '../events/index.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

/** 遗计：受到伤害后，每 1 点伤害摸 2 张牌 */
const yijiContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const { amount } = event.data as DamageEventData;
  const before = owner.hand.length;
  // askForTargets：遗计牌分配给谁（简化：只给自己）
  const receivers = await askForTargets(game, owner, '遗计：牌分给谁（简化只给自己）', [owner], 1);
  if (!receivers) return;
  await drawCards(game, { target: receivers[0], count: amount * 2 });
  console.log(
    `  ✨${owner.name} 发动【遗计】！受到 ${amount} 点伤害，摸了 ${amount * 2} 张牌` +
    `（${before} → ${owner.hand.length}）`,
  );
};

/** 天妒：当你的判定牌生效后，你可以获得之 */
const tianduContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const { card } = event.data as JudgeEventData;
  if (!card) return;

  // 判定牌结算期间位于处理区：从处理区取回并收入手牌
  const found = await takeFromProcessing(game, owner, card);
  if (!found) return;
  console.log(
    `  ✨${owner.name} 发动【天妒】！获得判定牌 ${cardEmoji(found.type)} ` +
    `(${found.suit}${displayNumber(found.number)})`,
  );
};

skillRegistry.register({
  name: '遗计',
  trigger: 'damage.after',
  canTrigger: subjectIsOwner,
  content: yijiContent,
});

skillRegistry.register({
  name: '天妒',
  trigger: 'judge.after',
  canTrigger: subjectIsOwner,
  content: tianduContent,
});

heroRegistry.register({ name: '郭嘉', maxHp: 3, sex: 'male', group: '魏', skills: ['遗计', '天妒'] });
