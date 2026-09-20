// ============================================================
// 三国杀最小原型 — 入口
//
// 装配在入口显式发生一次（没有隐式默认装配、没有 import 副作用）：
//   建容器 → 装标包 → 建牌堆 → createGame(..., { ruleSet: container })
// ============================================================

import { createStandardContainer } from './content/standardPack.js';
import { buildStandardDeck } from './content/deck.js';
import { createGame } from './game.js';
import { printState } from './flow/display.js';
import { runGame } from './flow/gameFlow.js';
import { GameOverError } from './flow/life.js';

// ============================================================
// 主程序
// ============================================================

async function main() {
  const ruleSet = createStandardContainer();
  const deck = buildStandardDeck(ruleSet);
  // createGame 内置：建容器/玩家（含技能实例）/备牌堆/起始发牌/初始状态/装载效果
  const game = createGame(deck, ['刘备', '曹操', '夏侯惇', '司马懿', '郭嘉', '甄宓', '孙权', '周瑜', '貂蝉'], {
    ruleSet,
  });

  console.clear();
  printState(game);

  try {
    await runGame(game);
  } catch (e) {
    if (!(e instanceof GameOverError)) throw e;
  }

  console.log('\n' + '='.repeat(42));
  console.log(`🏆 游戏结束！${game.state.winner!.name} 获胜！`);
  printState(game);
  console.log('='.repeat(42));
}

main().catch(console.error);
