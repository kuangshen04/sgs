// ============================================================
// 随机源（洗牌）
//
// 当前 = `Math.random()` 写死。**注入点**：阶段 5/6 的 rng service
// （种子化 → 确定性重演 / 回放，见 `docs/TODO.md` 阶段 6）在此接入：
// 届时改为由调用方传入随机源（`shuffle(deck, rng)`），本文件只保留算法。
// ============================================================

/** Fisher-Yates 洗牌（返回新数组） */
export function shuffle<T>(deck: T[]): T[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
