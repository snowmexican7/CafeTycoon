/*
 * FB2 B6: multi-drink orders (Gear runs only). One ticket, several drinks: a group, a combo or an office run rings up
 * once at the till, takes its cups off the pickup counter one by one (each marks an item done), and pays for the whole
 * ticket when the last item is taken: every cup's price and tip by the usual per-cup rules (stars, a lukewarm or
 * off-temperature cup halves its tip, black coffee ×0.8), the wait judged when the ticket is complete. A cold cup is
 * taken but never paid. Walk out with the ticket part done and nothing is paid; the cups taken count as wasted
 * (except an office run's).
 *
 * - Combos: from day 2, about one walk-in in twelve orders two drinks: a pair (one for the spouse in the car), or an
 *   espresso-bar drink and a drip. The ticket waits 1.3× as long. `order.combo { customer, items }`.
 * - Groups (Gear): one ticket too (was: pay per drink); each cup taken still tops their patience up.
 * - Office runs: on the cart and at the café from day 3, about every other day (drawn at day start), 4-6 drinks off
 *   the menu (`size`, by tier), 4× the patience, a 25% bonus tip on the order's price when complete. The phone rings
 *   10 s before they walk in (`office.call { at }`, `at` the tick they are due: with the queue over capacity they
 *   wait outside, so it can be later). Lost (patience out, or still in when the doors lock): `order.lost { customer }`,
 *   no lost customers, no wasted cups, no bad review, no reputation hit. Served: one customer for reputation
 *   (`DayStats.officeExtra`). Since losing one costs nothing, it never takes a walk-in's place: it takes a cup off the
 *   pickup counter only when no one else wants it (`pickup.ts`), and bots keep one of its drinks in the queue at its
 *   place and make the rest after the walk-ins' (`bots/brain.ts`, fix round 1 I1).
 * Events: `order.combo`, `order.office { customer, count }`, `office.call`, `order.done { customer, paid, tip }`,
 * `order.lost`. Randomness from `state.rng` only, drawn only in Gear runs inside each window.
 */
import { ECONOMY } from '../data/economy';
import { recipeChain } from '../data/drinks';
import { secondsToTicks } from './constants';
import { CONDIMENTS, noteCondiments, wantsCondiments } from './condiments';
import { LUKEWARM } from './cooling';
import { availableDrinks, drawDrink, drinkWait, patienceFor, payCup } from './customers';
import { computeModifiers } from './effects';
import { areaPatienceMul } from './gear';
import { tierInfo, tierOf } from './growth';
import { emitLog } from './log';
import { noteFeedMoment } from './feed';
import { pricePatience } from './pricing';
import { rngInt, rngNext } from './rng';
import { tally } from './tally';
import type { Customer, DrinkId, GameState, OrderItem, PassItem } from './types';

export const ORDERS = {
  combo: {
    fromDay: 2,
    /**
     * Share of normal and impatient walk-ins who order two drinks (fix round 1: 8%, about 6-7% of all arrivals; at 12%
     * combos and office runs together overran a two-person cart crew: 7 of 24 smoke runs bankrupt against main's 3).
     */
    chance: 0.08,
    /** Of those, the share who ask for an espresso-bar drink and a drip (when the first drink allows it); else a pair. */
    mix: 0.5,
    patience: 1.3,
  },
  office: {
    fromDay: 3,
    /** Chance a day has one. */
    chance: 0.5,
    /** Drinks on the order, from..to, by tier (fix round 1 tuning: 4-6 everywhere; never above 6 on the cart). */
    size: { cart: [4, 6], cafe: [4, 6] },
    patience: 4,
    /** Bonus tip on completion, as a share of the order's price. */
    bonus: 0.25,
    /** The phone rings this long before they walk in. */
    callSeconds: 10,
    /** They walk in between 5% and 15% of the way through opening hours (the day, not their patience, is the limit). */
    from: 0.05,
    span: 0.1,
  },
} as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A drink made on the espresso machine (a shot on its own or under milk or water). */
export function isEspressoBar(d: DrinkId): boolean {
  return recipeChain(d).some((x) => x.station === 'espresso');
}

/** The drinks still to come on a ticket, in ticket order. */
export function undoneDrinks(c: Customer): DrinkId[] {
  return (c.items ?? []).filter((x) => !x.done).map((x) => x.drink);
}

