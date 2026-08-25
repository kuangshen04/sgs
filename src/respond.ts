// ============================================================
// 三国杀最小原型 — 响应流程（杀 → 闪）
// 玩家选择走 ask 家族（askForCard，默认 AI：有就出第一张）；
// 机制层：能否响应 / 所需闪数 / 抵消时点。
// 将来南蛮/决斗/万箭的响应（打出的杀/闪）复用同一骨架。
// ============================================================

import { CardType } from './types.js';
import type { Card, Player, RespondMarks, UsedCard } from './types.js';
import type { Game } from './game.js';
import { EventType, GameEvent } from './events/index.js';
import type { ShaCancelledEventData } from './events/index.js';
import { cardEmoji, displayNumber, asUsedCard } from './cardRegistry.js';
import { playFromHand } from './cardActions.js';
import { askForCard, handCardsStep, selectedCards } from './choose.js';
import { chooseUseAction } from './useWindow.js';
import type { UseAction } from './useWindow.js';
import type { SelectionPlan } from './selection.js';

/**
 * 结算一张杀的闪响应，返回是否被抵消。
 * - 不可闪避（铁骑标记）→ 跳过响应，未抵消
 * - 所需闪数（无双标记）→ 逐张询问：出一张后再问下一张
 * - 全部出完 → 触发 shaCancelled 抵消时点（青龙偃月刀/贯石斧监听）
 */
export async function resolveShaResponse(
  game: Game, attacker: Player, defender: Player, shaCard: Card | UsedCard, marks: RespondMarks,
): Promise<boolean> {
  const usedCard = asUsedCard(shaCard);
  if (marks.unavoidable) {
    console.log(`  ⚡${defender.name} 无法闪避！`);
    return false;
  }

  const need = marks.shanRequired ?? 1;
  for (let i = 0; i < need; i++) {
    const choice = await chooseUseAction(game, defender, shanResponseActions(game, defender));
    if (!choice || choice.action.group === 'decline') {
      console.log(`  ${defender.name} 无法打出闪！`);
      return false; // 已出的闪不返还，杀命中
    }
    const shan = choice.action.group === 'real'
      ? (choice.action.data as Card)
      : selectedCards(choice.answers, 'source')[0];
    await playFromHand(game, defender, shan);
    console.log(
      `  ${defender.name} 使用了 ${cardEmoji(CardType.Shan)} (${shan.suit}${displayNumber(shan.number)})，抵消了攻击`,
    );
  }

  await new GameEvent<ShaCancelledEventData>(EventType.ShaCancelled, {
    attacker, defender, card: usedCard, shanCount: need,
  }, game).execute(async () => {});

  return true;
}

/** 杀→闪响应窗口的动作候选：真闪、龙胆②、倾国、放弃 */
function shanResponseActions(game: Game, defender: Player): UseAction[] {
  const actions: UseAction[] = [];

  for (const shan of defender.hand.filter((c) => c.type === CardType.Shan)) {
    actions.push({
      id: `shan:${shan.id}`,
      label: `闪${displayNumber(shan.number)}`,
      group: 'real',
      priority: 100,
      data: shan,
    });
  }

  if (defender.hero.skills?.includes('龙胆')) {
    actions.push({
      id: 'longdan-shan',
      label: '龙胆：杀当闪',
      group: 'conversion',
      priority: 50,
      continuation: sourceCardPlan('龙胆②：选择一张杀当闪', (c) => c.type === CardType.Sha),
    });
  }

  if (defender.hero.skills?.includes('倾国')) {
    actions.push({
      id: 'qingguo-shan',
      label: '倾国：黑牌当闪',
      group: 'conversion',
      priority: 40,
      continuation: sourceCardPlan(
        '倾国：选择一张黑色牌当闪',
        (c) => c.suit === '♠' || c.suit === '♣',
      ),
    });
  }

  actions.push({ id: 'decline', label: '不出闪', group: 'decline', priority: -1 });
  return actions;
}

/** 从手牌选一张源牌的后续计划 */
function sourceCardPlan(prompt: string, filter: (c: Card) => boolean): (game: Game, player: Player) => SelectionPlan {
  return (_game, player) => ({
    nextStep(answers) {
      if (answers.source) return null;
      return handCardsStep('source', player, { prompt, filter, min: 1, max: 1 });
    },
  });
}

/**
 * 决斗中一个角色的单次响应：需打出 required 张杀（无双②），逐张询问。
 * 不足则失败（打不出杀 → 受到伤害）；已打出的杀不返还。
 */
export async function resolveJueDouResponse(
  game: Game, player: Player, required: number,
): Promise<boolean> {
  for (let i = 0; i < required; i++) {
    // askForCard：决斗中是否出杀/出哪张（默认 AI：有就出第一张）
    const sha = await askForCard(game, player, '是否打出杀', [CardType.Sha]);
    if (!sha) {
      console.log(`  ${player.name} 无法打出杀！`);
      return false;
    }
    await playFromHand(game, player, sha);
    console.log(
      `  ${player.name} 打出了 ${cardEmoji(CardType.Sha)} (${sha.suit}${displayNumber(sha.number)})`,
    );
  }
  return true;
}
