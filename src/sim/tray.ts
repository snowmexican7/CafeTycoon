/*
 * FB2 B7: the tray table (Gear runs only). Big orders shouldn't steal other customers' cups.
 *  - A fixed counter-kind spot `trayTable` (`TRAY_ID`, `layoutFor(tier).trayTable`, (1,4) on every tier), never bought,
 *    sold or moved. `GameState.tray` is the tray on it (absent = the table is empty).
 *  - A drink set down on the empty table (E or R) claims the oldest multi-drink ticket (combo, office run, group) that
 *    still needs it: `tray.claim { customer, by }`, then `tray.add { drink, by, customer }`. The tray's lines are the
 *    drinks the ticket still needed, `done` once the cup is on the tray (with its own made tick, marks and who set it).
 *    Later drinks join only while the ticket still needs them; anything else is refused and stays in hand
 *    (`tray.refuse { drink, by, customer? }`). Grounds are never taken.
 *  - The ticket keeps taking cups off the pickup counter as before, but never one a tray already covers; a cup it does
 *    take there drops that line from the table's tray (`trayTakenOffCounter`).
 *  - Empty hands pick the tray up only when every line is done (no part trays): `Player.tool = 'tray'`, `Player.tray`,
 *    `tray.pick { by, customer }`; the table is free again. One tray per pair of hands.
 *  - E or R at the pickup counter (or the till: one long counter, not the bar) puts it down as ONE slot,
 *    `PassItem.tray { customer, drinks }`: `tray.put { by, customer }`. Anywhere else nothing happens. Only that
 *    customer takes it (`tray.take { customer }`, src/sim/pickup.ts), every cup at once, which completes the ticket;
 *    singles never take from it, take-backs skip it, and it never goes stale (each cup cools by its own `madeAt`).
 *  - A carried tray spills on a barista bump at `TRAY.spillMul` × the normal spill chance (src/sim/bumps.ts):
 *    `tray.spill { by, customer, cups }`, every cup wasted, a puddle; the ticket still waits for its drinks.
 *  - A ticket that leaves unfinished voids its trays wherever they are: `tray.void { customer, cups }`, the cups wasted
 *    (an office run's are not, as for B6). Closing clears every tray.
 * Bots never use the table; they count cups on a tray as covering their ticket (src/sim/bots/brain.ts).
 * RNG: one rngNext per bump for a tray carrier only (bots never carry one).
 */
import { ECONOMY } from '../data/economy';
import { TRAY_ID } from '../data/layout';
import { secondsToTicks } from './constants';
import { coolFraction, madeAtFromHand } from './cooling';
import { ownTile, placeMess } from './floor';
import { emitLog } from './log';
import { nearestStation } from './movement';
import { passSlots, spotOf } from './pickup';
import { rngNext } from './rng';
import { tally } from './tally';
import type { Customer, DrinkId, GameState, Player, Station, Tray, TrayCup } from './types';

export const TRAY = {
  /** A carried tray spills on a bump at this multiple of `ECONOMY.bump.spillChance`. */
  spillMul: 3,
} as const;

/** The station is the tray table. */
export const isTrayTable = (st: Station | null | undefined): boolean => st?.id === TRAY_ID && st.kind === 'counter';

/** Every line of the tray has its cup on it. */
export function trayComplete(t: Tray): boolean {
  return t.items.every((x) => x.done);
}

/** How cold one cup on a tray is (0 fresh .. 1 cold), like `slotCool` for a counter cup. */
export function trayCool(state: GameState, cup: TrayCup): number {
  return coolFraction(state, cup.madeAt, cup.drink);
}

/** The cups sitting on trays for ticket `id`: on the table, in someone's hands, or on the pickup counter. */
export function trayCups(state: GameState, id: number): DrinkId[] {
  const out: DrinkId[] = [];
  if (state.tray?.customer === id) for (const x of state.tray.items) if (x.done) out.push(x.drink);
  for (const p of state.players) if (p.tray?.customer === id) for (const x of p.tray.items) out.push(x.drink);
  for (const slot of state.pass) if (slot.tray?.customer === id) for (const x of slot.tray.drinks) out.push(x.drink);
  return out;
}