/** The ticket still has an item of `d` to come. */
export function wantsItem(c: Customer, d: DrinkId): boolean {
  return (c.items ?? []).some((x) => !x.done && x.drink === d);
}

/** Keep `drink` (the first item to come) and `extra` (the rest) in step with the ticket's items. */
function sync(c: Customer): void {
  const left = undoneDrinks(c);
  if (left.length > 0) c.drink = left[0];
  if (left.length > 1) c.extra = left.slice(1);
  else delete c.extra;
}

/** Turn `c` into a multi-drink ticket for `drinks` (none done yet). */
export function makeTicket(c: Customer, drinks: DrinkId[]): void {
  c.items = drinks.map((drink) => ({ drink, done: false }));
  sync(c);
}

/**
 * The combo roll for a walk-in whose first drink is `drinks[0]` (Gear, from day 2): one rngNext, and on a hit a second
 * one (and a third to pick the espresso drink for a drip). Pushes the second drink onto `drinks`; true on a combo.
 */
export function comboDrinks(state: GameState, menu: DrinkId[], drinks: DrinkId[]): boolean {
  const cfg = ORDERS.combo;
  if (state.gear !== true || state.day < cfg.fromDay || drinks.length !== 1) return false;
  if (rngNext(state) >= cfg.chance) return false;
  const first = drinks[0];
  let second = first;
  if (rngNext(state) < cfg.mix) {
    const bar = menu.filter(isEspressoBar);
    if (isEspressoBar(first) && menu.includes('drip')) second = 'drip';
    else if (first === 'drip' && bar.length > 0) second = bar[rngInt(state, bar.length)];
  }
  drinks.push(second);
  return true;
}

/**
 * A ticket holder takes `cup` off the pickup counter (already spliced off by `stepPickup`): the first matching item
 * is done. A cold cup (`cool` ≥ 1) is taken unpaid (a bad review, except from an office run); otherwise the drip and
 * cold brew drinkers stop at the condiment bar. A group relaxes a little with each cup. The last item pays the ticket.
 */
export function takeItem(state: GameState, c: Customer, cup: PassItem, cool: number): void {
  const item = c.items!.find((x) => !x.done && x.drink === cup.item)!;
  item.done = true;
  if (cup.by) item.by = cup.by;
  if (cup.slips) item.slips = cup.slips;
  if (cool >= 1) {
    item.cold = true;
    emitLog(state, 'pickup.cold', { customer: c.id, drink: cup.item });
    if (c.order !== 'office') emitLog(state, 'review.bad', { customer: c.id, drink: cup.item, reason: 'cold' });
    noteFeedMoment(state, 'cold', c, cup.item); // FB2 C11 (an office run never posts)
  } else {
    if (cool >= LUKEWARM) noteFeedMoment(state, 'lukewarm', c, cup.item); // FB2 C11
    if (cup.temp === true || cool >= LUKEWARM) item.temp = true;
    emitLog(state, 'pickup.take', { drink: cup.item, customer: c.id, by: cup.by ?? '' });
    if (wantsCondiments(state, c, cup.item)) {
      const black = (state.condiments?.servings ?? 0) <= 0;
      if (black) item.black = true;
      noteCondiments(state, c, black, cup.item);
    }
  }
  if (c.kind === 'group') {
    c.patienceLeft = Math.min(c.patienceMax, c.patienceLeft + Math.round(ECONOMY.customers.group.refill * c.patienceMax));
  }
  sync(c);
  if (c.items!.every((x) => x.done)) completeTicket(state, c);
}

/** Every item taken: pay for the warm cups (each by the usual rules), the office bonus on top, and leave. */
function completeTicket(state: GameState, c: Customer): void {
  let paid = 0;
  let tip = 0;
  let price = 0;
  let cups = 0;
  for (const item of c.items!) {
    if (item.cold) {
      if (c.order !== 'office') state.today.lost += 1; // as a single cold cup: one lost drink
      continue;
    }
    const cup = payCup(state, c, item.drink, item.by, item.slips ?? 0, item.temp === true, item.black ? CONDIMENTS.blackTip : 1);
    paid += cup.price + cup.tip;
    tip += cup.tip;
    price += cup.price;
    cups += 1;
  }
  if (c.order === 'office') {
    const bonus = round2(price * ORDERS.office.bonus);
    if (bonus > 0) {
      state.cash = round2(state.cash + bonus);
      state.today.tips = round2(state.today.tips + bonus);
      paid += bonus;
      tip += bonus;
    }
    if (cups > 1) tally(state.today, 'officeExtra', cups - 1);
    state.today.office = 'served';
  }
  emitLog(state, 'order.done', { customer: c.id, paid: round2(paid), tip: round2(tip) });
  state.customers = state.customers.filter((x) => x !== c);
}

