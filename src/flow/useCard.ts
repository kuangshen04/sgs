// ============================================================
// 使用牌流程（UC 层业务）— useCard
//
// 使用牌 = 一条 UC 的生命周期（两层边界见演进 3.5）：
//   R1（当前）：延时锦囊 → UC 进目标判定区；装备 → UC 进槽位；其余 → 实体牌进处理区后结算。
//   R2（下一步）：统一为 "入 UC 处理区 → 目标/响应窗口 → 效果 → 清理处理区"，
//   延时锦囊/装备的"效果"就是 moveUsedCard。
//
// 判定牌、观星亮出的牌不是 UC，不走本流程。
// ============================================================

import { CardTag } from '../types.js';
import type { Card, Player, UsedCard } from '../types.js';
import { EventType, GameEvent } from '../events/index.js';
import type { TargetingEventData, UseCardEventData } from '../events/index.js';
import { cardRegistry, cardEmoji, displayNumber, asUsedCard } from '../content/cardRegistry.js';
import { moveCards, settleProcessingCards } from '../position/cardActions.js';
import { enterUsedCard, equipCard, materializeUsedCard } from '../position/usedCardActions.js';
import type { Game } from '../game.js';

export async function useCard(
  game: Game,
  data: Omit<UseCardEventData, 'card'> & { card: Card | UsedCard },
): Promise<GameEvent<UseCardEventData>> {
  const usedData: UseCardEventData = {
    player: data.player,
    targets: data.targets,
    marks: data.marks,
    card: asUsedCard(data.card),
  };
  return new GameEvent<UseCardEventData>(EventType.UseCard, usedData, game)
    .execute(async (event) => {
      event.data.marks = event.data.marks ?? {}; // 杀响应过程状态（无双/铁骑写入）
      // 使用牌 = 一条 UC；R2 起由选择阶段生成，这里兜底物化
      const uc = materializeUsedCard(game, event.data.card);
      event.data.card = uc;
      const def = cardRegistry.get(uc.type);
      const isDelayed = !!def?.tags.includes(CardTag.Delay);

      if (isDelayed) {
        // 延时锦囊：使用时直接置入目标判定区（无无懈窗口）
        const target = event.data.targets[0];
        if (target) {
          await enterUsedCard(game, uc, { kind: 'judgment', player: target }, { reason: 'use' });
          console.log(
            `  ${event.data.player.name} 使用了 ${cardEmoji(uc.type)}` +
            `(${uc.suit}${displayNumber(uc.number)})，置入 ${target.name} 的判定区`,
          );
        }
        return;
      }

      const isEquip = !!def?.tags.includes(CardTag.Equip);

      if (isEquip) {
        // 装备：UC 置入对应栏位（顶掉旧装备），无响应窗口
        const target = event.data.targets[0] ?? event.data.player;
        const replaced = await equipCard(game, target, uc);
        console.log(
          `  ${event.data.player.name} 装备了 ${cardEmoji(uc.type)}` +
          `(${uc.suit}${displayNumber(uc.number)})` +
          (replaced ? `，顶掉 ${cardEmoji(replaced.type)}` : ''),
        );
        return;
      }

      // 使用的牌进入处理区（结算中位置），结算完成后统一回弃牌堆
      await moveCards(game, {
        to: { zone: 'processing' },
        cards: event.data.card.physicalCards,
        reason: 'use',
      });

      try {
        // 逐 target 判定（无懈可击等响应在这里）
        let shouldExecute = true;

        if (event.data.targets.length > 0) {
          const remaining: Player[] = [];
          for (const target of event.data.targets) {
            const targetingEvent = await new GameEvent<TargetingEventData>(
              EventType.Targeting,
              { user: event.data.player, card: event.data.card, target },
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
          if (remaining.length === 0) {
            shouldExecute = false;
          } else {
            event.data.targets = remaining;
          }
        } else {
          // 无目标牌（如无懈可击）：单次 targeting，target = 使用者自己
          // 这是唯一的响应窗口，无懈可击可以被反无懈
          const targetingEvent = await new GameEvent<TargetingEventData>(
            EventType.Targeting,
            { user: event.data.player, card: event.data.card, target: event.data.player },
            game,
          ).execute(async (evt) => {
            await game.triggerSystem.trigger(`${EventType.Targeting}.before`, evt);
            if (evt.data.cancelled) return;
            await game.triggerSystem.trigger(`${EventType.Targeting}.after`, evt);
          }, { triggers: false });

          if (targetingEvent.data.cancelled) {
            console.log(`  🚫${event.data.player.name} 的 ${cardRegistry.get(uc.type)?.name ?? '牌'} 效果已被抵消`);
            shouldExecute = false;
          }
        }

        if (shouldExecute && def) {
          await def.content(game, event.data, event);
        }
      } finally {
        await settleProcessingCards(game, event.data.card.physicalCards);
      }
    });
}
