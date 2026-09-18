// ============================================================
// 三国杀最小原型 — 锦囊牌（普通锦囊 + 无懈响应）
// ============================================================

import { CardTag, CardType } from '../../types.js';
import type { Card, Player } from '../../types.js';
import type { CardActionFn, CardContentFn } from '../cardRegistry.js';
import { cardRegistry, cardEmoji, cardFaceText } from '../cardRegistry.js';
import { drawCards, moveCards, takeTop } from '../../position/cardActions.js';
import { useCard } from '../../flow/useCard.js';
import { damage, recover } from '../../flow/life.js';
import { distanceTo, attackRange } from '../../flow/distance.js';
import { hasCardsInAreas } from '../../position/areas.js';
import { askForCard, askFromAreas, askFromCards, askForTargets, askOption } from '../../decision/choose.js';
import type { CardEffectEventData, TargetingEventData } from '../../events/index.js';
import { EventType } from '../../events/index.js';
import { effectRegistry } from '../../effects/persistentEffects.js';
import { otherAlive, allAlive } from './helpers.js';
import type { Game } from '../../game.js';
import { resolveJueDouResponse, resolvePlayResponse, resolveUseResponse } from '../../flow/respond.js';

const wuzhongContent: CardContentFn = async (game, data, _event) => {
  const player = data.use.player;
  const before = player.hand.cards.length;
  await drawCards(game, { target: player, count: 2 });
  console.log(
    `  ${player.name} 使用了 📜无中生有 (${cardFaceText(data.card)})，` +
    `摸了 ${player.hand.cards.length - before} 张牌`,
  );
};

const juedouContent: CardContentFn = async (game, data, _event) => {
  const initiator = data.use.player;
  const target = data.to!;
  console.log(
    `  ${initiator.name} 对 ${target.name} 使用了 ⚔️决斗 (${cardFaceText(data.card)})`,
  );

  let current = target;
  let opponent = initiator;

  while (true) {
    // 无双②：每次响应时看对方是否持有无双——持有则需打出两张杀（常驻查询 'juedouShaRequired'；
    // 吕布使用决斗时目标需两张、吕布成为目标时对手需两张；双方都是吕布则双方都需两张）。
    const required = 1 + effectRegistry.sum(game, opponent, 'juedouShaRequired');
    const ok = await resolveJueDouResponse(game, current, required);
    if (!ok) {
      // 打不出杀 → 受伤（失败时点暂无监听者，直接结算）；card = 决斗（造成伤害的牌）
      await damage(game, { target: current, source: opponent, amount: 1, card: data.card });
      return;
    }
    [current, opponent] = [opponent, current];
  }
};

const nanmanContent: CardContentFn = async (game, data, _event) => {
  const target = data.to!;
  if (await resolvePlayResponse(game, target, CardType.Sha)) {
    console.log(`  ${target.name} 打出了 🗡️杀`);
  } else {
    await damage(game, { target, source: data.use.player, amount: 1, card: data.card });
  }
};

const wanjianContent: CardContentFn = async (game, data, _event) => {
  const target = data.to!;
  if (await resolvePlayResponse(game, target, CardType.Shan)) {
    console.log(`  ${target.name} 打出了 🛡️闪`);
  } else {
    await damage(game, { target, source: data.use.player, amount: 1, card: data.card });
  }
};

const taoyuanContent: CardContentFn = async (game, data, _event) => {
  await recover(game, { target: data.to!, amount: 1 });
};

/** 南蛮/万箭/桃园：整张牌只喊一次口号（逐目标由引擎驱动） */
const shoutNanman: CardActionFn = async (_game, data, _event, phase) => {
  if (phase !== 'before') return;
  console.log(
    `  ${data.player.name} 使用了 🐘南蛮入侵 (${cardFaceText(data.card)})！所有其他角色必须打出杀`,
  );
};

const shoutWanjian: CardActionFn = async (_game, data, _event, phase) => {
  if (phase !== 'before') return;
  console.log(
    `  ${data.player.name} 使用了 🏹万箭齐发 (${cardFaceText(data.card)})！所有其他角色必须打出闪`,
  );
};

