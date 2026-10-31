/*
 * Batch/pickup (spec §3, Gear runs only): customers order at the till, wait at the pickup area, and take their
 * own drinks off the pickup counter (today's pass, grown to 4 slots). A drink set down goes to the customer who
 * has waited longest for it (an upset one first: they are owed a remake), and they pay as they take it. Nobody
 * rung up means nobody at pickup: a drink set down early waits there, and goes stale on the pass timers.
 * No RNG here: the order is the pass (stalest first) and the customers (upset, ring time, id).
 */
import { ECONOMY } from '../data/economy';
import { CONDIMENTS_ID, FRIDGE_ID, PICKUP_ID, SINK_ID, TRAY_ID } from '../data/layout';
import { CONDIMENTS, noteCondiments, wantsCondiments } from './condiments';
import { loseCustomer, serveCustomer } from './customers';
import { LUKEWARM, coolFraction, coolTicks, slotCool } from './cooling';
import { emitLog } from './log';
import { takeItem, wantsItem } from './orders';
import { sweepTrays, trayCovers, trayTakenOffCounter } from './tray';
import { tally } from './tally';
import type { Customer, DrinkId, GameState, Station } from './types';

export const PICKUP = { slots: 4 } as const;

/** The counter-kind spots of a Gear shop (FB2 A3: the back sink is one too; FB2 A4: so is the fridge; FB2 B7: and the tray table, so none reads as the till). */
export type CounterSpot = 'till' | 'pickup' | 'condiments' | 'sink' | 'fridge' | 'trayTable';

/** Which counter spot `at` is: absent, or the counter's own id, is the till. */
export function spotOf(at?: Station): CounterSpot {
  if (at?.id === PICKUP_ID) return 'pickup';
  if (at?.id === CONDIMENTS_ID) return 'condiments';
  if (at?.id === SINK_ID) return 'sink';
  if (at?.id === FRIDGE_ID) return 'fridge';
  if (at?.id === TRAY_ID) return 'trayTable';
  return 'till';
}

/** Cups the pickup counter (the pass) holds: 4 in Gear runs, the classic pass's 3 otherwise. */
export function passSlots(state: GameState): number {
  return state.gear === true ? PICKUP.slots : ECONOMY.pass.slots;
}

/** The customer still wants this drink: their current one, or one still owed to their group (FB2 B6: an item still to come on their ticket). */
export function wantsDrink(c: Customer, d: DrinkId): boolean {
  if (c.items) return wantsItem(c, d);
  return c.drink === d || (c.extra?.includes(d) ?? false);
}

/**
 * Who takes `drink` off the counter: rung up (stage pickup), not a camper, wants it (FB2 B7: and no tray covers it);
 * upset first, an office run last (FB2 B6), then the longest wait, then the lowest id.
 */
export function pickupTarget(state: GameState, drink: DrinkId): Customer | null {
  let best: Customer | null = null;
  for (const c of state.customers) {
    if (c.stage !== 'pickup' || c.egg === 'camper' || !wantsDrink(c, drink) || trayCovers(state, c, drink)) continue;
    if (best === null || better(c, best)) best = c;
  }
  return best;
}

function better(a: Customer, b: Customer): boolean {
  if (!!a.upset !== !!b.upset) return !!a.upset;
  // FB2 B6: an office run waits for the whole order anyway; it takes a cup only when nobody else wants it.
  if ((a.order === 'office') !== (b.order === 'office')) return b.order === 'office';
  const ra = a.rungAt ?? Infinity;
  const rb = b.rungAt ?? Infinity;
  if (ra !== rb) return ra < rb;
  return a.id < b.id;
}

/**
 * Which of the counter's `drink` cups a customer takes: a hot drink, the freshest (A2: largest `madeAt`, unknown =
 * fresh; then the stalest pass timer, then slot order); an iced one, the stalest (it never cools).
 */
function takeIndex(state: GameState, drink: DrinkId): number {
  const hot = coolTicks(drink) !== null;
  let best = -1;
  state.pass.forEach((item, i) => {
    if (item.item !== drink || item.tray) return; // FB2 B7: a tray is its own customer's
    if (best === -1) {
      best = i;
      return;
    }
    const b = state.pass[best];
    const a0 = hot ? (item.madeAt ?? Infinity) : 0;
    const b0 = hot ? (b.madeAt ?? Infinity) : 0;
    if (a0 > b0 || (a0 === b0 && item.ticksLeft < b.ticksLeft)) best = i;
  });
  return best;
}