const count = (list: readonly DrinkId[], d: DrinkId): number => list.filter((x) => x === d).length;

/** A multi-drink ticket's drinks still to come that no tray covers, in ticket order (a single's: none). */
export function ticketOpen(state: GameState, c: Customer): DrinkId[] {
  if (!c.items) return [];
  const covered = trayCups(state, c.id);
  const out: DrinkId[] = [];
  for (const x of c.items) {
    if (x.done) continue;
    const k = covered.indexOf(x.drink);
    if (k >= 0) covered.splice(k, 1);
    else out.push(x.drink);
  }
  return out;
}

/** A tray already covers every `d` still to come on this multi-drink ticket (so its customer won't take one off the counter). */
export function trayCovers(state: GameState, c: Customer, d: DrinkId): boolean {
  if (!c.items) return false;
  const left = c.items.filter((x) => !x.done && x.drink === d).length;
  return left > 0 && count(trayCups(state, c.id), d) >= left;
}

function clearHands(p: Player): void {
  p.holding = null;
  delete p.cupSlips;
  delete p.cupTemp;
  delete p.heldSince;
  delete p.made;
}

/** The cup in `p`'s hands, as it goes onto a tray. */
function cupFromHand(state: GameState, p: Player, drink: DrinkId): TrayCup {
  return {
    drink,
    by: p.id,
    ...(p.cupSlips ? { slips: p.cupSlips } : {}),
    ...(p.cupTemp ? { temp: true as const } : {}),
    madeAt: madeAtFromHand(state, p),
    ...(p.made ? { made: p.made } : {}), // FB2 B8: how it was hand-made rides on the tray
  };
}

/** A drink in hand set down on the table: join the tray, or claim one for the oldest ticket that needs it, or refuse. */
function setDown(state: GameState, p: Player, drink: DrinkId): void {
  let t = state.tray;
  if (!t) {
    const c = state.customers.find((x) => x.items && x.egg !== 'camper' && ticketOpen(state, x).includes(drink));
    if (!c) {
      emitLog(state, 'tray.refuse', { drink, by: p.id });
      return;
    }
    t = { customer: c.id, items: ticketOpen(state, c).map((d) => ({ drink: d, done: false })) };
    state.tray = t;
    emitLog(state, 'tray.claim', { customer: c.id, by: p.id });
  }
  const line = t.items.findIndex((x) => !x.done && x.drink === drink);
  if (line < 0) {
    emitLog(state, 'tray.refuse', { drink, by: p.id, customer: t.customer });
    return;
  }
  t.items[line] = { ...cupFromHand(state, p, drink), done: true };
  clearHands(p);
  emitLog(state, 'tray.add', { drink, by: p.id, customer: t.customer });
}

/** Empty hands at the table: lift the tray when it holds everything its ticket still needs. */
function pick(state: GameState, p: Player): void {
  const t = state.tray;
  if (!t || !trayComplete(t)) return;
  delete state.tray;
  p.tool = 'tray';
  p.tray = t;
  emitLog(state, 'tray.pick', { by: p.id, customer: t.customer });
}

/** The carried tray goes down at the pickup counter (or the till) as one slot, when one is free; anywhere else nothing happens. */
function putDown(state: GameState, p: Player): void {
  const t = p.tray;
  const at = nearestStation(state, p.pos);
  if (!t || !at || at.kind !== 'counter') return;
  const spot = spotOf(at);
  if ((spot !== 'pickup' && spot !== 'till') || isTrayTable(at) || state.pass.length >= passSlots(state)) return;
  const drinks: TrayCup[] = t.items.map(({ done: _done, ...cup }) => cup);
  const first = drinks[0]!.drink;
  state.pass.push({ item: first, ticksLeft: secondsToTicks(ECONOMY.pass.staleSeconds[first]), by: p.id, tray: { customer: t.customer, drinks } });
  p.tool = null;
  delete p.tray;
  emitLog(state, 'tray.put', { by: p.id, customer: t.customer });
}

/**
 * E (Gear): a carried tray goes down at the pickup counter (the press is used up anywhere); at the tray table a drink is
 * set down and empty hands lift a full tray. True when the press was the tray's.
 */
