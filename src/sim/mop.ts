import type { GameState, Player } from './types';

/** Track A: "use" with the mop in hand, or with empty hands and no station in range. */
export function mopInteract(_state: GameState, _player: Player): void {}

/** Track A: count down cleaning and remove the cleaned mess. */
export function stepCleaning(_state: GameState): void {}
