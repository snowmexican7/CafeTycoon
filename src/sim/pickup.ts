/*
 * Batch/pickup (spec §3, Gear runs only): customers order at the till, wait at the pickup area, and take their
 * own drinks off the pickup counter (today's pass, grown to 4 slots). A drink set down goes to the customer who
 * has waited longest for it (an upset one first: they are owed a remake), and they pay as they take it. Nobody
 * rung up means nobody at pickup: a drink set down early waits there, and goes stale on the pass timers.
 * No RNG here: the order is the pass (stalest first) and the customers (upset, ring time, id).
 */
import { ECONOMY } from '../data/economy';
import { CONDIMENTS_ID, FRIDGE_ID, PICKUP_ID } from '../data/layout';
import { CONDIMENTS, noteCondiments, wantsCondiments } from './condiments';
import { serveCustomer } from './customers';
import { emitLog } from './log';
import type { Customer, DrinkId, GameState, Station } from './types';

export const PICKUP = { slots: 4 } as const;

/** The counter-kind spots of a Gear shop (FB2 A4: the fridge is one too, so it never reads as the till). */
export type CounterSpot = 'till' | 'pickup' | 'condiments' | 'fridge';

/** Which counter spot `at` is: absent, or the counter's own id, is the till. */
export function spotOf(at?: Station): CounterSpot {
  if (at?.id === PICKUP_ID) return 'pickup';
  if (at?.id === CONDIMENTS_ID) return 'condiments';
  if (at?.id === FRIDGE_ID) return 'fridge';
  return 'till';
}

/** Cups the pickup counter (the pass) holds: 4 in Gear runs, the classic pass's 3 otherwise. */
export function passSlots(state: GameState): number {
  return state.gear === true ? PICKUP.slots : ECONOMY.pass.slots;
}

/** The customer still wants this drink: their current one, or one still owed to their group. */
export function wantsDrink(c: Customer, d: DrinkId): boolean {
  return c.drink === d || (c.extra?.includes(d) ?? false);
}

/** Who takes `drink` off the counter: rung up (stage pickup), not a camper, wants it; upset first, then the longest wait, then the lowest id. */
export function pickupTarget(state: GameState, drink: DrinkId): Customer | null {
  let best: Customer | null = null;
  for (const c of state.customers) {
    if (c.stage !== 'pickup' || c.egg === 'camper' || !wantsDrink(c, drink)) continue;
    if (best === null || better(c, best)) best = c;
  }
  return best;
}

function better(a: Customer, b: Customer): boolean {
  if (!!a.upset !== !!b.upset) return !!a.upset;
  const ra = a.rungAt ?? Infinity;
  const rb = b.rungAt ?? Infinity;
  if (ra !== rb) return ra < rb;
  return a.id < b.id;
}

/** Customers at pickup take what is theirs: over the counter, stalest first, until no cup has a taker. Gear only. */
export function stepPickup(state: GameState): void {
  if (state.gear !== true) return;
  for (;;) {
    const order = state.pass.map((item, i) => ({ item, i })).sort((a, b) => a.item.ticksLeft - b.item.ticksLeft || a.i - b.i);
    const hit = order.find(({ item }) => pickupTarget(state, item.item) !== null);
    if (!hit) return;
    const { item, i } = hit;
    const c = pickupTarget(state, item.item)!;
    state.pass.splice(i, 1);
    if (c.drink !== item.item && c.extra) {
      // A group's later drink landed first: they take it now and keep waiting for the rest.
      const k = c.extra.indexOf(item.item);
      c.extra[k] = c.drink;
      c.drink = item.item;
    }
    emitLog(state, 'pickup.take', { drink: item.item, customer: c.id, by: item.by ?? '' });
    // Task 10: plain drip and cold brew drinkers stop at the condiment bar; an empty bar means black coffee (tip × 0.8).
    const want = wantsCondiments(state, c, item.item);
    const black = want && (state.condiments?.servings ?? 0) <= 0;
    const served = state.today.served;
    serveCustomer(state, c, item.item, item.by, item.slips ?? 0, item.temp === true, black ? CONDIMENTS.blackTip : 1);
    if (want && state.today.served > served) noteCondiments(state, c, black);
  }
}
