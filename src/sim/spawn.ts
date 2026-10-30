/*
 * FB2 A3 fix round 2: where a barista is put on the floor. A spot inside a fixture (spawn index 2, (7,4), is the
 * stand's back sink; old saves gain the sink on load) moves to the nearest walkable tile; any other spot is kept as
 * it is. Used everywhere a barista is placed: createRun, startDay, newBarista (bots, temps, stand-ins) and join.
 */
import { nodeOf } from './bots/path';
import { floorWidth } from './growth';
import { blocked } from './movement';
import { tileOf } from './tiles';
import type { GameState, Player, Vec2 } from './types';

/** `pos`, or the nearest walkable tile when a station (a fixture) covers it. */
export function freeSpot(state: GameState, pos: Vec2): Vec2 {
  return blocked(pos, state.stations, floorWidth(state)) ? nodeOf(state, pos) : { ...pos };
}

/** Move a barista who stands inside a fixture onto the nearest free tile (their tile follows). */
export function settle(state: GameState, p: Player): void {
  if (!blocked(p.pos, state.stations, floorWidth(state))) return;
  p.pos = nodeOf(state, p.pos);
  p.tile = tileOf(p.pos);
}