const shoutTaoyuan: CardActionFn = async (_game, data, _event, phase) => {
  if (phase !== 'before') return;
  console.log(
    `  ${data.player.name} 使用了 🌸桃园结义 (${cardFaceText(data.card)})！所有角色回复 1 点体力`,
  );
};

/** 五谷丰登：整张牌亮牌一次（牌池放 use.extra），逐目标各自选一张 */
const revealWugu: CardActionFn = async (game, data, _event, phase) => {
  if (phase !== 'before') return;
  const alive = game.state.players.filter((p) => p.alive).length;
  const revealed = await takeTop(game, alive, { zone: 'processing' }, 'reveal');
  data.extra = { ...data.extra, pool: revealed };
  console.log(`  ${data.player.name} 使用了 🌾五谷丰登！亮出 ${revealed.length} 张牌`);
  for (const c of revealed) {
    console.log(`    ${cardEmoji(c.type)}(${cardFaceText(c)})`);
  }
};

const wuguContent: CardContentFn = async (game, data, _event) => {
  const pool = (data.use.extra?.pool as Card[] | undefined) ?? [];
  const player = data.to!;
  if (pool.length === 0) return;
  const card = await askFromCards(game, player, '五谷丰登：选择一张牌', pool);
  if (!card) return;
  await moveCards(game, {
    to: { player, zone: 'hand' }, cards: [card], reason: 'obtain',
  });
  pool.splice(pool.indexOf(card), 1);
};

/** 五谷收尾：亮出但没人要的牌进弃牌堆 */
const settleWugu: CardActionFn = async (game, data, _event, phase) => {
  if (phase !== 'after') return;
  const pool = (data.extra?.pool as Card[] | undefined) ?? [];
  if (pool.length > 0) {
    await moveCards(game, {
      to: { zone: 'discardPile' }, cards: [...pool], reason: 'discard',
    });
    console.log(`  剩余 ${pool.length} 张进弃牌堆`);
  }
  data.extra = {};
};

const guoheContent: CardContentFn = async (game, data, _event) => {
  const user = data.use.player;
  const target = data.to!;
  console.log(
    `  ${user.name} 对 ${target.name} 使用了 🌉过河拆桥，弃置其区域内的一张牌`,
  );

  // askFromAreas：弃置目标区域内哪张牌（默认 AI：随机）
  const card = await askFromAreas(game, target, '过河拆桥：弃置目标一张牌');
  if (!card) return;
  await moveCards(game, {
    to: { zone: 'discardPile' }, cards: [card], reason: 'discard',
  });
  console.log(
    `  弃置了 ${cardEmoji(card.type)} (${cardFaceText(card)})`,
  );
};

const shunshouContent: CardContentFn = async (game, data, _event) => {
  const user = data.use.player;
  const target = data.to!;
  console.log(
    `  ${user.name} 对 ${target.name} 使用了 🐑顺手牵羊，获得其区域内的一张牌`,
  );

  // askFromAreas：获得目标区域内哪张牌（默认 AI：随机）
  const card = await askFromAreas(game, target, '顺手牵羊：获得目标一张牌');
  if (!card) return;
  await moveCards(game, {
    to: { player: user, zone: 'hand' }, cards: [card], reason: 'give',
  });
  console.log(
    `  获得了 ${cardEmoji(card.type)} (${cardFaceText(card)})`,
  );
};

