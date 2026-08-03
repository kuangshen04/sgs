// ============================================================
// 三国杀最小原型 — 入口
// ============================================================

import './cards.js';  // 触发卡牌注册（side-effect import）
import { STANDARD_DECK } from './cards.js';
import { registerSkills } from './skills.js';
import { createGame, printState } from './game.js';
import { runGame } from './gameFlow.js';
import type { Hero } from './types.js';

// ============================================================
// 主程序
// ============================================================

async function main() {
  registerSkills(); // 把技能挂到事件系统

  const heroes: Hero[] = [
    { name: '刘备', maxHp: 4 },
    { name: '郭嘉', maxHp: 3, skills: ['遗计'] },
    { name: '孙权', maxHp: 4 },
    { name: '周瑜', maxHp: 3, skills: ['英姿'] },
    { name: '貂蝉', maxHp: 3, skills: ['闭月'] },
  ];

  const game = createGame(STANDARD_DECK, heroes);

  console.clear();
  printState(game.state);

  await runGame(game);

  console.log('\n' + '='.repeat(42));
  console.log(`🏆 游戏结束！${game.state.winner!.name} 获胜！`);
  console.log('='.repeat(42));
}

main().catch(console.error);
