// ============================================================
// 三国杀最小原型 — 装备牌（武器 / 防具 / 马）
// ============================================================

import { CardTag, CardType } from '../types.js';
import type { Card, UsedCard } from '../types.js';
import { cardRegistry, cardEmoji } from '../cardRegistry.js';
import { discardCards, drawCards, moveCards, useCard, judge } from '../cardActions.js';
import type { DamageEventData, ShaCancelledEventData, TargetingEventData } from '../events/index.js';
import { EventType } from '../events/index.js';
import {
  askForCard,
  askFromAreas,
  askYesNo,
  handCardsStep,
  targetsStep,
  computeTargetOptions,
  selectedCards,
  selectedPlayers,
} from '../choose.js';
import { conversionRegistry } from '../conversions.js';
import { responseRuleRegistry } from '../responses.js';
import { damage } from '../life.js';
import { effectRegistry } from '../persistentEffects.js';
import { cardsInAreas, hasCardsInAreas } from '../areas.js';

cardRegistry.register({
  type: CardType.ZhugeLianNu,
  name: '诸葛连弩',
  emoji: '🪓',
  content: async () => {}, // 无使用效果（持续效果在 effectRegistry 注册）
  tags: [CardTag.Equip, CardTag.Weapon],
  range: 1,
  canUse: () => true,
  targetFilter: (user) => [user],
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 45,
    discardPriority: 100, // 装备尽量保留
  },
});

effectRegistry.register({
  kind: 'unlimitedSha',
  value: (player) => (player.equipment.weapon?.type === CardType.ZhugeLianNu ? 1 : 0),
});

cardRegistry.register({
  type: CardType.BaGuaZhen,
  name: '八卦阵',
  emoji: '☯️',
  content: async () => {}, // 白板：持续效果（判定出闪）待常驻效果系统
  tags: [CardTag.Equip, CardTag.Armor],
  canUse: () => true,
  targetFilter: (user) => [user],
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 45,
    discardPriority: 100,
  },
});

// 马匹槽位距离修正（按槽位注册，所有马自动覆盖）
effectRegistry.register({
  kind: 'defensiveDistance',
  value: (player) => (player.equipment.defensiveHorse ? 1 : 0),
});
effectRegistry.register({
  kind: 'offensiveDistance',
  value: (player) => (player.equipment.offensiveHorse ? 1 : 0),
});

cardRegistry.register({
  type: CardType.QiLinGong,
  name: '麒麟弓',
  emoji: '🎯',
  content: async () => {}, // 无使用效果（触发效果在 equipTrigger）
  equipTrigger: {
    trigger: 'damage.after',
    canTrigger: (game, event, owner) => {
      const useCard = event.getParent(EventType.UseCard);
      if (!useCard || useCard.data.player !== owner) return false;
      if (useCard.data.card.type !== CardType.Sha) return false;
      const { target } = event.data as DamageEventData;
      return !!target && !!(target.equipment.defensiveHorse || target.equipment.offensiveHorse);
    },
    content: async (game, event, owner) => {
      const { target } = event.data as DamageEventData;
      if (!target) return;
      // askFromAreas：弃置目标一张坐骑（默认 AI：随机；原简化"优先防御马"）
      const mount = await askFromAreas(
        game, target, '麒麟弓：弃置目标一张坐骑', ['equipment'],
        (c) => !!cardRegistry.get(c.type)?.tags.some(
          (t) => t === CardTag.DefensiveHorse || t === CardTag.OffensiveHorse,
        ),
      );
      if (!mount) return;
      await moveCards(game, {
        to: { zone: 'discardPile' }, cards: [mount], reason: 'discard',
      });
      console.log(
        `  ✨${owner.name} 的麒麟弓发动！弃置 ${target.name} 的坐骑 ${cardEmoji(mount.type)}`,
      );
    },
  },
  tags: [CardTag.Equip, CardTag.Weapon],
  range: 5,
  canUse: () => true,
  targetFilter: (user) => [user],
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 45,
    discardPriority: 100,
  },
});

cardRegistry.register({
  type: CardType.HanBingJian,
  name: '寒冰剑',
  emoji: '❄️',
  content: async () => {}, // 无使用效果（触发效果在 equipTrigger）
  equipTrigger: {
    trigger: 'damage.before',
    canTrigger: (game, event, owner) => {
      const useCard = event.getParent(EventType.UseCard);
      if (!useCard || useCard.data.player !== owner) return false;
      if (useCard.data.card.type !== CardType.Sha) return false;
      const { target } = event.data as DamageEventData;
      if (!target) return false;
      return hasCardsInAreas(target); // 目标区域内有能被弃置的牌
    },
    content: async (game, event, owner) => {
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
  },
  tags: [CardTag.Equip, CardTag.Weapon],
  range: 2,
  canUse: () => true,
  targetFilter: (user) => [user],
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 45,
    discardPriority: 100,
  },
});

