import { ECONOMY } from '../data/economy';
import { TICK_RATE, secondsToTicks } from './constants';
import { computeModifiers, type Modifiers } from './effects';
import { emitLog } from './log';
import { rngInt, rngNext } from './rng';
import { rogueActive, startRogue } from './rogue';
import { tally } from './tally';
import { tallyDrink } from './tally';
import { BASE_DRINKS, DRINK_IDS, DRINK_INFO } from '../data/drinks';
import type { Customer, CustomerKind, DrinkId, GameState, PlayerId, Regular, SimEvent } from './types';

const DRINKS: DrinkId[] = DRINK_IDS;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Drinks the café can still make: unlocked, on the menu, and every supply the recipe needs has at least one unit. */
export function availableDrinks(state: GameState): DrinkId[] {
  const unlocked = state.unlocked ?? BASE_DRINKS;
  return DRINKS.filter((d) => unlocked.includes(d) && state.menu[d] && ECONOMY.drinkSupplies[d].every((s) => (state.supplies[s] ?? 0) >= 1));
}

/** Spots in the queue today: the layout's six, less any a forecast takes (never below three). */
export function queueCapacity(m: Modifiers): number {
  return Math.max(3, Math.min(ECONOMY.queueCapacity, ECONOMY.queueCapacity + m.queue));
}

/** One arrival trial per tick; the queue has a cap and the menu drives what gets ordered. */
export function spawnCustomers(state: GameState): GameState {
  const menu = availableDrinks(state);
  if (menu.length === 0) return state;
  const m = computeModifiers(state);
  const p = (ECONOMY.baseArrivalsPerSecond * m.traffic) / TICK_RATE;
  if (rngNext(state) >= p) return state;
  if (state.customers.length >= queueCapacity(m)) {
    state.today.turnedAway += 1;
    return state;
  }
  addCustomer(state, rollKind(state));
  return state;
}

/** Weighted drink draw over the menu, biased by the café's order modifiers (one rngNext). */
export function drawDrink(state: GameState, menu: DrinkId[], m: Modifiers): DrinkId {
  const weights = menu.map((d) => m.orderBias[d] * DRINK_INFO[d].bias);
  let roll = rngNext(state) * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < menu.length; i++) {
    roll -= weights[i];
    if (roll < 0) return menu[i];
  }
  return menu[menu.length - 1];
}

/** Which kind of customer walks in: day 1 uses the gentler mix, reweighted by the forecast; one rngNext, cumulative in mix order. */
export function rollKind(state: GameState): Exclude<CustomerKind, 'influencer'> {
  const base: Partial<Record<Exclude<CustomerKind, 'influencer'>, number>> =
    state.day === 1 ? ECONOMY.customers.mixDay1 : ECONOMY.customers.mix;
  const w = computeModifiers(state).mix;
  const kinds = ['normal', 'impatient', 'group', 'regular'] as const;
  const weights = kinds.map((k) => (base[k] ?? 0) * (k === 'normal' ? 1 : w[k]));
  let roll = rngNext(state) * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < kinds.length; i++) {
    roll -= weights[i];
    if (roll < 0) return kinds[i];
  }
  return 'normal';
}

function patienceFor(m: Modifiers, mul: number): number {
  return Math.round(ECONOMY.patienceSeconds * m.patience * mul * TICK_RATE);
}

/** The regular who comes in next: a new one while the roster has room, else one not queued whose drink is on the menu. */
export function pickRegular(state: GameState, menu: DrinkId[]): Regular | null {
  const cfg = ECONOMY.customers.regular;
  if (state.regulars.length < cfg.max) {
    const regular: Regular = { name: cfg.names[state.regulars.length], drink: drawDrink(state, menu, computeModifiers(state)), visits: 0, lost: 0 };
    state.regulars.push(regular);
    return regular;
  }
  const candidates = state.regulars.filter((r) => !state.customers.some((c) => c.name === r.name) && menu.includes(r.drink));
  return candidates.length === 0 ? null : candidates[rngInt(state, candidates.length)];
}

/** Draw the drink(s), apply the kind's patience and queue the customer; null when nothing can be made. */
export function addCustomer(state: GameState, kind: Exclude<CustomerKind, 'influencer'>): Customer | null {
  const menu = availableDrinks(state);
  if (menu.length === 0) return null;
  const m = computeModifiers(state);
  const regular = kind === 'regular' ? pickRegular(state, menu) : null;
  if (kind === 'regular' && regular === null) kind = 'normal';
  const g = ECONOMY.customers.group;
  const count = kind === 'group' ? g.min + rngInt(state, g.max - g.min + 1) : 1;
  const drinks = regular ? [regular.drink] : Array.from({ length: count }, () => drawDrink(state, menu, m));
  const mul = kind === 'impatient' ? ECONOMY.customers.impatient.patience : kind === 'group' ? g.patience : 1;
  // fancy drinks buy a little patience; a group waits as long as its fanciest order
  const wait = Math.max(...drinks.map((d) => DRINK_INFO[d].wait ?? 1));
  const patienceMax = patienceFor(m, mul * wait);
  const customer: Customer = { id: state.nextCustomerId++, drink: drinks[0], patienceLeft: patienceMax, patienceMax };
  if (kind === 'impatient' || kind === 'group') customer.kind = kind;
  if (kind === 'group') customer.extra = drinks.slice(1);
  if (regular) {
    regular.visits += 1;
    customer.kind = 'regular';
    customer.name = regular.name;
  }
  state.customers.push(customer);
  return customer;
}