const jiedaoContent: CardContentFn = async (game, data, _event) => {
  const user = data.use.player;
  const target = data.to!;
  const weapon = target.equipment.weapon;
  if (!weapon) return;

  console.log(
    `  ${user.name} 对 ${target.name} 使用了 🗡️借刀杀人，令其对他人使用杀或交出武器`,
  );

  // ── 决策①（借刀使用者）：指定被杀的目标 ────────────────────────
  // 规则：目标（被借刀者）攻击范围内、杀对其合法（复用杀 targetFilter），
  // 且不含借刀使用者本人（维持现状的简化，规则文本待核）。
  // AI 决策点（真人/前端接入时在此注入）：默认取座次第一个合法角色。
  const shaDef = cardRegistry.get(CardType.Sha)!;
  const candidates = shaDef.targetFilter(game, target, game.state.players)
    .filter((p) => p !== user);
  const picked = candidates.length > 0
    ? await askForTargets(game, user, '借刀杀人：指定目标要杀的角色', candidates, 1)
    : null;
  const victim = picked?.[0] ?? null;

  // ── 决策②（被借刀者）：对 victim 出杀，还是交出武器 ──────────────
  // 规则：无杀或无法对 victim 使用杀 → 只能交出武器（不出选择）；
  // 有杀且有 victim → 两者皆可选。
  // AI 决策点（真人/前端接入时在此注入）：默认"出杀"以保住武器（与旧行为一致）。
  const hasSha = target.hand.cards.some((c) => c.type === CardType.Sha);
  let wantToSlay = false;
  if (victim && hasSha) {
    const choice = await askOption(game, target, '借刀杀人：如何响应', [
      { value: 'sha', label: `对 ${victim.name} 使用一张杀` },
      { value: 'give', label: '交出武器' },
    ], (ctx) => [ctx.step.options.find((o) => o.id === 'sha')!]);
    wantToSlay = choice === 'sha';
  }

  if (wantToSlay && victim) {
    // 决策③（被借刀者）：出哪张杀（默认 AI：第一张）；选牌本身不再额外询问
    const sha = await askForCard(game, target, '借刀杀人：使用哪张杀', [CardType.Sha]);
    if (sha) {
      await useCard(game, { player: target, card: sha, targets: [victim] });
      console.log(
        `  🗡️ ${target.name} 响应【借刀杀人】，对 ${victim.name} 使用了杀`,
      );
      return;
    }
  }

  // 交出武器
  await moveCards(game, {
    to: { player: user, zone: 'hand' }, cards: [weapon], reason: 'give',
  });
  console.log(
    `  🗡️ ${target.name} 选择交出武器，${cardEmoji(weapon.type)} 到了 ${user.name} 手上`,
  );
};

/**
 * 无懈可击的 content：把它所**响应的那次生效**置为 cancelled（adr/0006：响应关系显式记录，
 * 不再靠事件栈反查）。无懈本身也是一次"无目标使用"，因此它同样可以被响应（反无懈）——
 * 后出的无懈在前一个的 `cardEffect.before` 窗口里被使用，其 content 给前一个的生效事件置位。
 *
 * 遗留分支（冻结）：判定阶段的窗口仍是 targeting 事件（judgePhase 自建），此时没有响应对象，
 * 沿事件栈找最近的 targeting 置位（行为与旧实现一致）。
 */
const wuxieContent: CardContentFn = async (_game, data, event) => {
  if (data.use.responseTo) {
    data.use.responseTo.cancelled = true;
    return;
  }
  const targetEvent = event.getParent(EventType.Targeting);
  if (targetEvent) {
    targetEvent.data.cancelled = true;
  }
};

/**
 * 默认无懈 AI 决策（写死，行为保持）：某玩家是否对本次生效出无懈。
 * 策略：只保护自己——仅当自己是该次生效的目标时响应；不反无懈——普通窗口下
 * 不对别人（含自己刚出的）无懈出反无懈。
 * （judging = 判定阶段的延时锦囊窗口：允许被判定者抵消自己的延时锦囊。）
 * AI 决策点（真人/前端接入时在此注入）：换更强策略（保护他人 / 反无懈 / 按锦囊利害取舍）时改此处。
 */
function wuxieGuardPolicy(
  player: Player,
  target: Player | undefined,
  user: Player,
  judging: boolean | undefined,
): boolean {
  if (target !== player) return false;            // 只保护自己（无目标生效 → 无人响应）
  if (!judging && user === player) return false;  // 不反自己的无懈
  return true;
}

/** 询问一圈（从当前回合角色起按座次）：是否有人对"某次生效 / 判定窗口"使用无懈 */
async function askWuxie(
  game: Game,
  target: Player | undefined,
  user: Player,
  judging: boolean | undefined,
  respondTo: CardEffectEventData | undefined,
): Promise<void> {
  const players = game.state.players;
  const startIndex = game.state.currentIndex;
  for (let offset = 0; offset < players.length; offset++) {
    const player = players[(startIndex + offset) % players.length];
    if (!player.alive) continue;
    if (!wuxieGuardPolicy(player, target, user, judging)) continue;

    // 使用型响应窗口：真无懈 + 放弃（响应对象随请求下传 → 无懈 content 据此置 cancelled）
    const ok = await resolveUseResponse(game, player, {
      type: 'use',
      cardType: CardType.WuXie,
      respondTo,
    });
    if (!ok) continue;
    console.log(
      `  ✨${player.name} 使用 🛡️无懈可击 抵消对 ${target?.name ?? '此效果'} 的效果`,
    );

    // 无论无懈成功或被反无懈，只尝试一次就停止
    break;
  }
}

