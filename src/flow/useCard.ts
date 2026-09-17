// ============================================================
// 使用牌流程（UC 层业务）— useCard（演进 3.6：目标阶段 + 单目标生效事件）
//
// useCard = 一条 UC 的一生：
//   ① UC 进处理区（实体牌跟随）——短时 UC 的家；
//   ② 【有目标】目标阶段：逐目标 targeting.before → targeting.after（可取消目标 cancelled）；
//   ③ 【有目标】生效阶段：onAction(before) → 逐目标依次创建单目标生效事件 cardEffect → onAction(after)
//         cardEffect.before → 内容（CardDef.content，只结算当前目标）→ cardEffect.after
//         引擎在内容前只检查 nullified / cancelled：已置位则跳过内容（= 无效 / 抵消）；
//      延时锦囊 / 装备的"使用效果"是引擎提供的位置效果（U3 起移入生效阶段并受 nullified 约束）；
//   ③'【无目标】单独流程（无懈这类"对某次生效"的使用）；
//   ④ 收尾：清理处理区（UC 退出，实体牌入弃牌堆）。
//
// 打出（响应窗口）不走本流程，见 usedCardActions.playUsedCard；
// 判定牌、观星亮出的牌不是 UC，也不走本流程。
// ============================================================

import { CardTag } from '../types.js';
import type { Card, Player, UsedCard } from '../types.js';
import { EventType, GameEvent } from '../events/index.js';
import type {
  CardEffectEventData, TargetingEventData, UseCardEventData,
} from '../events/index.js';
import { cardRegistry, cardEmoji, cardFaceText } from '../content/cardRegistry.js';
import type { CardDef } from '../content/cardRegistry.js';
import {
  enterUsedCard, equipCard, materializeUsedCard, moveUsedCard, settleUsedCard,
} from '../position/usedCardActions.js';
import type { UsedCardInstance } from '../position/usedCards.js';
import type { Game } from '../game.js';

export async function useCard(
  game: Game,
  data: Omit<UseCardEventData, 'card'> & { card: Card | UsedCard },
): Promise<GameEvent<UseCardEventData>> {
  // 使用牌 = 一条 UC：本应由选择阶段生成（"能生成 UC 的规则 → 选牌 → 生成 UC"），
  // 此处对直接调用方（技能/测试/内容）兜底物化。
  const uc = materializeUsedCard(game, data.card);
  const usedData: UseCardEventData = {
    player: data.player,
    targets: data.targets,
    marks: data.marks,
    card: uc,
    unoffsetable: data.unoffsetable,
    extra: data.extra,
    responseTo: data.responseTo,
  };
  return new GameEvent<UseCardEventData>(EventType.UseCard, usedData, game)
    .execute(async (event) => {
      event.data.marks = event.data.marks ?? {}; // 杀响应过程状态（无双/铁骑写入）
      const def = cardRegistry.get(uc.type);

      // ① 使用的牌先进处理区（结算中位置）
      await enterUsedCard(game, uc, { kind: 'processing' }, { reason: 'use' });

      try {
        if (event.data.targets.length > 0) {
          // ② 目标阶段
          event.data.targets = await runTargeting(game, event, uc, event.data.targets);
          if (event.data.targets.length === 0) return; // 目标全部被取消 → 不生效

          // ③ 生效阶段：整张牌的开幕 → 逐目标生效 → 整张牌的收尾
          await def?.onAction?.(game, event.data, event, 'before');
          for (const target of event.data.targets) {
            if (!target.alive) continue;
            await runCardEffect(game, event, def, target);
          }
          await def?.onAction?.(game, event.data, event, 'after');
        } else {
          // ③'【无目标】单独流程（如无懈）：不伪造 target，也不产生 targeting 事件。
          // 无懈自身也是一次这样的使用，因此它的 `cardEffect.before` 就是反无懈窗口（U2）。
          await runCardEffect(game, event, def, undefined);
        }
      } finally {
        // ④ 清理处理区：仍在处理区的 UC 退出（销毁，实体牌入弃牌堆）
        await settleUsedCard(game, uc, 'discard');
      }
    });
}

/** 目标阶段：逐目标 targeting.before → targeting.after；返回未被取消的目标 */
async function runTargeting(
  game: Game,
  event: GameEvent<UseCardEventData>,
  uc: UsedCardInstance,
  targets: readonly Player[],
): Promise<Player[]> {
  const remaining: Player[] = [];
  for (const target of targets) {
    const targetingEvent = await new GameEvent<TargetingEventData>(
      EventType.Targeting,
      { user: event.data.player, card: uc, target },
      game,
    ).execute(async (evt) => {
      // targeting 是 trigger 检查点：自行编排 before / after，便于在 cancelled 时跳过
      await game.triggerSystem.trigger(`${EventType.Targeting}.before`, evt);
      if (evt.data.cancelled) return;
      await game.triggerSystem.trigger(`${EventType.Targeting}.after`, evt);
    }, { triggers: false });

    if (!targetingEvent.data.cancelled) {
      // 读事件内的 target：流离等技能可在 targeting.before 中转移目标
      remaining.push(targetingEvent.data.target);
    } else {
      console.log(`  🚫${target.name} 被指定为目标的效果已被抵消`);
    }
  }
  return remaining;
}

/**
 * 单目标生效事件：`cardEffect.before` → 内容 → `cardEffect.after`。
 * `to === undefined` = 无目标流程（无懈）。
 */
async function runCardEffect(
  game: Game,
  event: GameEvent<UseCardEventData>,
  def: CardDef | undefined,
  to: Player | undefined,
): Promise<void> {
  const data: CardEffectEventData = {
    use: event.data,
    card: event.data.card,
    to,
    marks: event.data.marks,
    unoffsetable: event.data.unoffsetable,
  };
  await new GameEvent<CardEffectEventData>(EventType.CardEffect, data, game)
    .execute(async (evt) => {
      // 引擎只做这一件事：无效 / 被抵消 ⇒ 跳过内容
      if (evt.data.nullified || evt.data.cancelled) return;

      // 延时锦囊 / 装备的使用效果 = 引擎提供的位置效果（U3 起移入内容并受 nullified 约束）
      if (def?.tags.includes(CardTag.Delay)) {
        if (to) {
          await moveUsedCard(game, evt.data.card, { kind: 'judgment', player: to }, { reason: 'use' });
          console.log(
            `  ${event.data.player.name} 使用了 ${cardEmoji(evt.data.card.type)}` +
            `(${cardFaceText(evt.data.card)})，置入 ${to.name} 的判定区`,
          );
        }
        return;
      }
      if (def?.tags.includes(CardTag.Equip)) {
        const owner = to ?? event.data.player;
        const replaced = await equipCard(game, owner, evt.data.card);
        console.log(
          `  ${event.data.player.name} 装备了 ${cardEmoji(evt.data.card.type)}` +
          `(${cardFaceText(evt.data.card)})` +
          (replaced ? `，顶掉 ${cardEmoji(replaced.type)}` : ''),
        );
        return;
      }

      if (def) await def.content(game, evt.data, evt);
    });
}