cardRegistry.register({
  type: CardType.RenWangDun,
  name: '仁王盾',
  emoji: '🔰',
  content: async () => {}, // 无使用效果（触发效果在 equipTrigger）
  equipTrigger: {
    trigger: 'targeting.before',
    canTrigger: (game, event, owner) => {
      const { card, target } = event.data as TargetingEventData;
      if (target !== owner) return false; // 只保护装备者自己
      if (card.type !== CardType.Sha) return false;
      // 黑色杀（♠/♣）对装备者无效
      return card.suit === '♠' || card.suit === '♣';
    },
    content: async (game, event, owner) => {
      const { card, target } = event.data as TargetingEventData;
      console.log(
        `  🔰${owner.name} 的仁王盾发动！黑色 ${cardEmoji(card.type)} 对其无效`,
      );
      event.data.cancelled = true; // targeting 时取消目标
    },
  },
  tags: [CardTag.Equip, CardTag.Armor],
  canUse: () => true,
  targetFilter: (user) => [user],
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 45,
    discardPriority: 100,
  },
});

cardRegistry.register({
  type: CardType.CiXiongShuangGuJian,
  name: '雌雄双股剑',
  emoji: '⚔️',
  content: async () => {}, // 无使用效果（触发效果在 equipTrigger）
  equipTrigger: {
    trigger: 'targeting.after',
    canTrigger: (game, event, owner) => {
      const { user, card, target } = event.data as TargetingEventData;
      if (user !== owner) return false; // 只有装备者使用牌时触发
      if (card.type !== CardType.Sha) return false;
      return target.hero.sex !== owner.hero.sex; // 指定异性目标后
    },
    content: async (game, event, owner) => {
      const { target } = event.data as TargetingEventData;
      // askYesNo：目标选择"弃一张手牌"还是"令使用者摸一张牌"
      // （默认 AI：有手牌则弃牌，否则令使用者摸牌）
      const discardHand = await askYesNo(
        game, target, `是否弃置一张手牌（否则 ${owner.name} 摸一张牌）`, target.hand.length > 0,
      );
      if (discardHand && target.hand.length > 0) {
        await discardCards(game, target, [target.hand[0]]);
        console.log(
          `  ⚔️${owner.name} 的雌雄双股剑发动！${target.name} 弃置了一张手牌`,
        );
      } else {
        await drawCards(game, { target: owner, count: 1 });
        console.log(`  ⚔️${owner.name} 的雌雄双股剑发动！摸了一张牌`);
      }
    },
  },
  tags: [CardTag.Equip, CardTag.Weapon],
  range: 2,
  canUse: () => true,
  targetFilter: (user) => [user],
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 45,
    discardPriority: 100,
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

function registerBlankWeapon(
  type: CardType, name: string, emoji: string, range: number,
): void {
  cardRegistry.register({
    type, name, emoji,
    content: async () => {}, // 白板：触发效果待对应系统
    tags: [CardTag.Equip, CardTag.Weapon],
    range,
    canUse: () => true,
    targetFilter: (user) => [user],
    targetCount: 1,
    ai: {
      shouldUse: () => true,
      usePriority: 45,
      discardPriority: 100, // 装备尽量保留
    },
  });
}

registerBlankWeapon(CardType.QingGangJian, '青釭剑', '🗡️', 2);
registerBlankWeapon(CardType.ZhangBaSheMao, '丈八蛇矛', '🔱', 3);
registerBlankWeapon(CardType.FangTianHuaJi, '方天画戟', '🔱', 4);

// 丈八蛇矛：两张手牌当杀
conversionRegistry.register({
  name: '丈八蛇矛',
  toType: CardType.Sha,
  canUse: (game, player, shaUsed) => {
    const def = cardRegistry.get(CardType.Sha)!;
    return player.equipment.weapon?.type === CardType.ZhangBaSheMao
      && player.hand.length >= 2
      && def.canUse(player, game.state.players, shaUsed);
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
    shouldUse: (_game, player, shaUsed) => {
      const def = cardRegistry.get(CardType.Sha)!;
      return def.ai.shouldUse(player, shaUsed);
    },
    usePriority: cardRegistry.get(CardType.Sha)!.ai.usePriority,
  },
});

function makeZhangbaSha(sources: Card[]): UsedCard {
  const source = sources[0];
  return {
    type: CardType.Sha,
    name: '杀',
    suit: source.suit,
    number: source.number,
    physicalCards: sources,
  };
}

// 青龙偃月刀：杀被闪抵消后，可以对相同的目标再使用一张杀（AI：有杀就再出）
cardRegistry.register({
  type: CardType.QingLongYanYueDao,
  name: '青龙偃月刀',
  emoji: '🗡️',
  content: async () => {}, // 无使用效果（触发效果在 equipTrigger）
  equipTrigger: {
    trigger: 'shaCancelled.after',
    canTrigger: (game, event, owner) => {
      const { attacker } = event.data as ShaCancelledEventData;
      if (attacker !== owner) return false; // 只有装备者使用的杀被抵消
      return owner.hand.some((c) => c.type === CardType.Sha); // AI：有杀才再出（发动询问接入前简化）
    },
    content: async (game, event, owner) => {
      const { defender } = event.data as ShaCancelledEventData;
      // askForCard：是否再出杀/出哪张（默认 AI：有就出第一张）
      const sha = await askForCard(game, owner, '青龙偃月刀：是否再次使用杀', [CardType.Sha]);
      if (!sha) return;
      await useCard(game, { player: owner, card: sha, targets: [defender] });
      console.log(`  🗡️${owner.name} 的青龙偃月刀发动，对 ${defender.name} 再次使用杀`);
    },
  },
  tags: [CardTag.Equip, CardTag.Weapon],
  range: 3,
  canUse: () => true,
  targetFilter: (user) => [user],
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 45,
    discardPriority: 100,
  },
});

// 贯石斧：杀被闪抵消后，弃置两张牌令此杀依然造成伤害
cardRegistry.register({
  type: CardType.GuanShiFu,
  name: '贯石斧',
  emoji: '🪓',
  content: async () => {}, // 无使用效果（触发效果在 equipTrigger）
  equipTrigger: {
    trigger: 'shaCancelled.after',
    canTrigger: (game, event, owner) => {
      const { attacker } = event.data as ShaCancelledEventData;
      return attacker === owner && cardsInAreas(owner).length >= 2; // 需弃两张牌
    },
    content: async (game, event, owner) => {
      const { defender } = event.data as ShaCancelledEventData;
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
      await damage(game, { target: defender, source: owner, amount: 1 });
      console.log(
        `  🪓${owner.name} 的贯石斧发动！弃 ${discarded.length} 张牌，杀依然造成伤害`,
      );
    },
  },
  tags: [CardTag.Equip, CardTag.Weapon],
  range: 3,
  canUse: () => true,
  targetFilter: (user) => [user],
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 45,
    discardPriority: 100,
  },
});

