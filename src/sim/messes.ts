/*
 * FB2 A3: more cleaning pressure in Gear runs (classic runs keep their floor rules and draw no RNG here).
 *
 *  - `rollStationMess(state, st, p)`: right after a brew starts, a steamer (the dual boiler's wand included) drips milk
 *    (MESSES.milkDrip per steamed drink) and a grinder spills grounds (MESSES.groundsSpill per grind), on the barista's
 *    own tile. One `state.rng` draw per steam or grind.
 *  - `rollBinLeak(state, bin, p, item)`: a drink binned (E or R) leaks MESSES.binLeak of the time: a spill on the
 *    bin's front tile, logged `bin.leak { by, at, x, y }` (at = the bin's station id). One draw per binned drink.
 *  - Every mess placed in a Gear run (these, bumps, slips, floor drops, gear quirks) logs
 *    `mess.spawn { kind, x, y, at? }` from `placeMess`: kind 'milk' | 'grounds' | 'leak' here, else the mess's own
 *    kind ('spill' | 'grounds'); `at` is the station it came from, when there is one.
 *  - `GEAR_FLOOR` (floor.ts): how fast the floor meter drops per mess and recovers with none, in Gear runs (`stepCleanliness`).
 */
import { nodeOf } from './bots/path';
import { emitLog } from './log';
import { ownTile, placeMess } from './floor';
import { rngNext } from './rng';
import type { GameState, ItemKind, MessKind, Player, Station, Vec2 } from './types';

/** Chances per steamed drink, per grind and per binned drink. */
export const MESSES = { milkDrip: 0.03, groundsSpill: 0.03, binLeak: 0.01 } as const;

export { GEAR_FLOOR } from './floor';

/** Place a mess and say where it came from (`label` is the `mess.spawn` kind). */
export function spawnMess(state: GameState, kind: MessKind, tile: Vec2, label: string, at?: string): boolean {
  return placeMess(state, kind, tile, { kind: label, ...(at ? { at } : {}) });
}

/** After a brew starts at `st`: a milk drip at a steamer, spilled grounds at a grinder (Gear runs). */
export function rollStationMess(state: GameState, st: Station, p: Player): void {
  if (state.gear !== true) return;
  if (st.kind === 'steamer') {
    if (rngNext(state) < MESSES.milkDrip) spawnMess(state, 'spill', ownTile(state, p), 'milk', st.id);
  } else if (st.kind === 'grinder') {
    if (rngNext(state) < MESSES.groundsSpill) spawnMess(state, 'grounds', ownTile(state, p), 'grounds', st.id);
  }
}

/** A drink dropped in the bin may leak onto the floor in front of it (Gear runs). */
export function rollBinLeak(state: GameState, bin: Station, p: Player, item: ItemKind | null): void {
  if (state.gear !== true || item === null || item === 'grounds') return;
  if (rngNext(state) >= MESSES.binLeak) return;
  const tile = nodeOf(state, bin.pos);
  if (spawnMess(state, 'spill', tile, 'leak', bin.id)) emitLog(state, 'bin.leak', { by: p.id, at: bin.id, x: tile.x, y: tile.y });
}