/**
 * Customers at pickup take what is theirs: over the counter, stalest first, until no cup has a taker. Gear only.
 * A2: of several matching cups they take the freshest; a lukewarm one earns half the tip, a cold one is taken
 * but not paid for, and the customer walks out (a lost customer) with a bad review.
 */
export function stepPickup(state: GameState): void {
  if (state.gear !== true) return;
  sweepTrays(state); // FB2 B7: a tray whose customer is gone goes too
  takeTrays(state);
  for (;;) {
    const order = state.pass
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => !item.tray)
      .sort((a, b) => a.item.ticksLeft - b.item.ticksLeft || a.i - b.i);
    const hit = order.find(({ item }) => pickupTarget(state, item.item) !== null);
    if (!hit) return;
    const c = pickupTarget(state, hit.item.item)!;
    const i = takeIndex(state, hit.item.item);
    const item = state.pass[i];
    state.pass.splice(i, 1);
    if (c.items) {
      // FB2 B6: a multi-drink ticket marks the item done; it pays when the last one is taken.
      trayTakenOffCounter(state, c, item.item); // FB2 B7: the table's tray no longer waits for this one
      takeItem(state, c, item, slotCool(state, item));
      continue;
    }
    if (c.drink !== item.item && c.extra) {
      // A group's later drink landed first: they take it now and keep waiting for the rest.
      const k = c.extra.indexOf(item.item);
      c.extra[k] = c.drink;
      c.drink = item.item;
    }
    const cool = slotCool(state, item);
    if (cool >= 1) {
      takeCold(state, c, item.item);
      continue;
    }
    emitLog(state, 'pickup.take', { drink: item.item, customer: c.id, by: item.by ?? '' });
    // Task 10: plain drip and cold brew drinkers stop at the condiment bar; an empty bar means black coffee (tip × 0.8).
    const want = wantsCondiments(state, c, item.item);
    const black = want && (state.condiments?.servings ?? 0) <= 0;
    const served = state.today.served;
    // A2: lukewarm halves the tip, like an off pot; a cup that is both is still halved once.
    serveCustomer(state, c, item.item, item.by, item.slips ?? 0, item.temp === true || cool >= LUKEWARM, black ? CONDIMENTS.blackTip : 1);
    if (want && state.today.served > served) noteCondiments(state, c, black);
  }
}

/**
 * FB2 B7: a tray on the counter goes to its own customer once they are at pickup, every cup at once (each by the
 * ticket's rules: a cold one unpaid, a lukewarm one half tip); the last cup pays the ticket. `tray.take { customer }`.
 */
function takeTrays(state: GameState): void {
  for (let i = 0; i < state.pass.length; ) {
    const slot = state.pass[i];
    const c = slot.tray ? state.customers.find((x) => x.id === slot.tray!.customer && x.stage === 'pickup' && x.items) : undefined;
    if (!slot.tray || !c) {
      i += 1;
      continue;
    }
    state.pass.splice(i, 1);
    emitLog(state, 'tray.take', { customer: c.id });
    for (const cup of slot.tray.drinks) {
      if (!state.customers.includes(c) || !wantsItem(c, cup.drink)) {
        tally(state.today, 'wasted'); // never expected: a cup the ticket no longer needs
        continue;
      }
      const passCup = { item: cup.drink, ticksLeft: 0, ...(cup.by ? { by: cup.by } : {}), ...(cup.slips ? { slips: cup.slips } : {}), ...(cup.temp ? { temp: true } : {}), ...(cup.madeAt !== undefined ? { madeAt: cup.madeAt } : {}) };
      takeItem(state, c, passCup, coolFraction(state, cup.madeAt, cup.drink));
    }
  }
}

/** A2: the customer took a cold cup: no pay, a bad review, and they walk out (with any drinks still owed to their group). */
function takeCold(state: GameState, c: Customer, drink: DrinkId): void {
  emitLog(state, 'pickup.cold', { customer: c.id, drink });
  emitLog(state, 'review.bad', { customer: c.id, drink, reason: 'cold' });
  loseCustomer(state, c);
  state.customers = state.customers.filter((x) => x !== c);
}
