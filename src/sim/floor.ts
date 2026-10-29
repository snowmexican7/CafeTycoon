import type { GameState, Player, Vec2 } from './types';

/** Track A: grounds spread and slips when a player enters a tile. */
export function onTileEntry(_state: GameState, _entered: Player[]): void {}

/** Track A: cleanliness drifts with the messes on the floor. */
export function stepCleanliness(_state: GameState): void {}

/** Track A: the tiles bots path around (spills). */
export function spillTiles(_state: GameState): Vec2[] {
  return [];
}
