// ============================================================
// 使用牌流程（UC 层业务）— useCard
//
// 使用牌 = 一条 UC 的生命周期（两层边界见演进 3.5）：
//   ① UC 进处理区（实体牌跟随）——短时 UC 的家；
//   ② 逐目标的目标/响应窗口（无懈可击等）；
//   ③ 效果：延时锦囊 / 装备的"使用效果"就是**移动这条 UC**（引擎统一提供）；
//      其余牌的"使用效果"是内容层的 `def.content`；
//   ④ 清理处理区：仍在处理区的 UC 销毁（实体牌入弃牌堆）；已迁走的（延时 / 装备）不动。
//
// 打出（响应窗口）不走本流程，见 usedCardActions.playUsedCard。
// 判定牌、观星亮出的牌不是 UC，也不走本流程。
// ============================================================

import { CardTag } from '../types.js';
import type { Card, Player, UsedCard } from '../types.js';
import { EventType, GameEvent } from '../events/index.js';
import type { TargetingEventData, UseCardEventData } from '../events/index.js';
import { cardRegistry, cardEmoji, cardFaceText } from '../content/cardRegistry.js';
import {
  enterUsedCard, equipCard, materializeUsedCard, moveUsedCard, settleUsedCard,
} from '../position/usedCardActions.js';
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
  };
  return new GameEvent<UseCardEventData>(EventType.UseCard, usedData, game)
    .execute(async (event) => {
      event.data.marks = event.data.marks ?? {}; // 杀响应过程状态（无双/铁骑写入）
      const def = cardRegistry.get(uc.type);

      // ① 使用的牌先进处理区（结算中位置）
      await enterUsedCard(game, uc, { kind: 'processing' }, { reason: 'use' });

      try {
        // ② 逐 target 判定（无懈可击等响应在这里）
        let shouldExecute = true;

        if (event.data.targets.length > 0) {
          const remaining: Player[] = [];
          for (const target of event.data.targets) {
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
            { user: event.data.player, card: uc, target: event.data.player },
            game,
          ).execute(async (evt) => {
            await game.triggerSystem.trigger(`${EventType.Targeting}.before`, evt);
            if (evt.data.cancelled) return;
            await game.triggerSystem.trigger(`${EventType.Targeting}.after`, evt);
          }, { triggers: false });

          if (targetingEvent.data.cancelled) {
            console.log(`  🚫${event.data.player.name} 的 ${def?.name ?? '牌'} 效果已被抵消`);
            shouldExecute = false;
          }
        }

        // ③ 效果
        if (shouldExecute) {
          if (def?.tags.includes(CardTag.Delay)) {
            // 延时锦囊：效果 = UC 迁入目标判定区（判定期再结算，见 gameFlow.judgePhase）
            const target = event.data.targets[0];
            if (target) {
              await moveUsedCard(game, uc, { kind: 'judgment', player: target }, { reason: 'use' });
              console.log(
                `  ${event.data.player.name} 使用了 ${cardEmoji(uc.type)}` +
                `(${cardFaceText(uc)})，置入 ${target.name} 的判定区`,
              );
            }
          } else if (def?.tags.includes(CardTag.Equip)) {
            // 装备：效果 = UC 迁入对应槽位（顶掉旧装备）
            const target = event.data.targets[0] ?? event.data.player;
            const replaced = await equipCard(game, target, uc);
            console.log(
              `  ${event.data.player.name} 装备了 ${cardEmoji(uc.type)}` +
              `(${cardFaceText(uc)})` +
              (replaced ? `，顶掉 ${cardEmoji(replaced.type)}` : ''),
            );
          } else if (def) {
            await def.content(game, event.data, event);
          }
        }
      } finally {
        // ④ 清理处理区：仍在处理区的 UC 退出（销毁，实体牌入弃牌堆）
        await settleUsedCard(game, uc, 'discard');
      }
    });
}
