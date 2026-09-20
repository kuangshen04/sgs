// ============================================================
// 三国杀最小原型 — game.ts 单元测试
// 引擎容器：游戏初始化 / 胜利条件
// （标包装配、牌堆、体力操作、牌移动原语的测试已拆到对应模块：
//   content/standardPack.test.ts / deck.test.ts / life.test.ts / cardActions.test.ts）
// ============================================================

import { describe, it, expect } from 'vitest';

import { createGame, lastManStanding } from './game.js';
import { createStandardContainer } from './content/standardPack.js';
import { buildStandardDeck } from './content/deck.js';

import { freshGame, DEFAULT_HEROES, standardRuleSet } from './test-utils.js';


// ============================================================
// 游戏初始化
// ============================================================

describe('createGame', () => {
  // 显式装配：容器 + 牌堆（没有隐式默认装配）
  function newGame(heroNames: string[] = DEFAULT_HEROES) {
    const ruleSet = createStandardContainer();
    return createGame(buildStandardDeck(ruleSet), heroNames, { ruleSet });
  }

  it('规则集可查询已注册武将', () => {
    expect(standardRuleSet().heroes.get('刘备')?.skills).toContain('仁德');
    expect(standardRuleSet().heroes.get('郭嘉')?.maxHp).toBe(3);
    expect(standardRuleSet().heroes.get('刘备')?.sex).toBe('male');
    expect(standardRuleSet().heroes.get('刘备')?.group).toBe('蜀');
    expect(standardRuleSet().heroes.get('甄宓')?.sex).toBe('female');
    expect(standardRuleSet().heroes.get('貂蝉')?.group).toBe('群');
    expect(standardRuleSet().heroes.get('不存在')).toBeUndefined();
  });

  it('创建指定数量的玩家', () => {
    const g = newGame();
    expect(g.state.players.length).toBe(3);
    expect(g.state.players[0].name).toBe('刘备');
    expect(g.state.players[1].name).toBe('曹操');
    expect(g.state.players[2].name).toBe('孙权');
  });

  it('每个玩家初始 4 张手牌', () => {
    const g = newGame();
    for (const p of g.state.players) {
      expect(p.hand.cards.length).toBe(4);
    }
  });

  it('初始状态正确', () => {
    const g = newGame();
    expect(g.state.round).toBe(1);
    expect(g.state.currentIndex).toBe(0);
    expect(g.state.gameOver).toBe(false);
    expect(g.state.winner).toBeNull();
    // 108 - 3人×4 = 96
    expect(g.state.deck.cards.length).toBe(96);
    expect(g.state.discardPile.cards.length).toBe(0);
  });

  it('局内牌 id 唯一', () => {
    const g = newGame();
    const ids = new Set(g.state.deck.cards.map((c) => c.id));
    expect(ids.size).toBe(g.state.deck.cards.length);
  });

  it('同名英雄可重复（三个郭嘉）', () => {
    const g = newGame(['郭嘉', '郭嘉', '郭嘉']);
    expect(g.state.players.length).toBe(3);
    expect(g.state.players.every((p) => p.hero.name === '郭嘉')).toBe(true);
    expect(g.state.players.every((p) => p.hero.skills?.includes('遗计'))).toBe(true);
    expect(g.state.players.every((p) => p.hero.sex === 'male' && p.hero.group === '魏')).toBe(true);
    // 同名英雄持有独立的 hero 副本
    expect(g.state.players[0].hero).not.toBe(g.state.players[1].hero);
  });

  it('未注册的英雄名 → 抛错', () => {
    expect(() => newGame(['不存在'])).toThrow(/not in this rule set/);
  });
});

// ============================================================
// 胜利条件
// ============================================================

describe('lastManStanding', () => {
  it('只有 1 人存活 → 返回该玩家', () => {
    const g = freshGame();
    g.state.players[0].alive = true;
    g.state.players[1].alive = false;
    g.state.players[2].alive = false;
    const winner = lastManStanding(g.state);
    expect(winner).toBe(g.state.players[0]);
  });

  it('多人存活 → 返回 null', () => {
    const g = freshGame();
    g.state.players[0].alive = true;
    g.state.players[1].alive = true;
    g.state.players[2].alive = false;
    expect(lastManStanding(g.state)).toBeNull();
  });

  it('全员存活 → 返回 null', () => {
    const g = freshGame();
    expect(lastManStanding(g.state)).toBeNull();
  });
});
