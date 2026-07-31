// ============================================================
// 三国杀最小原型 — 入口
// ============================================================

import './cards.js';  // 触发卡牌注册（side-effect import）
import { STANDARD_DECK } from './cards.js';
import { createGame, setGameState, printState } from './game.js';
import { runGame } from './gameFlow.js';
import type { Hero } from './types.js';

// ============================================================
// 主程序
// ============================================================

async function main() {
  const heroes: Hero[] = [
    { name: '刘备', maxHp: 4 },
    { name: '曹操', maxHp: 4 },
    { name: '孙权', maxHp: 4 },
  ];

  const game = createGame(STANDARD_DECK, heroes);
  setGameState(game);

  console.clear();
  printState(game);

  await runGame();

  console.log('\n' + '='.repeat(42));
  console.log(`🏆 游戏结束！${game.winner!.name} 获胜！`);
  console.log('='.repeat(42));
}

main().catch(console.error);
