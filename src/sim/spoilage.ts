import { ECONOMY } from '../data/economy';
import { computeModifiers } from './effects';
import { rngNext } from './rng';
import { fridgeSpoilMul } from './fridge';
import type { GameState, PlayerId, SupplyId } from './types';

/**
 * P3 B4: fresh stock goes off. Milk and pastries lose a share of what is left at each closing, so
 * the crew trades over-ordering (waste) against running out (lost sales). A fridge card cuts it. Shelf-stable supplies never spoil.
 * Deterministic: floors of fixed shares, no randomness.
 */
export const SPOIL = {
  /** Share of each fresh supply left at closing that is thrown out. */
  rate: { milk: 0.3, pastry: 0.5 } as Partial<Record<SupplyId, number>>,
  /** Pastries: sold on the side with a drink when there are any in the case. */
  pastry: { price: 3, attach: 0.35 },
};

export const FRESH: SupplyId[] = ['milk', 'pastry'];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Tonight's spoil share for one supply (0 for shelf-stable ones). */
export function spoilRate(state: GameState, supply: SupplyId): number {
  const base = SPOIL.rate[supply] ?? 0;
  if (base === 0) return 0;
  // FB2 A4: Gear milk keeps in the fridge; a better fridge keeps it better.
  const fridge = supply === 'milk' ? fridgeSpoilMul(state) : 1;
  return Math.max(0, Math.min(1, base * fridge * computeModifiers(state).spoil));
}

/** How many of `count` would be thrown out tonight at the current rate. */
export function spoilCount(state: GameState, supply: SupplyId, count: number): number {
  return Math.floor(Math.max(0, count) * spoilRate(state, supply) + 1e-9);
}

/** At closing: throw out the spoiled share of fresh stock and note it (count and stock value) on today's record (added to anything already there: FB2 A4's left-out stock). */
export function spoilOvernight(state: GameState): void {
  const spoiled: Partial<Record<SupplyId, number>> = { ...state.today.spoiled };
  let value = state.today.spoiledValue ?? 0;
  let any = false;
  for (const s of FRESH) {
    const have = state.supplies[s] ?? 0;
    const n = spoilCount(state, s, have);
    if (n <= 0) continue;
    state.supplies[s] = have - n;
    spoiled[s] = (spoiled[s] ?? 0) + n;
    value += (n * ECONOMY.packs[s].cost) / ECONOMY.packs[s].size;
    any = true;
  }
  if (!any) return;
  state.today.spoiled = spoiled;
  state.today.spoiledValue = round2(value);
}

/** With a served drink: maybe a pastry on the side (seeded roll, only when the case has any). Returns the sale. */
export function sellPastry(state: GameState, _by?: PlayerId): number {
  if ((state.supplies.pastry ?? 0) < 1) return 0;
  if (rngNext(state) >= SPOIL.pastry.attach) return 0;
  state.supplies.pastry = (state.supplies.pastry ?? 0) - 1;
  const price = SPOIL.pastry.price;
  state.cash = round2(state.cash + price);
  state.today.sales = round2(state.today.sales + price);
  state.today.pastries = (state.today.pastries ?? 0) + 1;
  return price;
}
