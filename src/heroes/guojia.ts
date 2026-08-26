// ============================================================
// 郭嘉 — 遗计 / 天妒
// ============================================================

import { takeFromProcessing, takeTop, moveCards } from '../cardActions.js';
import { cardEmoji, displayNumber } from '../cardRegistry.js';
import { targetsStep, selectedPlayers } from '../choose.js';
import { runSelection } from '../selection.js';
import type { SelectionPlan } from '../selection.js';
import { skillRegistry, subjectIsOwner } from '../skills.js';
import type { GameEvent } from '../events/index.js';
import type { DamageEventData, JudgeEventData } from '../events/index.js';
import { heroRegistry } from '../heroRegistry.js';
import type { Game } from '../game.js';
import type { Player } from '../types.js';

/** 遗计：受到伤害后，观看牌堆顶 2×伤害 张牌，按顺序分配任意角色 */
const yijiContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const { amount } = event.data as DamageEventData;
  const revealed = await takeTop(game, amount * 2, { zone: 'processing' }, 'reveal');
  if (revealed.length === 0) return;
  const receivers = game.state.players.filter((p) => p.alive);

  const plan: SelectionPlan = {
    nextStep(answers) {
      for (let i = 0; i < revealed.length; i++) {
        const id = `give:${i}`;
        if (!answers[id]) {
          return targetsStep(id, owner, receivers, {
            prompt: `遗计：第 ${i + 1} 张牌给谁`,
            min: 1,
            max: 1,
          });
        }
      }
      return null;
    },
  };

  const answers = await runSelection(plan, game, owner);
  if (!answers) return;
  for (let i = 0; i < revealed.length; i++) {
    const [receiver] = selectedPlayers(answers, `give:${i}`);
    if (!receiver) continue;
    await moveCards(game, {
      to: { player: receiver, zone: 'hand' }, cards: [revealed[i]], reason: 'give',
    });
  }
  console.log(
    `  ✨${owner.name} 发动【遗计】！受到 ${amount} 点伤害，分配了 ${revealed.length} 张牌`,
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