// ============================================================
// 马匹（白板：距离修正由槽位 effectRegistry 自动生效）
// ============================================================

function registerBlankHorse(
  type: CardType, name: string, tag: CardTag.DefensiveHorse | CardTag.OffensiveHorse,
): void {
  cardRegistry.register({
    type, name, emoji: '🐎',
    content: async () => {}, // 白板：距离修正由槽位 effectRegistry 处理
    tags: [CardTag.Equip, tag],
    canUse: () => true,
    targetFilter: (user) => [user],
    targetCount: 1,
    ai: {
      shouldUse: () => true,
      usePriority: 45,
      discardPriority: 100, // 装备尽量保留
    },
  });
}

registerBlankHorse(CardType.DiLu, '的卢', CardTag.DefensiveHorse);
registerBlankHorse(CardType.ZhuaHuangFeiDian, '爪黄飞电', CardTag.DefensiveHorse);
registerBlankHorse(CardType.DaYuan, '大宛', CardTag.OffensiveHorse);
registerBlankHorse(CardType.ZiXin, '紫骍', CardTag.OffensiveHorse);
registerBlankHorse(CardType.JueYing, '绝影', CardTag.DefensiveHorse);
registerBlankHorse(CardType.ChiTu, '赤兔', CardTag.OffensiveHorse);

// 八卦阵：需要打出闪时可以先判定，红桃/方块视为出了一张闪；黑色失败可再出闪
responseRuleRegistry.register({
  name: '八卦阵',
  respondsTo: CardType.Shan,
  canUse: (_game, player) => player.equipment.armor?.type === CardType.BaGuaZhen,
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
