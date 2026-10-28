import { ECONOMY } from '../data/economy';
import { TICK_RATE } from './constants';
import { computeModifiers } from './effects';
import { emitLog } from './log';
import { rngNext } from './rng';
import { tally } from './tally';
import { tallyDrink } from './tally';
import type { Customer, DrinkId, GameState, PlayerId } from './types';

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
  const weights = menu.map((d) => m.orderBias[d]);
  let roll = rngNext(state) * weights.reduce((a, b) => a + b, 0);
  let drink = menu[menu.length - 1];
  for (let i = 0; i < menu.length; i++) {
    roll -= weights[i];
    if (roll < 0) {
      drink = menu[i];
      break;
    }
  }
  const patienceMax = Math.round(ECONOMY.patienceSeconds * m.patience * TICK_RATE);
  state.customers.push({ id: state.nextCustomerId++, drink, patienceLeft: patienceMax, patienceMax });
  return state;
}

/** The influencer joins even a full queue (never past capacity + 1) and orders the café's most favoured drink. */
export function spawnInfluencer(state: GameState): Customer | null {
  const menu = availableDrinks(state);
  if (menu.length === 0 || state.customers.length > ECONOMY.queueCapacity) return null;
  const m = computeModifiers(state);
  const top = Math.max(...menu.map((d) => m.orderBias[d]));
  const tied = menu.filter((d) => m.orderBias[d] === top);
  const drink = tied.includes('latte') ? 'latte' : tied[0];
  const patienceMax = Math.round(ECONOMY.patienceSeconds * m.patience * ECONOMY.events.influencer.patience * TICK_RATE);
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
      state.today.lost += 1;
      if (c.kind === 'influencer') state.today.influencer = 'lost';
    }
    else remaining.push(c);
  }
  state.customers = remaining;
  return state;
}

/** Pay out one served customer: price, patience-scaled tip, cash, stats, and leave the queue. */
export function serveCustomer(state: GameState, customer: Customer, drink: DrinkId): void {
  const m = computeModifiers(state);
  const price = round2(ECONOMY.prices[drink] * m.price[drink]);
  const tip = round2(price * ((ECONOMY.maxTipRate * customer.patienceLeft) / customer.patienceMax + m.tipRate));
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
