// ============================================================
// 张飞 — 咆哮（锁定技：出牌阶段使用【杀】没有数量限制）
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';

import { freshGame, giveHand } from '../test-utils.js';

import { playPhase } from '../gameFlow.js';

import { effectRegistry } from '../persistentEffects.js';
import { registerSkills } from '../skills.js';
import { triggerSystem } from '../events/index.js';

import { CardType } from '../types.js';

afterEach(() => triggerSystem.clear());

describe('咆哮（张飞锁定技）', () => {
  it('effectRegistry：张飞拥有 unlimitedSha，普通角色没有', () => {
    const g = freshGame({}, ['刘备', '张飞', '孙权']);
    const zhangfei = g.state.players[1];
    const liubei = g.state.players[0];

    expect(effectRegistry.has(zhangfei, 'unlimitedSha')).toBe(true);
    expect(effectRegistry.has(liubei, 'unlimitedSha')).toBe(false);
  });

  it('张飞出牌阶段使用杀没有数量限制', async () => {
    registerSkills();
    const g = freshGame({}, ['刘备', '张飞', '孙权']);
    const zhangfei = g.state.players[1];
    const target = g.state.players[0];
    giveHand(zhangfei, CardType.Sha, CardType.Sha, CardType.Sha);
    const hpBefore = target.hp;

    await playPhase(g, { player: zhangfei });

    expect(target.hp).toBe(hpBefore - 3); // 三张杀全部打出
    expect(zhangfei.hand.length).toBe(0);
  });

  it('普通武将使用杀仍限一次', async () => {
    registerSkills();
    const g = freshGame(); // 默认 刘备/曹操/孙权
    const player = g.state.players[0];
    const target = g.state.players[1];
    giveHand(player, CardType.Sha, CardType.Sha);
    const hpBefore = target.hp;

    await playPhase(g, { player });

    expect(target.hp).toBe(hpBefore - 1); // 只出一张
    expect(player.hand.length).toBe(1);
  });

  it('装备诸葛连弩后也无次数限制（同 kind 多来源）', async () => {
    registerSkills();
    const g = freshGame();
    const player = g.state.players[0];
    const target = g.state.players[1];
    giveHand(player, CardType.ZhugeLianNu, CardType.Sha, CardType.Sha);
    const hpBefore = target.hp;

    await playPhase(g, { player });

    // AI：杀(60) 优先 → 装弩(45) → 第二张杀可出（unlimitedSha 来自装备）
    expect(target.hp).toBe(hpBefore - 2);
    expect(player.hand.length).toBe(0);
    expect(player.equipment.weapon?.type).toBe(CardType.ZhugeLianNu);
  });
});
