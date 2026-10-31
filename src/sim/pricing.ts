/**
 * Phase 3 B2: per-item pricing. At night the crew nudges each drink's price in $0.25 steps.
 * Demand reacts to the price ratio (new price / list price):
 *  - that drink's share of orders scales by ratio^-ELASTICITY,
 *  - overall walk-ins scale by the menu's weighted demand (a pricey menu keeps people away),
 *  - patience moves a little (cheap drinks are worth the wait, pricey ones are not).
 * With no steps set every factor is exactly 1, so un-priced runs play identically to before.
 */
import { ECONOMY } from '../data/economy';
import { DRINK_INFO, DRINK_IDS, drinkSupplyUnits } from '../data/drinks';
import { dripPotCups, expectedCups, shareWeights } from './capacity';
import type { Modifiers } from './effects';
import { forecastIsRough, roughGuess, roughPct } from './forecast';
import type { DrinkId, GameState, PlayerInput } from './types';

export const PRICING = {
  step: 0.25,
  minStep: -4,
  maxStep: 8,
  /** Round 3 money: 1.8 -> 1.4, a softer squeeze on pricey menus. */
  elasticity: 1.4,
  /** Patience multiplier = 1 + patience * (1 - ratio), clamped. */
  patience: 0.6,
  patienceClamp: [0.7, 1.25] as const,
  demandClamp: [0.25, 1.8] as const,
} as const;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

export function priceStep(state: GameState, d: DrinkId): number {
  return state.priceSteps?.[d] ?? 0;
}

/** The drink's menu price before forecast modifiers (list price plus the crew's steps). */
export function menuPrice(state: GameState, d: DrinkId): number {
  const s = priceStep(state, d);
  return s === 0 ? ECONOMY.prices[d] : round2(ECONOMY.prices[d] + s * PRICING.step);
}

export function priceRatio(state: GameState, d: DrinkId): number {
  const s = priceStep(state, d);
  return s === 0 ? 1 : menuPrice(state, d) / ECONOMY.prices[d];
}

/** How many orders the drink gets relative to list price (1 = unchanged). */
export function demandFactor(state: GameState, d: DrinkId): number {
  const s = priceStep(state, d);
  if (s === 0) return 1;
  return clamp(Math.pow(priceRatio(state, d), -PRICING.elasticity), PRICING.demandClamp[0], PRICING.demandClamp[1]);
}

export function pricePatience(state: GameState, d: DrinkId): number {
  const s = priceStep(state, d);
  if (s === 0) return 1;
  return clamp(1 + PRICING.patience * (1 - priceRatio(state, d)), PRICING.patienceClamp[0], PRICING.patienceClamp[1]);
}

const anyPriced = (state: GameState) => !!state.priceSteps && Object.values(state.priceSteps).some((v) => v);

/** Base order weight of a drink on the menu (forecast bias × drink bias). */
export const orderWeight = (m: Modifiers, d: DrinkId) => m.orderBias[d] * DRINK_INFO[d].bias;

/** Overall walk-in multiplier: the menu's order-weighted demand. Exactly 1 when nothing is priced. */
export function priceTraffic(state: GameState, menu: DrinkId[], m: Modifiers): number {
  if (!anyPriced(state) || menu.length === 0) return 1;
  let w = 0;
  let wd = 0;
  for (const d of menu) {
    const x = orderWeight(m, d);
    w += x;
    wd += x * demandFactor(state, d);
  }
  return w > 0 ? wd / w : 1;
}

/** Night input: nudge a drink's price one way; clamped to the allowed range. */
export function applyPriceInput(state: GameState, input: Extract<PlayerInput, { kind: 'price' }>): GameState {
  if (state.phase !== 'night') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  const unlocked = state.unlocked ?? DRINK_IDS;
  if (!unlocked.includes(input.drink)) return state;
  const next = clamp(Math.round(input.step), PRICING.minStep, PRICING.maxStep);
  const steps = { ...(state.priceSteps ?? {}) };
  if (next === 0) delete steps[input.drink];
  else steps[input.drink] = next;
  if (Object.keys(steps).length) state.priceSteps = steps;
  else delete state.priceSteps;
  return state;
}

/**
 * Ingredient cost of one cup at list pack prices, every use counted (a cappuccino is two milks); a drip cup is its
 * share of the pot (the biggest pot `state` owns, else the smallest pot).
 */
export function unitCost(d: DrinkId, state?: GameState): number {
  const units = drinkSupplyUnits(d, dripPotCups(state));
  let cost = 0;
  for (const s of Object.keys(units) as (keyof typeof units)[]) cost += (units[s] ?? 0) * (ECONOMY.packs[s].cost / ECONOMY.packs[s].size);
  return round2(cost);
}

export interface PriceLine {
  drink: DrinkId;
  price: number;
  list: number;
  step: number;
  /** Order change vs. list price, in percent (e.g. -17). */
  demandPct: number;
  /** Expected orders tomorrow (rounded) and the profit on them before tips. */
  orders: number;
  profit: number;
  /** Round 3 item 3: the numbers are a rough guess (no Strategist): orders and profit rounded to 5 and skewed, demandPct rounded to 5. */
  rough?: true;
}

/**
 * The night's pricing forecast: for each drink on the menu, expected orders and margin.
 * `walkIns` is the forecast's walk-ins at list prices; `orders` are cups (capped by what the shop can pour).
 * Round 3 item 3: without a Strategist the figures shown are a rough guess (`forecastIsRough`); pass `exact` true for
 * the honest ones (the planner, the strategist's own search) or false to force the guess.
 */
export function priceForecast(state: GameState, menu: DrinkId[], m: Modifiers, walkIns: number, exact: boolean = !forecastIsRough(state)): PriceLine[] {
  const traffic = priceTraffic(state, menu, m);
  const weights = shareWeights(state, menu, m);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  // Round 3 money: cups, not people (groups and combos order more), and never more than the shop can pour in a day.
  const cups = expectedCups(state, menu, m, walkIns * traffic);
  return menu.map((d, i) => {
    const price = round2(menuPrice(state, d) * m.price[d]);
    const orders = Math.round(cups * (weights[i] / total));
    const demandPct = Math.round((demandFactor(state, d) * traffic - 1) * 100);
    const profit = round2(orders * (price - unitCost(d, state)));
    const line: PriceLine = { drink: d, price, list: ECONOMY.prices[d], step: priceStep(state, d), demandPct, orders, profit };
    if (exact) return line;
    return { ...line, demandPct: roughPct(demandPct), orders: Math.max(0, roughGuess(state, orders, i)), profit: roughGuess(state, profit, i), rough: true };
  });
}
