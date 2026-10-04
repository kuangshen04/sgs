/**
 * MVP Seating 模块（R005）。
 *
 * Seating 在运行时就是一个按逆时针顺序保存的 Player 数组。底层数组允许未来由 Seating 自己的
 * 换座事件修改；消费侧只获得 readonly 视图，不能提前绕过该行为入口。
 */

import type { Player } from '../player/player.js';

declare const seatingBrand: unique symbol;

/** 数组顺序即逆时针座次顺序；运行时仍是普通可变数组。 */
export type Seating = readonly Player[] & {
  readonly [seatingBrand]: 'Seating';
};

/**
 * 创建逐局 Seating。复制输入但不冻结底层数组；同一局内 PlayerId 必须唯一。
 */
export function createSeating(players: readonly Player[]): Seating {
  const ids = new Set<string>();
  const seating = [...players];

  for (const player of seating) {
    if (ids.has(player.id)) {
      throw new Error(`Seating 包含重复 PlayerId“${player.id}”。`);
    }
    ids.add(player.id);
  }

  return seating as unknown as Seating;
}

/** 返回 1-based 座位号；传入不属于该 Seating 的 Player 是调用错误。 */
export function seatNumberOf(seating: Seating, player: Player): number {
  return indexOfPlayer(seating, player) + 1;
}

/**
 * 从 current 开始按逆时针方向返回每名玩家一次。
 * 返回冻结快照，之后的换座不会改变正在进行的本次遍历。
 */
export function counterclockwiseFrom(
  seating: Seating,
  current: Player,
): readonly Player[] {
  const index = indexOfPlayer(seating, current);
  return Object.freeze([
    ...seating.slice(index),
    ...seating.slice(0, index),
  ]);
}

function indexOfPlayer(seating: Seating, player: Player): number {
  const index = seating.indexOf(player);
  if (index < 0) {
    throw new Error(`Player“${player.id}”不属于当前 Seating。`);
  }
  return index;
}
