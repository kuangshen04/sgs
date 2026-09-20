// ============================================================
// 张辽 — 突袭
// ============================================================

import { giveCards } from '../../position/cardActions.js';
import { shuffle } from '../../rules/random.js';
import { askForTargets } from '../../decision/choose.js';
import type { GameEvent } from '../../events/index.js';
import type { DrawPhaseEventData } from '../../events/index.js';
import type { Game } from '../../game.js';
import type { Player } from '../../types.js';
import type { Container } from '../../rules/ruleSet.js';

/** 突袭：摸牌阶段，改为获得至多两名其他角色的各一张手牌（摸牌数改为 0） */
const tuxiContent = async (game: Game, event: GameEvent<any>, owner: Player): Promise<void> => {
  const drawPhaseEvent = event as GameEvent<DrawPhaseEventData>;
  drawPhaseEvent.data.count = 0; // 摸牌阶段的摸牌数改为 0
  const candidates = game.state.players.filter(
    (p) => p !== owner && p.alive && p.hand.cards.length > 0,
  );
  // askForTargets：突袭抢哪两名角色（候选人洗牌后取前 2 → 随机；默认 AI）
  const picks = await askForTargets(game, owner, '突袭：抢谁的手牌', shuffle(candidates), 2);
  if (!picks) return;
  for (const target of picks) {
    // 随机取一张手牌（阶段 2：容器读走 .cards 视图）
    const card = target.hand.cards[Math.floor(Math.random() * target.hand.cards.length)];
    await giveCards(game, target, owner, [card]);
    console.log(`  ✨${owner.name} 发动【突袭】！获得 ${target.name} 的一张手牌`);
  }
};

// ── 装配（显式注册进容器；参数 c = 装配期容器）──────────────────────
export function installZhangliao(c: Container): void {
  c.skills.define({
    name: '突袭',
    effects: [{
      form: 'triggered',
      timing: 'drawPhase.before',
      condition: (game, _event, owner, subject) =>
        subject === owner &&
        game.state.players.some((p) => p !== owner && p.alive && p.hand.cards.length > 0),
      run: tuxiContent,
    }],
  });

  c.heroes.register({ name: '张辽', maxHp: 4, sex: 'male', group: '魏', skills: ['突袭'] });
}
