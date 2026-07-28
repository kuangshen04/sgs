// ============================================================
// 三国杀最小原型 — 入口
// 创建游戏 → 轮流执行回合 → 宣布胜利者
// ============================================================

import { createGame, playerTurn, printState } from './game.js';

const game = createGame();

console.clear();
printState(game);

// 主循环
while (!game.gameOver) {
  const current = game.players[game.currentIndex];
  console.log(`\n━━━ 第 ${game.round} 轮 · ${current.name} 的回合 ━━━`);

  playerTurn(game);

  if (game.gameOver) break;

  printState(game);

  // 切换到下一个玩家
  game.currentIndex = 1 - game.currentIndex;
  if (game.currentIndex === 0) game.round++;
}

console.log('\n' + '='.repeat(42));
console.log(`🏆 游戏结束！${game.winner!.name} 获胜！`);
console.log('='.repeat(42));
