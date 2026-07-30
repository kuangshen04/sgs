// ============================================================
// 三国杀最小原型 — 入口
// ============================================================

import './cards.js';  // 触发卡牌注册（side-effect import）
import { STANDARD_DECK } from './cards.js';
import { createGame, setGameState, printState } from './game.js';
import { runGame } from './gameFlow.js';

// ============================================================
// 主程序
// ============================================================

async function main() {
  const game = createGame(STANDARD_DECK);
  setGameState(game);

  console.clear();
  printState(game);

  await runGame();

  console.log('\n' + '='.repeat(42));
  console.log(`🏆 游戏结束！${game.winner!.name} 获胜！`);
  console.log('='.repeat(42));
}

main().catch(console.error);