export function trayInteract(state: GameState, p: Player): boolean {
  if (state.gear !== true) return false;
  if (p.tool === 'tray') {
    putDown(state, p);
    return true;
  }
  if (p.tool !== null || !isTrayTable(nearestStation(state, p.pos))) return false;
  if (p.holding === null) pick(state, p);
  else if (p.holding !== 'grounds') setDown(state, p, p.holding);
  return true;
}

/** R (Gear): the same as E for a carried tray or a drink at the table (empty hands drop nothing). True when handled. */
export function trayDrop(state: GameState, p: Player): boolean {
  if (state.gear !== true) return false;
  if (p.tool === 'tray') {
    putDown(state, p);
    return true;
  }
  if (p.tool !== null || p.holding === null || !isTrayTable(nearestStation(state, p.pos))) return false;
  if (p.holding !== 'grounds') setDown(state, p, p.holding);
  return true;
}

/** The ticket took a `drink` off the pickup counter: drop a line of it that the table's tray was still waiting for. */
export function trayTakenOffCounter(state: GameState, c: Customer, drink: DrinkId): void {
  const t = state.tray;
  if (t?.customer !== c.id) return;
  const line = t.items.findIndex((x) => !x.done && x.drink === drink);
  if (line >= 0) t.items.splice(line, 1);
}

/** Remove every tray for ticket `id` (table, hands, counter); the cups count as wasted when `waste`. Logs `tray.void`. */
function voidFor(state: GameState, id: number, waste: boolean): void {
  let cups = 0;
  let found = false;
  if (state.tray?.customer === id) {
    cups += state.tray.items.filter((x) => x.done).length;
    delete state.tray;
    found = true;
  }
  for (const p of state.players) {
    if (p.tray?.customer !== id) continue;
    cups += p.tray.items.length;
    delete p.tray;
    if (p.tool === 'tray') p.tool = null;
    found = true;
  }
  const kept = state.pass.filter((slot) => slot.tray?.customer !== id);
  for (const slot of state.pass) if (slot.tray?.customer === id) cups += slot.tray.drinks.length;
  if (kept.length !== state.pass.length) {
    state.pass = kept;
    found = true;
  }
  if (!found) return;
  if (waste && cups > 0) tally(state.today, 'wasted', cups);
  emitLog(state, 'tray.void', { customer: id, cups });
}

/** A ticket leaves unfinished (src/sim/orders.ts `loseTicket`): its trays go, wasted unless it was an office run. */
export function voidTrays(state: GameState, c: Customer): void {
  voidFor(state, c.id, c.order !== 'office');
}

/** Each Gear tick: a tray whose customer is gone (by any path) is voided. */
export function sweepTrays(state: GameState): void {
  const here = new Set(state.customers.map((c) => c.id));
  const ids = new Set<number>();
  if (state.tray) ids.add(state.tray.customer);
  for (const p of state.players) if (p.tray) ids.add(p.tray.customer);
  for (const slot of state.pass) if (slot.tray) ids.add(slot.tray.customer);
  for (const id of ids) if (!here.has(id)) voidFor(state, id, true);
}

/** A bump with a tray in hand (one rngNext): at `TRAY.spillMul` × the cup's chance every cup goes on the floor. */
export function spillTray(state: GameState, p: Player): void {
  const t = p.tray;
  if (!t) return;
  if (rngNext(state) >= Math.min(1, ECONOMY.bump.spillChance * TRAY.spillMul)) return;
  placeMess(state, 'spill', ownTile(state, p));
  const cups = t.items.length;
  tally(state.today, 'wasted', cups);
  tally(state.today, 'bumpSpills');
  p.tool = null;
  delete p.tray;
  emitLog(state, 'tray.spill', { by: p.id, customer: t.customer, cups });
}

/** Closing: no tray outlives the day (every ticket has left by now, so nothing is counted here). */
export function clearTrays(state: GameState): void {
  delete state.tray;
  for (const p of state.players) {
    delete p.tray;
    if (p.tool === 'tray') p.tool = null;
  }
  state.pass = state.pass.filter((slot) => !slot.tray);
}
