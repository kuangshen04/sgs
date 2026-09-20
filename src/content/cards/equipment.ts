// ============================================================
// 三国杀最小原型 — 装备牌（武器 / 防具 / 马）
//
// 注：装备的**使用效果**由引擎统一提供（UC 迁入对应槽位，见 flow/useCard.ts），
// 因此各装备定义的 `content` 只承载"结算内容"（当前全为白板），装备能力本身走
// registerBareEffect 的常驻 / 触发效果（4.2 起还将挂到该装备的 UC 上）。
// ============================================================

import { CardTag, CardType } from '../../types.js';
import type { Card, Player, UsedCard } from '../../types.js';
import type { Game } from '../../game.js';
import { cardEmoji } from '../../rules/cardFace.js';
import { discardCards, drawCards, moveCards, judge } from '../../position/cardActions.js';
import { useCard } from '../../flow/useCard.js';
import type {
  CardEffectEventData, DamageEventData, ShaCancelledEventData, TargetingEventData,
  UseCardEventData,
} from '../../events/index.js';
import { EventType } from '../../events/index.js';
import {
  askForCard,
  askFromAreas,
  askForTargets,
  askYesNo,
  handCardsStep,
  targetsStep,
  computeTargetOptions,
  selectedCards,
  selectedPlayers,
} from '../../decision/choose.js';
import { disableUsedCard, restoreUsedCard } from '../../position/usedCardActions.js';
import type { UsedCardInstance } from '../../position/usedCards.js';
import { damage } from '../../flow/life.js';
import { cardsInAreas, hasCardsInAreas } from '../../position/areas.js';
import type { Container } from '../../rules/ruleSet.js';

// ── 内容辅助（模块级：定义与装配共用）──────────────────────────────
function registerBlankWeapon(
  c: Container, type: CardType, name: string, emoji: string, range: number,
): void {
  c.cards.register({
    type, name, emoji,
    content: async () => {}, // 白板：触发效果待对应系统
    tags: [CardTag.Equip, CardTag.Weapon],
    range,
    canUse: () => true,
    targetFilter: (_game, user) => [user],
    targetCount: 1,
    ai: {
      shouldUse: () => true,
      usePriority: 45,
      discardPriority: 100, // 装备尽量保留
    },
  });
}

function isLastHandCards(owner: Player, uc: UsedCardInstance): boolean {
  if (uc.physicalCards.length === 0) return false;
  const hand = owner.hand.cards;
  return hand.length === uc.physicalCards.length
    && uc.physicalCards.every((c) => hand.some((h) => h.id === c.id));
}

function targetArmorUsedCard(
  game: Game, target: Player,
): UsedCardInstance | undefined {
  const uc = game.usedCards.at({ kind: 'equipment', player: target, slot: 'armor' })[0];
  return uc && !uc.disabled ? uc : undefined;
}

function makeZhangbaSha(sources: Card[]): UsedCard {
  return {
    type: CardType.Sha,
    name: '杀',
    physicalCards: sources,
  };
}

function registerBlankHorse(
  c: Container, type: CardType, name: string, tag: CardTag.DefensiveHorse | CardTag.OffensiveHorse,
): void {
  c.cards.register({
    type, name, emoji: '🐎',
    content: async () => {}, // 白板：距离修正走常驻效果
    tags: [CardTag.Equip, tag],
    canUse: () => true,
    targetFilter: (_game, user) => [user],
    targetCount: 1,
    ai: {
      shouldUse: () => true,
      usePriority: 45,
      discardPriority: 100, // 装备尽量保留
    },
  });
  // 距离修正：原按槽位判定，现按牌逐一注册（归属由 equipType 判定，修正值不变）
  c.skills.registerBareEffect({
    form: 'persistent',
    equipType: type,
    key: tag === CardTag.DefensiveHorse ? 'defensiveDistance' : 'offensiveDistance',
    value: () => 1,
  });
}

