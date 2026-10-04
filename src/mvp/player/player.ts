/**
 * MVP Player 模块（R004）。
 *
 * Player 只表示一局内稳定存在的身份载体；座次、HP、生死、临时移除、技能等状态由外部模块拥有。
 */

declare const playerIdBrand: unique symbol;

/** 与 CardId 等字符串在类型上区分的局内玩家身份。 */
export type PlayerId = string & {
  readonly [playerIdBrand]: 'PlayerId';
};

export interface Player {
  readonly id: PlayerId;
  /** 仅用于日志和调试，不参与任何规则判断。 */
  readonly label?: string;
}

export interface CreatePlayerInput {
  /** 由逐局装配显式给入；Player 模块不使用全局或自动递增分配器。 */
  readonly id: PlayerId;
  readonly label?: string;
}

/** 将外部稳定字符串收窄为 PlayerId。 */
export function playerId(value: string): PlayerId {
  assertNonBlank(value, 'PlayerId');
  return value as PlayerId;
}

/** 创建不可变 Player；同一局内的 ID 唯一性由逐局装配负责。 */
export function createPlayer(input: CreatePlayerInput): Player {
  assertNonBlank(input.id, 'PlayerId');
  if (input.label !== undefined) assertNonBlank(input.label, 'Player.label');

  return input.label === undefined
    ? Object.freeze({ id: input.id })
    : Object.freeze({ id: input.id, label: input.label });
}

function assertNonBlank(value: string, name: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} 不能为空。`);
  }
}
