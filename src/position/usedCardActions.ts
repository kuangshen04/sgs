// ============================================================
// UsedCard 层 — UC 业务动作：进入 / 移动 / 退出（边界契约见adr/0003）
//
// UC 层是身份区（装备槽 / 判定区）的**唯一写入者**：
//   create（规则产出，短时/驻留同形）· enter · move（迁移，实体牌跟随）· exit（销毁 + 实体牌去向）
//   settle = "仍在处理区则 exit"，即"清理处理区"。
//
// 位置由本层维护（UC.loc 是状态），物理写入一律经实体牌层内部通道 movePhysical。
// 实体牌**被动**离开驻留区（获得/破坏/顶装备/判定结算）走 installUsedCardHooks 装的钩子。
// ============================================================

import type { Card, CardLocation, CardMoveReason, CardType, Player, UsedCard } from '../types.js';
import type { Game } from '../game.js';
import { CardTag } from '../types.js';
import { asUsedCard } from './usedCards.js';
import { movePhysical, sameCardLocation } from './move.js';
import { moveCards } from './cardActions.js';
import { EQUIP_SLOTS, physicalLocationOf } from './usedCards.js';
import type {
  CardShape, EquipSlot, UsedCardInstance, UsedCardLocation,
} from './usedCards.js';

/**
 * 装载本局的 UC 层钩子（createGame 调用；幂等）。
 * 钩子是物理层与 UC 层之间唯一的耦合点：实体牌**被动**离开驻留区时，
 * 若它属于某条 UC，则这条 UC 被破坏（销毁 + 仍留在原区的剩余实体牌一次进弃牌堆）。
 */
export function installUsedCardHooks(game: Game): void {
  game.usedCardHooks = {
    async onCardLeaveResidentZone(g: Game, from: CardLocation, card: Card): Promise<void> {
      const uc = g.usedCards.ofCard(card);
      if (!uc) return; // 无 UC 的实体牌（判定牌 / 观星亮出 / 鬼才替换牌）
      g.usedCards.unbind(uc); // ① 先解绑（防递归：剩余牌移动时不再命中本钩子）
      // ② 该 UC 仍留在原区的实体牌 → 一次 virtualBroken 进弃牌堆
      const remaining = uc.physicalCards.filter(
        (c) => c.id !== card.id && sameCardLocation(g.cardIndex.get(c.id), from),
      );
      if (remaining.length > 0) {
        await movePhysical(g, {
          cards: remaining, to: { zone: 'discardPile' }, reason: 'virtualBroken',
        });
      }
    },
  };
}

/** 把实体牌 / UsedCard 描述符物化成 UC 实例（已是实例则原样返回） */
export function materializeUsedCard(game: Game, card: Card | UsedCard): UsedCardInstance {
  if ('loc' in card) return card as UsedCardInstance;
  const desc = asUsedCard(card);
  return game.usedCards.create(desc, desc.physicalCards);
}

/** 装备牌槽位（按 UC 的规则身份判定：转化装备按"视为的牌"落槽）——规则查询带 game */
export function equipSlotOf(game: Game, card: CardShape): EquipSlot {
  const def = game.ruleSet.cards.get(card.type);
  if (def?.tags.includes(CardTag.Weapon)) return 'weapon';
  if (def?.tags.includes(CardTag.Armor)) return 'armor';
  if (def?.tags.includes(CardTag.DefensiveHorse)) return 'defensiveHorse';
  return 'offensiveHorse';
}

/**
 * UC 进入容器：实体牌跟随移动 + 登记（装备槽/判定区/处理区）。
 * 物理移动失败（如槽位被占）时不登记，避免留下悬空 UC。
 */
export async function enterUsedCard(
  game: Game,
  uc: UsedCardInstance,
  loc: UsedCardLocation,
  opts: { reason: CardMoveReason },
): Promise<void> {
  if (uc.loc) {
    throw new Error(`enterUsedCard: UC "${uc.name}"(#${uc.id}) 已在容器中（请用 moveUsedCard）`);
  }
  await movePhysical(game, {
    cards: uc.physicalCards,
    to: physicalLocationOf(loc),
    reason: opts.reason,
    equipSlot: loc.kind === 'equipment' ? loc.slot : undefined,
  });
  game.usedCards.bind(uc, loc);
}

/**
 * UC 迁移：在一个容器与另一个容器之间移动，实体牌跟随（闪电转移 / 延时牌进出判定区 /
 * 使用入处理区都是这一步）。**先解绑再移动**——迁移途中离开钩子查不到绑定即 no-op，
 * 因此物理层不需要任何"迁移标记"参数。
 */
export async function moveUsedCard(
  game: Game,
  uc: UsedCardInstance,
  loc: UsedCardLocation,
  opts: { reason: CardMoveReason },
): Promise<void> {
  if (!uc.loc) {
    throw new Error(`moveUsedCard: UC "${uc.name}"(#${uc.id}) 不在任何容器（请用 enterUsedCard）`);
  }
  game.usedCards.unbind(uc);
  await movePhysical(game, {
    cards: uc.physicalCards,
    to: physicalLocationOf(loc),
    reason: opts.reason,
    equipSlot: loc.kind === 'equipment' ? loc.slot : undefined,
  });
  game.usedCards.bind(uc, loc);
}

