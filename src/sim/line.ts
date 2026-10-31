/**
 * Round 3 item 4: the line and the waiting area (constants in `ECONOMY.line`).
 *
 *  - Waiting area: when the line is full, an arrival browses inside instead of being turned away, while the tier's
 *    area has room (stand 0, cart 2, café 4). Browsers live in `GameState.waiting` (not `customers`: the till,
 *    pickup and bots never see them), drain patience at half speed, join the end of the line in arrival order as it
 *    frees, and at zero patience leave as a turn-away (never reached the line: not lost, no reputation hit).
 *  - Complaints: when the front of the order line hasn't changed for `stallSeconds` with at least `complainMin`
 *    people in it, the last one in line says so (`line.complain { customer }`), at most once per `cooldownSeconds`.
 *    For `freshSeconds` after, each arrival leaves with `quietLeaveChance` (`line.leave { customer, quiet: true }`):
 *    no reputation hit, not lost, only `DayStats.lineLeft`.
 *
 * The queue caps per tier are unchanged; an office run still waits outside while the line is over capacity.
 */
import { ECONOMY } from '../data/economy';
import { secondsToTicks } from './constants';
import { queueCapacity } from './customers';
import { computeModifiers } from './effects';
import { tierInfo, tierOf } from './growth';
import { emitLog } from './log';
import { rngNext } from './rng';
import { tally } from './tally';
import type { Customer, GameState } from './types';

const L = ECONOMY.line;

/** How many can browse in the waiting area at this shop size. */
export function waitingRoom(state: GameState): number {
  return L.waiting[tierOf(state)];
}

/** Room left in the waiting area. */
export function waitingFree(state: GameState): number {
  return waitingRoom(state) - (state.waiting?.length ?? 0);
}

/** A new customer (just pushed onto `customers` by addCustomer) goes to browse instead. */
export function sendToBrowse(state: GameState, c: Customer): void {
  state.customers = state.customers.filter((x) => x !== c);
  (state.waiting ??= []).push(c);
}

/** Browsers join the end of the line, first come first served, while it has room. */
export function promoteWaiting(state: GameState): void {
  const w = state.waiting;
  if (!w || w.length === 0) return;
  const cap = queueCapacity(computeModifiers(state), tierInfo(state).queue);
  while (w.length > 0 && state.customers.length < cap) state.customers.push(w.shift() as Customer);
  if (w.length === 0) delete state.waiting;
}

/** Once a tick (day and closing): browsers lose patience at `browsePatience` speed, the ones out of it leave (turned away), the rest move up. */
export function stepWaiting(state: GameState): void {
  const w = state.waiting;
  if (w && w.length > 0) {
    // Exact over any run of ticks: floor((t+1)r) - floor(tr) sums to r per tick.
    const drain = Math.floor((state.tick + 1) * L.browsePatience) - Math.floor(state.tick * L.browsePatience);
    const stay: Customer[] = [];
    for (const c of w) {
      c.patienceLeft -= drain;
      if (c.patienceLeft <= 0) state.today.turnedAway += 1; // never reached the line: a turn-away, not lost
      else stay.push(c);
    }
    state.waiting = stay;
  }
  promoteWaiting(state);
  if (state.waiting?.length === 0) delete state.waiting;
}

/** Everyone still at the till (not yet rung up), front first; campers sit, they don't queue. */
function orderLine(state: GameState): Customer[] {
  return state.customers.filter((c) => c.egg !== 'camper' && (c.stage ?? 'order') === 'order');
}

/** Doors open, once a tick: the stall clock, and the complaint when it runs out. */
export function stepLine(state: GameState): void {
  const line = orderLine(state);
  const front = line[0]?.id;
  const l = (state.line ??= { since: state.tick });
  if (front === undefined || front !== l.front) {
    if (front === undefined) delete l.front;
    else l.front = front;
    l.since = state.tick;
    return;
  }
  if (line.length < L.complainMin) return;
  if (state.tick - l.since < secondsToTicks(L.stallSeconds)) return;
  if (l.complainedAt !== undefined && state.tick - l.complainedAt < secondsToTicks(L.cooldownSeconds)) return;
  l.complainedAt = state.tick;
  emitLog(state, 'line.complain', { customer: line[line.length - 1].id });
}

/** A complaint was made in the last `freshSeconds`. */
export function complaintFresh(state: GameState): boolean {
  const at = state.line?.complainedAt;
  return at !== undefined && state.tick - at < secondsToTicks(L.freshSeconds);
}

/**
 * An arrival hears the complaint and leaves (one rngNext, only while it is fresh). They get an id for the
 * tumbleweed, and count in `DayStats.lineLeft` only.
 */
export function quietLeave(state: GameState): boolean {
  if (!complaintFresh(state) || rngNext(state) >= L.quietLeaveChance) return false;
  tally(state.today, 'lineLeft');
  emitLog(state, 'line.leave', { customer: state.nextCustomerId++, quiet: true });
  return true;
}