/**
 * 注册无懈可击 trigger handler（挂到指定对局的触发器注册表）。
 *
 * 主窗口 = **每次单目标生效之前**（`cardEffect.before`）：无懈抵消的是"一张牌对某个目标的效果"，
 * 而不是"目标指定"；无懈自身的一次无目标使用同样会产生 cardEffect，其 `cardEffect.before`
 * 就是反无懈窗口（响应对象随之链式传递，反无懈由递归自然形成）。
 * 事件级 `unoffsetable`（如离间的决斗）声明"整条牌不可被无懈响应" → 不开窗。
 * 遗留（冻结）：判定阶段窗口仍挂在 targeting 事件上（judgePhase 自建，无响应对象）。
 */
export function installWuxieTrigger(game: Game): void {
  game.triggerSystem.on(`${EventType.CardEffect}.before`, async (effectEvent) => {
    const effect = effectEvent.data as CardEffectEventData;
    const def = cardRegistry.get(effect.card.type);
    if (!def?.tags.includes(CardTag.Trick)) return;
    if (effect.use.unoffsetable || effect.unoffsetable) return; // 不可被无懈响应
    if (effect.cancelled || effect.nullified) return;            // 已被抵消 / 已无效

    await askWuxie(game, effect.to, effect.use.player, undefined, effect);
  });

  // 遗留：判定阶段的无懈窗口（judgePhase 的 targeting 事件；冻结，待无懈重设计）
  game.triggerSystem.on(`${EventType.Targeting}.before`, async (targetingEvent) => {
    const { user, card, target, judging } = targetingEvent.data as TargetingEventData;
    if (!judging) return;
    const def = cardRegistry.get(card.type);
    if (!def?.tags.includes(CardTag.Trick)) return;

    await askWuxie(targetingEvent.game, target, user, judging, undefined);
  });
}

// ============================================================
// 注册
// ============================================================

cardRegistry.register({
  type: CardType.WuZhong,
  name: '无中生有',
  emoji: '📜',
  content: wuzhongContent,
  tags: [CardTag.Trick],
  canUse: () => true,
  targetFilter: (_game, user) => [user],
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 80,
    discardPriority: 2,
  },
});

cardRegistry.register({
  type: CardType.JueDou,
  name: '决斗',
  emoji: '⚔️',
  content: juedouContent,
  tags: [CardTag.Trick],
  canUse: (game, player, allPlayers) =>
    allPlayers.some((p) => p !== player && p.alive && !effectRegistry.has(game, p, 'immuneJueDou')),
  targetFilter: (game, user, allPlayers) =>
    allPlayers.filter((p) => p !== user && p.alive && !effectRegistry.has(game, p, 'immuneJueDou')),
  targetCount: 1,
  ai: {
    shouldUse: (player) => player.hand.cards.some((c) => c.type === CardType.Sha), // AI：有杀垫底才决斗
    usePriority: 70,
    discardPriority: 0,
  },
});

cardRegistry.register({
  type: CardType.NanMan,
  name: '南蛮入侵',
  emoji: '🐘',
  content: nanmanContent,
  onAction: shoutNanman,
  tags: [CardTag.Trick],
  canUse: () => true,
  targetFilter: otherAlive,
  targetCount: 'all',
  ai: {
    shouldUse: () => true,
    usePriority: 75,
    discardPriority: 0,
  },
});

cardRegistry.register({
  type: CardType.WanJian,
  name: '万箭齐发',
  emoji: '🏹',
  content: wanjianContent,
  onAction: shoutWanjian,
  tags: [CardTag.Trick],
  canUse: () => true,
  targetFilter: otherAlive,
  targetCount: 'all',
  ai: {
    shouldUse: () => true,
    usePriority: 75,
    discardPriority: 0,
  },
});