/**
 * A ticket leaves unfinished (patience out, or the doors shut): nothing paid. An office run: `order.lost`, and it never
 * counts against the café (no lost drinks, no waste). Anyone else: every drink on the ticket is lost and the warm cups
 * taken are wasted.
 * The caller removes the customer.
 */
export function loseTicket(state: GameState, c: Customer): void {
  const items: OrderItem[] = c.items ?? [];
  if (c.order === 'office') {
    // Fix round 1 (I3): losing an office run costs nothing, so the cups it took aren't waste (nor an inspector's fail).
    state.today.office = 'lost';
    emitLog(state, 'order.lost', { customer: c.id });
    return;
  }
  const taken = items.filter((x) => x.done && !x.cold).length;
  if (taken > 0) tally(state.today, 'wasted', taken);
  state.today.lost += items.length;
}

/** The doors lock: an office run still in leaves unfinished (`order.lost`), so the shop never waits out the grace on it. */
export function officeLeaves(state: GameState): void {
  const office = state.customers.filter((c) => c.order === 'office');
  if (office.length === 0) return;
  for (const c of office) loseTicket(state, c);
  state.customers = state.customers.filter((c) => c.order !== 'office');
}

/**
 * Day start: does an office run come today, and when? Gear runs on the cart or at the café from day 3, one rngNext
 * (and one more for the time on a yes). Draws nothing anywhere else.
 */
export function officeMorning(state: GameState): void {
  delete state.office;
  const cfg = ORDERS.office;
  if (state.gear !== true || state.day < cfg.fromDay || tierOf(state) === 'stand') return;
  if (rngNext(state) >= cfg.chance) return;
  const dayTicks = secondsToTicks(state.settings.dayLengthSec);
  const at = Math.max(secondsToTicks(cfg.callSeconds), Math.floor(dayTicks * (cfg.from + rngNext(state) * cfg.span)));
  state.office = { day: state.day, at };
}

/**
 * Each open tick: the phone rings `callSeconds` before the office run is due, then they walk in (into a full queue
 * only one past capacity, like the influencer; with no room they wait outside until there is).
 */
export function stepOffice(state: GameState): void {
  const o = state.office;
  if (!o || o.day !== state.day || o.came !== undefined) return;
  const t = secondsToTicks(state.settings.dayLengthSec) - state.phaseTicksLeft;
  const call = secondsToTicks(ORDERS.office.callSeconds);
  if (!o.called && t >= o.at - call) {
    o.called = true;
    emitLog(state, 'office.call', { at: state.tick + Math.max(0, o.at - t) });
  }
  if (t < o.at) return;
  if (state.customers.some((c) => c.order === 'office')) return;
  const c = spawnOffice(state);
  if (c) o.came = c.id;
}

function spawnOffice(state: GameState): Customer | null {
  const menu = availableDrinks(state);
  if (menu.length === 0 || state.customers.length > tierInfo(state).queue) return null;
  const cfg = ORDERS.office;
  const m = computeModifiers(state);
  const [min, max] = cfg.size[tierOf(state) === 'cart' ? 'cart' : 'cafe'];
  const n = min + rngInt(state, max - min + 1);
  const drinks = Array.from({ length: n }, () => drawDrink(state, menu, m));
  const wait = Math.max(...drinks.map((d) => drinkWait(state, d) * pricePatience(state, d)));
  const patienceMax = patienceFor(m, cfg.patience * wait * areaPatienceMul(state, drinks));
  const c: Customer = { id: state.nextCustomerId++, drink: drinks[0], patienceLeft: patienceMax, patienceMax, stage: 'order', order: 'office' };
  makeTicket(c, drinks);
  state.customers.push(c);
  emitLog(state, 'order.office', { customer: c.id, count: n });
  return c;
}
