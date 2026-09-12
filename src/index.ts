// ============================================================
// 三国杀最小原型 — 入口
// ============================================================

import './content/cards/index.js';  // 触发卡牌注册（side-effect import）
import { STANDARD_DECK } from './content/cards/index.js';
import { createGame } from './game.js';
import { printState } from './flow/display.js';
import { runGame } from './flow/gameFlow.js';
import { GameOverError } from './flow/life.js';

// ============================================================
// 主程序
// ============================================================

async function main() {
  // createGame 内置：建容器/玩家（含技能实例）/备牌堆/起始发牌/初始状态/装载效果
  const game = createGame(STANDARD_DECK, ['刘备', '曹操', '夏侯惇', '司马懿', '郭嘉', '甄宓', '孙权', '周瑜', '貂蝉']);

  console.clear();
  printState(game.state);

  try {
    await runGame(game);
  } catch (e) {
    if (!(e instanceof GameOverError)) throw e;
  }

  console.log('\n' + '='.repeat(42));
  console.log(`🏆 游戏结束！${game.state.winner!.name} 获胜！`);
  printState(game.state);
  console.log('='.repeat(42));
}

main().catch(console.error);