cardRegistry.register({
  type: CardType.TaoYuan,
  name: '桃园结义',
  emoji: '🌸',
  content: taoyuanContent,
  onAction: shoutTaoyuan,
  tags: [CardTag.Trick],
  canUse: () => true,
  targetFilter: allAlive,
  targetCount: 'all',
  ai: {
    // AI：自己受伤才值得放（也会回敌人的血）
    shouldUse: (player) => player.hp < player.maxHp,
    usePriority: 85,
    discardPriority: 3,
  },
});

/**
 * 五谷丰登的目标：从使用者起按座次（行动顺序）——依次选牌的顺序即结算顺序。
 */
function wuguOrder(_game: Game, user: Player, all: Player[]): Player[] {
  const start = all.indexOf(user);
  const out: Player[] = [];
  for (let offset = 0; offset < all.length; offset++) {
    const p = all[(start + offset) % all.length];
    if (p.alive) out.push(p);
  }
  return out;
}

cardRegistry.register({
  type: CardType.WuGu,
  name: '五谷丰登',
  emoji: '🌾',
  content: wuguContent,
  onAction: (game, data, event, phase) => (phase === 'before'
    ? revealWugu(game, data, event, phase)
    : settleWugu(game, data, event, phase)),
  tags: [CardTag.Trick],
  canUse: () => true,
  targetFilter: wuguOrder,
  targetCount: 'all',
  ai: {
    shouldUse: () => true,
    usePriority: 75,
    discardPriority: 2,
  },
});

cardRegistry.register({
  type: CardType.JieDao,
  name: '借刀杀人',
  emoji: '🗡️',
  content: jiedaoContent,
  tags: [CardTag.Trick],
  canUse: (game, player, allPlayers) =>
    allPlayers.some((p) => p !== player && p.alive && !!p.equipment.weapon),
  targetFilter: (game, user, allPlayers) =>
    allPlayers.filter((p) => p !== user && p.alive && !!p.equipment.weapon),
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 55,
    discardPriority: 2,
  },
});

cardRegistry.register({
  type: CardType.GuoHe,
  name: '过河拆桥',
  emoji: '🌉',
  content: guoheContent,
  tags: [CardTag.Trick],
  canUse: (game, player, allPlayers) =>
    // 规则：存在区域内有牌的目标（无距离限制）
    allPlayers.some((p) => p !== player && p.alive && hasCardsInAreas(p)),
  targetFilter: (game, user, allPlayers) =>
    allPlayers.filter((p) => p !== user && p.alive && hasCardsInAreas(p)),
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 65,
    discardPriority: 2,
  },
});

cardRegistry.register({
  type: CardType.ShunShou,
  name: '顺手牵羊',
  emoji: '🐑',
  content: shunshouContent,
  tags: [CardTag.Trick],
  canUse: (game, player, allPlayers) =>
    // 规则：存在距离为 1（或奇才无视距离）且区域内有牌的目标
    allPlayers.some((p) => p !== player && p.alive && hasCardsInAreas(p)
      && (effectRegistry.has(game, player, 'noTrickDistance') || distanceTo(game, player, p) <= 1)
      && !effectRegistry.has(game, p, 'immuneShunShou')),
  targetFilter: (game, user, allPlayers) =>
    allPlayers.filter((p) => p !== user && p.alive && hasCardsInAreas(p)
      && (effectRegistry.has(game, user, 'noTrickDistance') || distanceTo(game, user, p) <= 1)
      && !effectRegistry.has(game, p, 'immuneShunShou')),
  targetCount: 1,
  ai: {
    shouldUse: () => true,
    usePriority: 65,
    discardPriority: 2,
  },
});

cardRegistry.register({
  type: CardType.WuXie,
  name: '无懈可击',
  emoji: '🛡️',
  content: wuxieContent,
  tags: [CardTag.Trick],
  canUse: () => false, // 规则：无懈不可在出牌阶段主动使用（由响应 trigger 调用）
  targetFilter: () => [],
  targetCount: 0,
  ai: {
    shouldUse: () => false,
    usePriority: 0,
    discardPriority: 100, // 尽量保留在手牌中
  },
});