// ── 装配（显式注册进容器；参数 c = 装配期容器）──────────────────────
export function installEquipmentCards(c: Container): void {
  c.cards.register({
    type: CardType.ZhugeLianNu,
    name: '诸葛连弩',
    emoji: '🪓',
    content: async () => {}, // 无使用效果（持续效果在 registerBareEffect 注册）
    tags: [CardTag.Equip, CardTag.Weapon],
    range: 1,
    canUse: () => true,
    targetFilter: (_game, user) => [user],
    targetCount: 1,
    ai: {
      shouldUse: () => true,
      usePriority: 45,
      discardPriority: 100, // 装备尽量保留
    },
  });

  // 诸葛连弩：使用杀无次数限制（装备来源归属由 effects.ts 按 equipType 判定）
  c.skills.registerBareEffect({
    form: 'persistent',
    equipType: CardType.ZhugeLianNu,
    key: 'unlimitedSha',
    value: () => 1,
  });

  c.cards.register({
    type: CardType.BaGuaZhen,
    name: '八卦阵',
    emoji: '☯️',
    content: async () => {}, // 白板：持续效果（判定出闪）待常驻效果系统
    tags: [CardTag.Equip, CardTag.Armor],
    canUse: () => true,
    targetFilter: (_game, user) => [user],
    targetCount: 1,
    ai: {
      shouldUse: () => true,
      usePriority: 45,
      discardPriority: 100,
    },
  });

  // 马匹距离修正：按牌注册常驻效果（见文件末尾 registerBlankHorse；归属由 equipType 判定）

  c.cards.register({
    type: CardType.QiLinGong,
    name: '麒麟弓',
    emoji: '🎯',
    content: async () => {}, // 无使用效果（触发效果在 registerBareEffect）
    tags: [CardTag.Equip, CardTag.Weapon],
    range: 5,
    canUse: () => true,
    targetFilter: (_game, user) => [user],
    targetCount: 1,
    ai: {
      shouldUse: () => true,
      usePriority: 45,
      discardPriority: 100,
    },
  });

  // 麒麟弓：使用杀造成伤害后，可弃置目标一张坐骑
  c.skills.registerBareEffect({
    form: 'triggered',
    equipType: CardType.QiLinGong,
    timing: 'damage.after',
    condition: (game, event, owner) => {
      const useCard = event.getParent(EventType.UseCard);
      if (!useCard || useCard.data.player !== owner) return false;
      if (useCard.data.card.type !== CardType.Sha) return false;
      const { target } = event.data as DamageEventData;
      return !!target && !!(target.equipment.defensiveHorse || target.equipment.offensiveHorse);
    },
    run: async (game, event, owner) => {
      const { target } = event.data as DamageEventData;
      if (!target) return;
      // askFromAreas：弃置目标一张坐骑（默认 AI：随机；原简化"优先防御马"）
      const mount = await askFromAreas(
        game, target, '麒麟弓：弃置目标一张坐骑', ['equipment'],
        (c) => !!game.ruleSet.cards.get(c.type)?.tags.some(
          (t) => t === CardTag.DefensiveHorse || t === CardTag.OffensiveHorse,
        ),
      );
      if (!mount) return;
      await moveCards(game, {
        to: { zone: 'discardPile' }, cards: [mount], reason: 'discard',
      });
      console.log(
        `  ✨${owner.name} 的麒麟弓发动！弃置 ${target.name} 的坐骑 ${cardEmoji(game, mount.type)}`,
      );
    },
  });

  c.cards.register({
    type: CardType.HanBingJian,
    name: '寒冰剑',
    emoji: '❄️',
    content: async () => {}, // 无使用效果（触发效果在 registerBareEffect）
    tags: [CardTag.Equip, CardTag.Weapon],
    range: 2,
    canUse: () => true,
    targetFilter: (_game, user) => [user],
    targetCount: 1,
    ai: {
      shouldUse: () => true,
      usePriority: 45,
      discardPriority: 100,
    },
  });

  // 寒冰剑：使用杀造成伤害时，可弃置目标两张区域牌并防止此伤害
  c.skills.registerBareEffect({
    form: 'triggered',
    equipType: CardType.HanBingJian,
    timing: 'damage.before',
    condition: (game, event, owner) => {
      const useCard = event.getParent(EventType.UseCard);
      if (!useCard || useCard.data.player !== owner) return false;
      if (useCard.data.card.type !== CardType.Sha) return false;
      const { target } = event.data as DamageEventData;
      if (!target) return false;
      return hasCardsInAreas(target); // 目标区域内有能被弃置的牌
    },
    run: async (game, event, owner) => {
      const { target } = event.data as DamageEventData;
      if (!target) return;
      // 依次弃置两张区域内的牌，然后防止伤害。
      // 逐张 select → moveCards（select 只读；取走一张后才能选第二张）。
      // cancelled 只是置位标志不中断，所以必须先弃牌再置位。
      const discarded: Card[] = [];
      for (let i = 0; i < 2; i++) {
        // askFromAreas：依次弃置哪两张区域牌（默认 AI：随机）
        const card = await askFromAreas(game, target, '寒冰剑：弃置目标一张区域牌');
        if (!card) break;
        await moveCards(game, {
          to: { zone: 'discardPile' }, cards: [card], reason: 'discard',
        });
        discarded.push(card);
      }
      console.log(
        `  ✨${owner.name} 的寒冰剑发动！防止 ${target.name} 受到伤害，弃置 ${discarded.length} 张牌`,
      );
      event.data.cancelled = true;
    },
  });

  c.cards.register({
    type: CardType.RenWangDun,
    name: '仁王盾',
    emoji: '🔰',
    content: async () => {}, // 无使用效果（触发效果在 registerBareEffect）
    tags: [CardTag.Equip, CardTag.Armor],
    canUse: () => true,
    targetFilter: (_game, user) => [user],
    targetCount: 1,
    ai: {
      shouldUse: () => true,
      usePriority: 45,
      discardPriority: 100,
    },
  });

  // 仁王盾：黑色杀对其无效 —— 在**该目标生效前**（cardEffect.before）把这一次生效置为无效。
  // 不放在 targeting 阶段取消目标：那是"目标不合法/被取消"的语义，会让青釭剑（targeting.after
  // 才失效防具）来不及生效；按规则"对你无效"属生效阶段的判定（adr/0006）。
  c.skills.registerBareEffect({
    form: 'triggered',
    equipType: CardType.RenWangDun,
    timing: 'cardEffect.before',
    condition: (_game, event, owner) => {
      const effect = event.data as CardEffectEventData;
      if (effect.to !== owner) return false; // 只保护装备者自己
      if (effect.card.type !== CardType.Sha) return false;
      // 黑色杀对其无效（读 UC 的**颜色**：多牌转化异色则无颜色 → 仁王盾不生效）
      return effect.card.color === 'black';
    },
    run: async (game, event, owner) => {
      const effect = event.data as CardEffectEventData;
      effect.nullified = true; // 引擎据此跳过内容（= 此牌对装备者无效）
      console.log(
        `  🔰${owner.name} 的仁王盾发动！黑色 ${cardEmoji(game, effect.card.type)} 对其无效`,
      );
    },
  });

  c.cards.register({
    type: CardType.CiXiongShuangGuJian,
    name: '雌雄双股剑',
    emoji: '⚔️',
    content: async () => {}, // 无使用效果（触发效果在 registerBareEffect）
    tags: [CardTag.Equip, CardTag.Weapon],
    range: 2,
    canUse: () => true,
    targetFilter: (_game, user) => [user],
    targetCount: 1,
    ai: {
      shouldUse: () => true,
      usePriority: 45,
      discardPriority: 100,
    },
  });

  // 雌雄双股剑：使用杀指定异性目标后，目标弃一张手牌或令使用者摸一张牌
  c.skills.registerBareEffect({
    form: 'triggered',
    equipType: CardType.CiXiongShuangGuJian,
    timing: 'targeting.after',
    condition: (game, event, owner) => {
      const { user, card, target } = event.data as TargetingEventData;
      if (user !== owner) return false; // 只有装备者使用牌时触发
      if (card.type !== CardType.Sha) return false;
      return target.hero.sex !== owner.hero.sex; // 指定异性目标后
    },
    run: async (game, event, owner) => {
      const { target } = event.data as TargetingEventData;
      // askYesNo：目标选择"弃一张手牌"还是"令使用者摸一张牌"
      // （默认 AI：有手牌则弃牌，否则令使用者摸牌）
      const discardHand = await askYesNo(
        game, target, `是否弃置一张手牌（否则 ${owner.name} 摸一张牌）`, target.hand.cards.length > 0,
      );
      if (discardHand && target.hand.cards.length > 0) {
        await discardCards(game, target, [target.hand.cards[0]]);
        console.log(
          `  ⚔️${owner.name} 的雌雄双股剑发动！${target.name} 弃置了一张手牌`,
        );
      } else {
        await drawCards(game, { target: owner, count: 1 });
        console.log(`  ⚔️${owner.name} 的雌雄双股剑发动！摸了一张牌`);
      }
    },
  });

  // ============================================================
  // 剩余武器（白板：仅攻击范围生效；持续效果留空待实现）
  // 青釭剑：使用杀无视目标防具（依赖防具效果模型）
  // 青龙偃月刀：杀被抵消后可再出杀（依赖杀响应流程）
  // 丈八蛇矛：两张手牌当杀（转化牌系统）
  // 贯石斧：杀被抵消后弃两张牌令其仍造成伤害（依赖杀响应流程）
  // 方天画戟：使用杀可指定至多三个目标（依赖选择系统）
  // ============================================================

  registerBlankWeapon(c, CardType.QingGangJian, '青釭剑', '🗡️', 2);
  registerBlankWeapon(c, CardType.ZhangBaSheMao, '丈八蛇矛', '🔱', 3);
  registerBlankWeapon(c, CardType.FangTianHuaJi, '方天画戟', '🔱', 4);

  /**
   * 方天画戟：当你使用【杀】时，若此【杀】是你最后的手牌，你可以额外选择至多两个合法目标
   * （连同原本的一个，共至多 3 个）。
   *
   * - 判定条件（读规则读 UC）：本次使用的 UC 的**实体牌集合 == 使用者当前手牌**且数量不为 0 ——
   *   用两张手牌当杀（丈八蛇矛）且它们是最后两张时同样成立；
   * - 时机：`useCard.before`（内容执行前、目标阶段之前）→ 直接追加到 `use.targets`，
   *   新增的目标会各自走完目标阶段与生效阶段；
   * - 合法性：复用【杀】的 `targetFilter`（攻击范围/免疫等），并排除已有目标与使用者自己。
   */
  c.skills.registerBareEffect({
    form: 'triggered',
    equipType: CardType.FangTianHuaJi,
    timing: 'useCard.before',
    condition: (_game, event, owner) => {
      const use = event.data as UseCardEventData;
      if (use.player !== owner) return false;
      if (use.card.type !== CardType.Sha) return false;
      return isLastHandCards(owner, use.card);
    },
    run: async (game, event, owner) => {
      const use = event.data as UseCardEventData;
      const shaDef = game.ruleSet.cards.get(CardType.Sha)!;
      const candidates = shaDef.targetFilter(game, owner, game.state.players)
        .filter((p) => !use.targets.includes(p));
      if (candidates.length === 0) return;

      // askForTargets：额外指定 0~2 名（默认 AI 取满 2 名，候选已按座次）
      const extra = await askForTargets(
        game, owner, '方天画戟：额外目标（至多 2 名）', candidates, 2,
      );
      if (!extra || extra.length === 0) return;
      use.targets.push(...extra);
      console.log(
        `  🔱${owner.name} 的方天画戟：额外指定 ${extra.map((p) => p.name).join('、')}`,
      );
    },
  });

  /** UC 的实体牌是否正好是使用者的全部手牌（"此【杀】是你最后的手牌"） */

  /**
   * 青釭剑：锁定技，当你使用【杀】指定一名目标角色后，你令其防具技能无效
   * 直到此【杀】被抵消或造成伤害。
   *
   * 实现要点（adr/0003）：
   * - 失效 = 目标**防具槽那条 UC** 的 `disabled`；装备效果归属每次查询重算，
   *   于是该防具的一切效果（仁王盾的 targeting 取消、八卦阵的响应判定…）即刻不再归属；
   * - 期限 = **本条【杀】使用事件的收尾**（`event.onClear`）：规则文本的
   *   "被抵消或造成伤害" 都发生在该事件内，事件结束即复原；
   * - 装备效果本就不参与"是否发动"的询问（`needsAsk = !!effect.skill && !effect.forced`），
   *   故这里不需要 `forced`，锁定技语义由本定义承载。
   */
  c.skills.registerBareEffect({
    form: 'triggered',
    equipType: CardType.QingGangJian,
    timing: 'targeting.after',
    condition: (game, event, owner) => {
      const { user, card, target } = event.data as TargetingEventData;
      if (user !== owner) return false;
      if (card.type !== CardType.Sha) return false;
      return !!targetArmorUsedCard(game, target); // 目标防具槽有未失效的 UC 才需要
    },
    run: async (game, event, owner) => {
      const { target } = event.data as TargetingEventData;
      const armor = targetArmorUsedCard(game, target);
      if (!armor) return;
      disableUsedCard(armor);
      console.log(`  🗡️${owner.name} 的青釭剑令 ${target.name} 的防具无效`);
      // 期限：本条【杀】的使用事件收尾时复原（事件结束 ⇒ 已被抵消或已造成伤害）
      const useEvent = event.getParent(EventType.UseCard) ?? event;
      useEvent.onClear(() => {
        restoreUsedCard(armor);
        console.log(`  🗡️${owner.name} 的青釭剑效果结束，${target.name} 的防具复原`);
      });
    },
  });

  /** 目标装备区防具槽上的 UC（未失效者；青釭剑用） */

  // 丈八蛇矛：两张手牌当杀（装备来源归属由 effects.ts 按 equipType 判定）
  c.skills.registerBareEffect({
    form: 'conversion',
    equipType: CardType.ZhangBaSheMao,
    name: '丈八蛇矛',
    toType: CardType.Sha,
    canUse: (game, player, shaUsed) => {
      const def = game.ruleSet.cards.get(CardType.Sha)!;
      return player.hand.cards.length >= 2
        && def.canUse(game, player, game.state.players, shaUsed);
    },
    selectionPlan: (game, player) => ({
      nextStep(answers) {
        if (!answers.source) {
          return handCardsStep('source', player, {
            prompt: '丈八蛇矛：选择两张手牌当杀',
            min: 2,
            max: 2,
          });
        }
        if (!answers.target) {
          const used = makeZhangbaSha(selectedCards(answers, 'source'));
          const targetOptions = computeTargetOptions(game, used, player);
          return targetsStep('target', player, targetOptions.map((t) => t.player), {
            prompt: '丈八蛇矛：选择杀的目标',
            min: 1,
            max: 1,
          });
        }
        return null;
      },
    }),
    resolve: (answers) => ({
      card: makeZhangbaSha(selectedCards(answers, 'source')),
      targets: selectedPlayers(answers, 'target'),
    }),
    ai: {
      shouldUse: (game, player, shaUsed) => {
        const def = game.ruleSet.cards.get(CardType.Sha)!;
        return def.ai.shouldUse(player, shaUsed);
      },
      usePriority: c.cards.get(CardType.Sha)!.ai.usePriority,
    },
  });

  /**
   * 丈八蛇矛：两张手牌当【杀】——**多牌转化**，故不声明花色/点数
   * （引擎按转化规则推导：无花色无点数；两张同色则有该颜色，异色则无颜色）。
   */

  // 青龙偃月刀：杀被闪抵消后，可以对相同的目标再使用一张杀（AI：有杀就再出）
  c.cards.register({
    type: CardType.QingLongYanYueDao,
    name: '青龙偃月刀',
    emoji: '🗡️',
    content: async () => {}, // 无使用效果（触发效果在 registerBareEffect）
    tags: [CardTag.Equip, CardTag.Weapon],
    range: 3,
    canUse: () => true,
    targetFilter: (_game, user) => [user],
    targetCount: 1,
    ai: {
      shouldUse: () => true,
      usePriority: 45,
      discardPriority: 100,
    },
  });

  // 青龙偃月刀：杀被抵消后可再出杀
  c.skills.registerBareEffect({
    form: 'triggered',
    equipType: CardType.QingLongYanYueDao,
    timing: 'shaCancelled.after',
    condition: (game, event, owner) => {
      const { attacker } = event.data as ShaCancelledEventData;
      if (attacker !== owner) return false; // 只有装备者使用的杀被抵消
      return owner.hand.cards.some((c) => c.type === CardType.Sha); // AI：有杀才再出（发动询问接入前简化）
    },
    run: async (game, event, owner) => {
      const { defender } = event.data as ShaCancelledEventData;
      // askForCard：是否再出杀/出哪张（默认 AI：有就出第一张）
      const sha = await askForCard(game, owner, '青龙偃月刀：是否再次使用杀', [CardType.Sha]);
      if (!sha) return;
      await useCard(game, { player: owner, card: sha, targets: [defender] });
      console.log(`  🗡️${owner.name} 的青龙偃月刀发动，对 ${defender.name} 再次使用杀`);
    },
  });

  // 贯石斧：杀被闪抵消后，弃置两张牌令此杀依然造成伤害
  c.cards.register({
    type: CardType.GuanShiFu,
    name: '贯石斧',
    emoji: '🪓',
    content: async () => {}, // 无使用效果（触发效果在 registerBareEffect）
    tags: [CardTag.Equip, CardTag.Weapon],
    range: 3,
    canUse: () => true,
    targetFilter: (_game, user) => [user],
    targetCount: 1,
    ai: {
      shouldUse: () => true,
      usePriority: 45,
      discardPriority: 100,
    },
  });

  // 贯石斧：杀被抵消后可弃两张牌令此杀依然造成伤害
  c.skills.registerBareEffect({
    form: 'triggered',
    equipType: CardType.GuanShiFu,
    timing: 'shaCancelled.after',
    condition: (game, event, owner) => {
      const { attacker } = event.data as ShaCancelledEventData;
      return attacker === owner && cardsInAreas(owner).length >= 2; // 需弃两张牌
    },
    run: async (game, event, owner) => {
      const { defender, card: shaCard } = event.data as ShaCancelledEventData;
      // askFromAreas：弃哪两张牌（默认 AI：随机）
      const discarded: Card[] = [];
      for (let i = 0; i < 2; i++) {
        const card = await askFromAreas(game, owner, '贯石斧：弃置一张牌');
        if (!card) break;
        await moveCards(game, {
          to: { zone: 'discardPile' }, cards: [card], reason: 'discard',
        });
        discarded.push(card);
      }
      // card：造成伤害的牌仍是被抵消的那张杀（贯石斧只是令其依然造成伤害）
      await damage(game, { target: defender, source: owner, amount: 1, card: shaCard });
      console.log(
        `  🪓${owner.name} 的贯石斧发动！弃 ${discarded.length} 张牌，杀依然造成伤害`,
      );
    },
  });

  // ============================================================
  // 马匹（白板：距离修正按牌注册常驻效果，见下）
  // ============================================================

  registerBlankHorse(c, CardType.DiLu, '的卢', CardTag.DefensiveHorse);
  registerBlankHorse(c, CardType.ZhuaHuangFeiDian, '爪黄飞电', CardTag.DefensiveHorse);
  registerBlankHorse(c, CardType.DaYuan, '大宛', CardTag.OffensiveHorse);
  registerBlankHorse(c, CardType.ZiXin, '紫骍', CardTag.OffensiveHorse);
  registerBlankHorse(c, CardType.JueYing, '绝影', CardTag.DefensiveHorse);
  registerBlankHorse(c, CardType.ChiTu, '赤兔', CardTag.OffensiveHorse);

  // 八卦阵：需要打出闪时可以先判定，红桃/方块视为出了一张闪；黑色失败可再出闪
  c.skills.registerBareEffect({
    form: 'response',
    equipType: CardType.BaGuaZhen,
    name: '八卦阵',
    respondsTo: CardType.Shan,
    virtualCard: CardType.Shan, // 成功时视为打出一条零牌虚拟【闪】（无花色/点数/颜色）
    canUse: () => true, // 归属（装备八卦阵）由 effects.ts 判定
    selectionPlan: () => ({
      nextStep: () => null,
    }),
    resolve: async (game, player, _request, _answers) => {
      const judgeCard = await judge(game, player);
      if (judgeCard.suit === '♥' || judgeCard.suit === '♦') {
        console.log(`  ☯️${player.name} 的八卦阵判定为红色，视为出了一张闪`);
        return 'done';
      }
      console.log(`  ☯️${player.name} 的八卦阵判定为黑色，未视为闪`);
      return 'retry';
    },
    ai: {
      shouldUse: () => true,
      priority: 110,
    },
  });
}
