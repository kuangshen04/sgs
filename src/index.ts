// ============================================================
// 三国杀最小原型 — 入口
// 事件驱动：game → round → turn → phase → action 全自动
// trigger log 由 TriggerSystem.trigger() 统一输出
// ============================================================

import {
  createGame, setGameState, printState,
} from './game.js';
import { runGame } from './gameFlow.js';

// ============================================================
// 主程序
// ============================================================

async function main() {
  const game = createGame();
  setGameState(game);

  console.clear();
  printState(game);

  // 一整局就是一个事件：game.before → 主循环 → game.after
  await runGame();

  console.log('\n' + '='.repeat(42));
  console.log(`🏆 游戏结束！${game.winner!.name} 获胜！`);
  console.log('='.repeat(42));
}

main().catch(console.error);
