// ============================================================
// 三国杀最小原型 — 装备牌（武器 / 防具 / 马）
// ============================================================

import { CardTag, CardType } from '../types.js';
import type { Card } from '../types.js';
import { cardRegistry, cardEmoji } from '../cardRegistry.js';
import { discardCards, drawCards, moveCards } from '../cardActions.js';
import type { DamageEventData, TargetingEventData } from '../events/index.js';
import { EventType } from '../events/index.js';
import { effectRegistry } from '../persistentEffects.js';
import { hasCardsInAreas, selectCardFromAreas } from '../areas.js';

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
      // 弃置目标一张坐骑（简化：优先防御马）
      const eq = target.equipment;
      // TODO(玩家选择): 弃置目标的哪张坐骑——目前写死为"优先防御马"
      const mount = eq.defensiveHorse ?? eq.offensiveHorse;
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
      // prevent() 抛异常，之后的代码不会执行，所以必须先弃牌再 prevent。
      const discarded: Card[] = [];
      for (let i = 0; i < 2; i++) {
        // TODO(玩家选择): 依次弃置哪两张区域牌——目前写死为随机
        const card = selectCardFromAreas(target);
        if (!card) break;
        await moveCards(game, {
          to: { zone: 'discardPile' }, cards: [card], reason: 'discard',
        });
        discarded.push(card);
      }
      console.log(
        `  ✨${owner.name} 的寒冰剑发动！防止 ${target.name} 受到伤害，弃置 ${discarded.length} 张牌`,
      );
      event.prevent();
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
      event.prevent(); // targeting 时取消目标
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
      // TODO(玩家选择): 目标选择"弃一张手牌"还是"令使用者摸一张牌"——写死为优先弃牌
      if (target.hand.length > 0) {
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
registerBlankWeapon(CardType.QingLongYanYueDao, '青龙偃月刀', '🗡️', 3);
registerBlankWeapon(CardType.ZhangBaSheMao, '丈八蛇矛', '🔱', 3);
registerBlankWeapon(CardType.GuanShiFu, '贯石斧', '🪓', 3);
registerBlankWeapon(CardType.FangTianHuaJi, '方天画戟', '🔱', 4);

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