/**
 * UC 退出容器：销毁 UC，并把**仍在该容器内**的实体牌移到 to（默认弃牌堆）。
 * 已被取走的实体牌不动（例如奸雄/反馈已经拿走的）。
 */
export async function exitUsedCard(
  game: Game,
  uc: UsedCardInstance,
  opts: { reason: CardMoveReason; to?: CardLocation },
): Promise<void> {
  const loc = uc.loc;
  if (!loc) return;
  const physical = physicalLocationOf(loc);
  game.usedCards.unbind(uc);
  const remaining = uc.physicalCards.filter(
    (c) => sameCardLocation(game.cardIndex.get(c.id), physical),
  );
  if (remaining.length > 0) {
    await movePhysical(game, {
      cards: remaining, to: opts.to ?? { zone: 'discardPile' }, reason: opts.reason,
    });
  }
}

/** 结算收尾（"清理处理区"）：仍在处理区的 UC → 退出；已迁走（如闪电转移）则不动 */
export async function settleUsedCard(
  game: Game,
  uc: UsedCardInstance,
  reason: CardMoveReason,
): Promise<void> {
  if (uc.loc?.kind === 'processing') await exitUsedCard(game, uc, { reason });
}

/**
 * 玩家装备区里"承载该类型装备效果"的 UC —— 装备效果的**归属解析**（读规则读 UC，adr/0003）。
 * 返回未失效的那条；失效（青釭剑等）即视为不归属。装备进出/失效/复原即时生效。
 */
export function equippedUsedCard(
  game: Game, player: Player, cardType: CardType,
): UsedCardInstance | undefined {
  for (const slot of EQUIP_SLOTS) {
    const uc = game.usedCards.at({ kind: 'equipment', player, slot })[0];
    if (uc && uc.type === cardType && !uc.disabled) return uc;
  }
  return undefined;
}

/** 令一条 UC 失效（其授予的装备效果即刻不再归属）；返回是否发生了变化 */
export function disableUsedCard(uc: UsedCardInstance): boolean {
  if (uc.disabled) return false;
  uc.disabled = true;
  return true;
}

/** 复原一条 UC（失效期结束） */
export function restoreUsedCard(uc: UsedCardInstance): void {
  uc.disabled = false;
}

/**
 * 判定区是否已有同名 UC —— "判定区同名 UC 只能存在 1 张"规则用（读规则读 UC）：
 * 延时锦囊不能以"判定区已有同名 UC"的角色为目标；闪电转移同样跳过这类角色。
 */
export function hasJudgmentUsedCardNamed(game: Game, player: Player, name: string): boolean {
  return game.usedCards.at({ kind: 'judgment', player }).some((uc) => uc.name === name);
}

/**
 * 延时锦囊能否置于该角色的判定区（**放置合法性** = 规则意义上的"合法目标"）：
 * 存活 + 判定区无同名 UC。未来"不能成为黑色锦囊的目标"（帷幕类免疫，按 `uc.color` 判定）
 * 等限制也在此汇合。
 */
export function canPlaceDelayOn(game: Game, card: UsedCard, player: Player): boolean {
  return player.alive && !hasJudgmentUsedCardNamed(game, player, card.name);
}

/**
 * 装备：把 UC（或实体牌）置入对应槽位（顶掉旧装备）；返回被顶掉的旧装备。
 * 两条路径共用：直接装备（UC 尚在手牌 → enter）与"装备牌的使用效果"
 * （UC 已在处理区 → move，见 flow/useCard.ts）；旧装备走一次 replace 移动离区
 * （其 UC 由离开钩子破坏）。
 */
export async function equipCard(
  game: Game, player: Player, card: Card | UsedCard,
): Promise<Card | undefined> {
  const uc = materializeUsedCard(game, card);
  const slot = equipSlotOf(game, uc);
  const old = player.equipment[slot];
  if (old) {
    await moveCards(game, { to: { zone: 'discardPile' }, cards: [old], reason: 'replace' });
  }
  const loc: UsedCardLocation = { kind: 'equipment', player, slot };
  if (uc.loc) await moveUsedCard(game, uc, loc, { reason: 'equip' });
  else await enterUsedCard(game, uc, loc, { reason: 'equip' });
  return old;
}

/**
 * 打出（响应窗口的原语）：**打出 = 一条 UC 的生命周期**——UC 进处理区、结算、清理。
 * 打出的结算内容为空（效果就是消耗这张牌本身），因此进入处理区后立即收尾；
 * 若将来出现"打出后仍留在处理区"的读取方（无懈机制重设计等），把 settle 交给调用方。
 * 支持转化牌（龙胆/武圣/倾国）与多牌源（丈八蛇矛）。
 */
export async function playUsedCard(
  game: Game, player: Player, card: Card | UsedCard,
): Promise<Card[]> {
  const uc = materializeUsedCard(game, card);
  await enterUsedCard(game, uc, { kind: 'processing' }, { reason: 'play' });
  await settleUsedCard(game, uc, 'play');
  return uc.physicalCards;
}
