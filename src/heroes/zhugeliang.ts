// ============================================================
// 诸葛亮 — 空城（锁定技：没有手牌时，你不能成为【杀】或【决斗】的目标）
// ============================================================

import { effectRegistry } from '../persistentEffects.js';
import { heroRegistry } from '../heroRegistry.js';
import { takeTop, putTop, putBottom } from '../cardActions.js';
import { cardsStep, selectedCards } from '../choose.js';
import { runSelection } from '../selection.js';
import type { SelectionPlan } from '../selection.js';
import { skillRegistry, subjectIsOwner } from '../skills.js';
import type { Player } from '../types.js';
import type { GameEvent } from '../events/index.js';
import type { Game } from '../game.js';

// 锁定技：targetFilter 时排除目标（不是 targeting 时取消）
effectRegistry.register({
  kind: 'immuneSha',
  value: (player: Player) =>
    (player.hero.skills?.includes('空城') && player.hand.length === 0 ? 1 : 0),
});
effectRegistry.register({
  kind: 'immuneJueDou',
  value: (player: Player) =>
    (player.hero.skills?.includes('空城') && player.hand.length === 0 ? 1 : 0),
});

/** 观星：准备阶段观看牌堆顶 X 张，任选放顶/放底（顶、底各自可排序） */
const guanxingContent = async (game: Game, _event: GameEvent<any>, owner: Player): Promise<void> => {
  const alive = game.state.players.filter((p) => p.alive).length;
  const n = Math.min(5, alive);
  const revealed = await takeTop(game, n, { zone: 'processing' }, 'reveal');
  if (revealed.length === 0) return;
  const pool = [...revealed].reverse(); // 顶到下

  const plan: SelectionPlan = {
    nextStep(answers) {
      if (!answers.top) {
        return cardsStep('top', pool, {
          prompt: '观星：选择放顶的牌（顺序为顶到下）',
          min: 0,
          max: pool.length,
          ai: (ctx) => ctx.step.options, // 默认全部放顶（顺序不变）
        });
      }
      const topIds = new Set(selectedCards(answers, 'top').map((c) => c.id));
      const bottom = pool.filter((c) => !topIds.has(c.id));
      if (bottom.length > 0 && !answers.bottom) {
        return cardsStep('bottom', bottom, {
          prompt: '观星：选择放底的牌（顺序为此处从上到下）',
          min: 0,
          max: bottom.length,
          ai: (ctx) => ctx.step.options,
        });
      }
      return null;
    },
  };

  const answers = await runSelection(plan, game, owner);
  if (!answers) return;
  const topCards = selectedCards(answers, 'top');
  const bottomCards = selectedCards(answers, 'bottom');
  if (topCards.length) await putTop(game, topCards, 'reveal');
  if (bottomCards.length) await putBottom(game, bottomCards, 'reveal');
  console.log(`  ✨${owner.name} 发动【观星】！观看 ${revealed.length} 张`);
};

skillRegistry.register({
  name: '观星',
  trigger: 'preparePhase.before',
  canTrigger: subjectIsOwner,
  content: guanxingContent,
});

heroRegistry.register({ name: '诸葛亮', maxHp: 3, sex: 'male', group: '蜀', skills: ['空城', '观星'] });
