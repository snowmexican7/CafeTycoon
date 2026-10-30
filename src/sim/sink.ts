/*
 * FB2 A3 (docs/CLAUDE_PROMPT_FEEDBACK_2.md): the back sink and the drip pots that go to it. Gear runs only.
 *
 *  - The sink is a fixed counter-kind spot (`SINK_ID`, `layoutFor(tier).sink`), never bought, sold or moved.
 *  - `dumpDrink(state, p)`: a drink in hand at the sink (E or R) is poured away at once: no time, no mess, no money
 *    back (it counts as wasted, like the bin). Logs `sink.dump { by, item }`.
 *  - `potPress(state, p, st)`: E at a drip machine whose pot is cold (past `potColdAt` with cups left) or stale lifts
 *    the pot (`Player.tool = 'pot'`, `Station.potOut = p.id`, logs `pot.lift { by, station }`). A machine whose pot
 *    is out, or stale, does nothing else: no pour, no brew.
 *  - `dumpPot(state, p)`: the pot dumped at the sink goes straight home, empty and ready to brew
 *    (`sink.dump { by, item: 'pot' }`). `returnPot(state, p)`: put back undumped (R away from the sink, leaving,
 *    closing): it goes home still full, so it is stale.
 *  - `stalePotsAtClose(state)` (closing, before the pots are emptied): a pot with cups left is stale tomorrow, and a
 *    carried pot goes home stale. `potMorning(state)`: logs `pot.stale { station }` for each stale pot.
 *  - `keepStale(old, fresh)`: a night rebuild of the bar keeps the flag on the same machine (a new machine has a clean pot).
 *
 * Cold brew leftovers keep their own one-day rule (`batchOld`); they are never stale. Pure, no RNG.
 */
import { GEAR } from '../data/gear';
import { SINK_ID } from '../data/layout';
import { emitLog } from './log';
import { nearestStation } from './movement';
import { tally } from './tally';
import type { GameState, Player, Station } from './types';

/** A drip machine that brews pots (the pour-over bars have none). */
export const potMachine = (st: Station): boolean => !!st.gear && !!GEAR[st.gear].pot;

/** The sink is this station. */
export const isSink = (st: Station | null | undefined): boolean => st?.id === SINK_ID && st.kind === 'counter';

/** The pot on `st` has cups left and has gone cold on the hot plate. */
export function potCold(state: GameState, st: Station): boolean {
  return st.potLeft !== undefined && st.potLeft > 0 && st.potColdAt !== undefined && state.tick >= st.potColdAt;
}

/** The pot on `st` (still on the machine) must go to the sink before the machine pours or brews again. */
export function needsDump(state: GameState, st: Station): boolean {
  return state.gear === true && potMachine(st) && st.potOut === undefined && (st.stale === true || potCold(state, st));
}

/** The sink in `p`'s reach (the nearest station), if any. */
const sinkInReach = (state: GameState, p: Player): Station | null => {
  const st = nearestStation(state, p.pos);
  return isSink(st) ? st : null;
};

/** A drink in hand at the sink: poured away. False when there is no sink in reach or nothing to pour. */
export function dumpDrink(state: GameState, p: Player): boolean {
  if (state.gear !== true || !sinkInReach(state, p)) return false;
  const item = p.holding;
  if (item === null || item === 'grounds' || p.tool !== null) return false;
  p.holding = null;
  delete p.cupSlips;
  delete p.cupTemp;
  delete p.heldSince; // A2: no cup, no clock
  tally(state.today, 'wasted');
  emitLog(state, 'sink.dump', { by: p.id, item });
  return true;
}

/** The machine whose pot `p` carries, if any. */
const potHome = (state: GameState, p: Player): Station | undefined => state.stations.find((st) => st.potOut === p.id);

/** The carried pot at the sink: dumped, and straight back on its machine, empty. False when not at the sink. */
export function dumpPot(state: GameState, p: Player): boolean {
  if (p.tool !== 'pot' || !sinkInReach(state, p)) return false;
  const home = potHome(state, p);
  p.tool = null;
  if (home) {
    delete home.potOut;
    delete home.stale;
  }
  emitLog(state, 'sink.dump', { by: p.id, item: 'pot' });
  return true;
}

/** The carried pot goes home undumped: still full of old coffee, so stale until someone dumps it. */
export function returnPot(state: GameState, p: Player): void {
  if (p.tool !== 'pot') return;
  p.tool = null;
  const home = potHome(state, p);
  if (!home) return;
  delete home.potOut;
  home.stale = true;
  emitLog(state, 'drop', { item: 'pot', station: home.id, by: p.id });
}

/**
 * E at a station, before its normal rules. A pot machine whose pot is out, or stale, takes the press and does
 * nothing (no pour, no brew); empty hands lift a cold or stale pot. True when the press was handled here.
 */
export function potPress(state: GameState, p: Player, st: Station): boolean {
  if (state.gear !== true || !potMachine(st)) return false;
  if (st.potOut !== undefined) return true;
  if (!needsDump(state, st)) return false;
  if (p.holding !== null || p.tool !== null || st.busyTicksLeft > 0) return true;
  p.tool = 'pot';
  st.potOut = p.id;
  delete st.stale;
  delete st.potLeft;
  delete st.potColdAt;
  delete st.potOff;
  st.output = null;
  delete st.outputSince;
  emitLog(state, 'pot.lift', { by: p.id, station: st.id });
  return true;
}

/** Closing (before the pots are emptied): carried pots go home, and every pot with cups left is stale tomorrow. */
export function stalePotsAtClose(state: GameState): void {
  if (state.gear !== true) return;
  for (const p of state.players) returnPot(state, p);
  for (const st of state.stations) {
    if (potMachine(st) && (st.potLeft ?? 0) > 0) st.stale = true;
  }
}

/** Morning: the crew finds yesterday's pots. */
export function potMorning(state: GameState): void {
  if (state.gear !== true) return;
  for (const st of state.stations) if (st.stale) emitLog(state, 'pot.stale', { station: st.id });
}

/** A rebuilt bar keeps a stale pot on the same machine (same id, same gear). */
export function keepStale(old: readonly Station[], fresh: Station[]): void {
  for (const st of fresh) {
    if (old.some((o) => o.stale && o.id === st.id && o.gear === st.gear && potMachine(st))) st.stale = true;
  }
}
