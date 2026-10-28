import { ECONOMY } from '../data/economy';
import { TICK_RATE } from './constants';
import { computeModifiers, type Modifiers } from './effects';
import { emitLog } from './log';
import { rngInt, rngNext } from './rng';
import { tally } from './tally';
import { tallyDrink } from './tally';
import type { Customer, CustomerKind, DrinkId, GameState, PlayerId } from './types';

const DRINKS: DrinkId[] = ['espresso', 'latte', 'coldBrew'];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Drinks the café can still make: every supply the recipe needs has at least one unit. */
export function availableDrinks(state: GameState): DrinkId[] {
  return DRINKS.filter((d) => state.menu[d] && ECONOMY.drinkSupplies[d].every((s) => state.supplies[s] >= 1));
}

/** One arrival trial per tick; the queue has a cap and the menu drives what gets ordered. */
export function spawnCustomers(state: GameState): GameState {
  const menu = availableDrinks(state);
  if (menu.length === 0) return state;
  const m = computeModifiers(state);
  const p = (ECONOMY.baseArrivalsPerSecond * m.traffic) / TICK_RATE;
  if (rngNext(state) >= p) return state;
  if (state.customers.length >= ECONOMY.queueCapacity) {
    state.today.turnedAway += 1;
    return state;
  }
  addCustomer(state, rollKind(state));
  return state;
}

/** Weighted drink draw over the menu, biased by the café's order modifiers (one rngNext). */
export function drawDrink(state: GameState, menu: DrinkId[], m: Modifiers): DrinkId {
  const weights = menu.map((d) => m.orderBias[d]);
  let roll = rngNext(state) * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < menu.length; i++) {
    roll -= weights[i];
    if (roll < 0) return menu[i];
  }
  return menu[menu.length - 1];
}

/** Which kind of customer walks in: day 1 uses the gentler mix; one rngNext, cumulative in mix order. */
export function rollKind(state: GameState): Exclude<CustomerKind, 'influencer'> {
  const mix: Partial<Record<Exclude<CustomerKind, 'influencer'>, number>> =
    state.day === 1 ? ECONOMY.customers.mixDay1 : ECONOMY.customers.mix;
  let roll = rngNext(state);
  for (const kind of ['normal', 'impatient', 'group', 'regular'] as const) {
    roll -= mix[kind] ?? 0;
    if (roll < 0) return kind;
  }
  return 'normal';
}

function patienceFor(m: Modifiers, mul: number): number {
  return Math.round(ECONOMY.patienceSeconds * m.patience * mul * TICK_RATE);
}

/** Draw the drink(s), apply the kind's patience and queue the customer; null when nothing can be made. */
export function addCustomer(state: GameState, kind: Exclude<CustomerKind, 'influencer'>): Customer | null {
  const menu = availableDrinks(state);
  if (menu.length === 0) return null;
  const m = computeModifiers(state);
  const g = ECONOMY.customers.group;
  const count = kind === 'group' ? g.min + rngInt(state, g.max - g.min + 1) : 1;
  const drinks = Array.from({ length: count }, () => drawDrink(state, menu, m));
  const mul = kind === 'impatient' ? ECONOMY.customers.impatient.patience : kind === 'group' ? g.patience : 1;
  const patienceMax = patienceFor(m, mul);
  const customer: Customer = { id: state.nextCustomerId++, drink: drinks[0], patienceLeft: patienceMax, patienceMax };
  // TODO(Task 7): replace this placeholder; 'regular' behaves like 'normal' until its own branch exists.
  if (kind === 'impatient' || kind === 'group') customer.kind = kind;
  if (kind === 'group') customer.extra = drinks.slice(1);
  state.customers.push(customer);
  return customer;
}

/** A customer leaves unserved: one lost per drink still owed, plus influencer bookkeeping. */
export function loseCustomer(state: GameState, c: Customer): void {
  state.today.lost += 1 + (c.extra?.length ?? 0);
  if (c.kind === 'influencer') state.today.influencer = 'lost';
}

/** The influencer joins even a full queue (never past capacity + 1) and orders the café's most favoured drink. */
export function spawnInfluencer(state: GameState): Customer | null {
  const menu = availableDrinks(state);
  if (menu.length === 0 || state.customers.length > ECONOMY.queueCapacity) return null;
  const m = computeModifiers(state);
  const top = Math.max(...menu.map((d) => m.orderBias[d]));
  const tied = menu.filter((d) => m.orderBias[d] === top);
  const drink = tied.includes('latte') ? 'latte' : tied[0];
  const patienceMax = patienceFor(m, ECONOMY.events.influencer.patience);
  const customer: Customer = { id: state.nextCustomerId++, drink, patienceLeft: patienceMax, patienceMax, kind: 'influencer' };
  state.customers.push(customer);
  return customer;
}

/** Patience drains one tick at a time; at zero the customer storms out and counts as lost. */
export function stepCustomers(state: GameState): GameState {
  const remaining = [];
  for (const c of state.customers) {
    c.patienceLeft -= 1;
    if (c.patienceLeft <= 0) {
      loseCustomer(state, c);
    } else remaining.push(c);
  }
  state.customers = remaining;
  return state;
}

/** Pay out one served customer: price, patience-scaled tip, cash, stats, and leave the queue. */
export function serveCustomer(state: GameState, customer: Customer, drink: DrinkId): void {
  const m = computeModifiers(state);
  const price = round2(ECONOMY.prices[drink] * m.price[drink]);
  const kindTip = customer.kind === 'impatient' ? ECONOMY.customers.impatient.tip : customer.kind === 'regular' ? ECONOMY.customers.regular.tip : 1;
  const tip = round2(price * ((ECONOMY.maxTipRate * customer.patienceLeft) / customer.patienceMax + m.tipRate) * kindTip);
  state.cash = round2(state.cash + price + tip);
  state.today.sales = round2(state.today.sales + price);
  state.today.tips = round2(state.today.tips + tip);
  state.today.served += 1;
  tallyDrink(state.today, drink);
  if (customer.kind === 'influencer') {
    tally(state.today, 'bonus', ECONOMY.events.influencer.bonus);
    state.cash = round2(state.cash + ECONOMY.events.influencer.bonus);
    state.today.influencer = 'served';
    emitLog(state, 'influencer', { result: 'served' });
  }
  if (customer.extra && customer.extra.length > 0) {
    customer.drink = customer.extra.shift() as DrinkId;
    customer.patienceLeft = Math.min(
      customer.patienceMax,
      customer.patienceLeft + Math.round(ECONOMY.customers.group.refill * customer.patienceMax),
    );
    return;
  }
  state.customers = state.customers.filter((c) => c !== customer);
}

/** Hand the held drink to the most impatient customer who ordered it; tip scales with patience left. */
export function serveDrink(state: GameState, playerId: PlayerId): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.holding === null || player.holding === 'grounds') return state;
  const drink = player.holding;
  let target = null;
  for (const c of state.customers) {
    if (c.drink === drink && (target === null || c.patienceLeft < target.patienceLeft)) target = c;
  }
  if (target === null) return state;
  serveCustomer(state, target, drink);
  player.holding = null;
  return state;
}
