import { LAYOUT } from '../data/layout';
import type { Customer, GameState, Vec2 } from './types';

/** A rogue is active while one walks the floor or a queued customer is upset (at most one at a time). */
export function rogueActive(state: GameState): boolean {
  return state.rogue !== null || state.customers.some((c) => c.upset);
}

/** The upset customer's window ran out: they go rogue from the customer side of the counter. */
export function startRogue(state: GameState, c: Customer): void {
  state.rogue = {
    customerId: c.id,
    name: c.name,
    drink: c.drink,
    stage: 'walking',
    pos: { ...LAYOUT.rogueStart },
    path: [],
    station: null,
    ticksLeft: 0,
    waitTicks: 0,
  };
}

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