/** A customer leaves unserved: one lost per drink still owed, plus regular and influencer bookkeeping. */
export function loseCustomer(state: GameState, c: Customer): void {
  state.today.lost += 1 + (c.extra?.length ?? 0);
  if (c.kind === 'regular') {
    const regular = state.regulars.find((r) => r.name === c.name);
    if (regular) regular.lost += 1;
    tally(state.today, 'lostRegulars');
  }
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

/** Patience drains one tick at a time; at zero the customer storms out and counts as lost.
 *  An upset customer's patience is frozen; their remake window drains instead, and at zero they go rogue. */
export function stepCustomers(state: GameState): GameState {
  const remaining = [];
  const goneRogue: Customer[] = [];
  for (const c of state.customers) {
    if (c.upset) {
      c.upset.ticksLeft -= 1;
      if (c.upset.ticksLeft <= 0) goneRogue.push(c);
      else remaining.push(c);
      continue;
    }
    c.patienceLeft -= 1;
    if (c.patienceLeft <= 0) {
      loseCustomer(state, c);
    } else remaining.push(c);
  }
  state.customers = remaining;
  for (const c of goneRogue) {
    loseCustomer(state, c);
    tally(state.today, 'rogues');
    startRogue(state, c);
  }
  return state;
}

/** The rogue roll: from minDay, with no rogue active, for a normal, impatient or regular customer (one rngNext only then). */
function rollsUpset(state: GameState, customer: Customer): boolean {
  if (state.day < ECONOMY.rogue.minDay || rogueActive(state)) return false;
  if (customer.kind !== undefined && customer.kind !== 'impatient' && customer.kind !== 'regular') return false;
  return rngNext(state) < ECONOMY.rogue.chance;
}

/** Served with at least this much patience left: a perfect serve (a visual celebration only). */
export const PERFECT_PATIENCE = 0.75;

/** Pay out one served customer: price, patience-scaled tip, cash, stats, and leave the queue. */
export function serveCustomer(state: GameState, customer: Customer, drink: DrinkId, by?: PlayerId): void {
  if (customer.upset) {
    delete customer.upset;
    emitLog(state, 'rogue.remade', { drink });
  } else if (rollsUpset(state, customer)) {
    // The drink is consumed: no pay, no serve, no waste; they stay queued with patience frozen.
    customer.upset = { ticksLeft: secondsToTicks(ECONOMY.rogue.remakeSeconds) };
    emitLog(state, 'rogue.upset', { drink });
    return;
  }
  const m = computeModifiers(state);
  const price = round2(ECONOMY.prices[drink] * m.price[drink]);
  const kindTip = customer.kind === 'impatient' ? ECONOMY.customers.impatient.tip : customer.kind === 'regular' ? ECONOMY.customers.regular.tip : 1;
  const tip = round2(price * ((ECONOMY.maxTipRate * customer.patienceLeft) / customer.patienceMax + m.tipRate) * kindTip);
  state.cash = round2(state.cash + price + tip);
  state.today.sales = round2(state.today.sales + price);
  state.today.tips = round2(state.today.tips + tip);
  state.today.served += 1;
  tallyDrink(state.today, drink);
  // For the "Dev served a latte +$6" toast: who, what, how much, and whether it was a perfect serve.
  const served: SimEvent['data'] = {
    by: by ?? '',
    item: drink,
    amount: round2(price + tip),
    kind: customer.kind ?? 'normal',
    cid: customer.id,
    perfect: customer.patienceLeft / customer.patienceMax >= PERFECT_PATIENCE,
    left: customer.extra?.length ?? 0,
  };
  if (customer.name !== undefined) served.name = customer.name;
  emitLog(state, 'served', served);
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

/** Serve target among `match`: an upset customer first, else the most impatient. */
export function serveTarget(state: GameState, match: (c: Customer) => boolean): Customer | null {
  let best: Customer | null = null;
  for (const c of state.customers) {
    if (!match(c)) continue;
    if (best === null || (c.upset && !best.upset) || (!!c.upset === !!best.upset && c.patienceLeft < best.patienceLeft)) best = c;
  }
  return best;
}

/** Hand the held drink to the matching customer (upset first, else most impatient); tip scales with patience left. */
export function serveDrink(state: GameState, playerId: PlayerId): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.holding === null || player.holding === 'grounds') return state;
  const drink = player.holding;
  const target = serveTarget(state, (c) => c.drink === drink);
  if (target === null) return state;
  serveCustomer(state, target, drink, playerId);
  player.holding = null;
  return state;
}
