import type { GameState, Vec2 } from './types';

/** Track B: the rogue customer's walk, wait, make and leave. */
export function stepRogue(_state: GameState): void {}

/** Track B: the tiles bots path around (the rogue's tile). */
export function rogueTiles(_state: GameState): Vec2[] {
  return [];
}

/** Track B: true when the rogue stands near `at` (bots yield to them). */
export function rogueNear(_state: GameState, _at: Vec2): boolean {
  return false;
}
