/**
 * Phase 3 B3: regulars with favourites. Each regular comes back for one drink (their favourite).
 * Loyalty (0..5) grows when they get it at a fair price and shrinks when they're lost, overcharged,
 * or their favourite is off the menu for a whole day. Loyal regulars tip more; overcharged ones tip less.
 */
import { DRINK_INFO } from '../data/drinks';
import { priceRatio } from './pricing';
import type { DrinkId, GameState, Regular } from './types';

export const LOYALTY = {
  max: 5,
  /** Tip multiplier per loyalty point. */
  tipPerPoint: 0.08,
  /** Price ratio up to which a regular calls it fair, and where the tip bottoms out. */
  fairUpTo: 1.06,
  gougeAt: 1.25,
  gougeTip: 0.5,
} as const;

export const loyaltyOf = (r: Regular) => r.loyalty ?? 0;

/** 1 when fairly priced, falling linearly to gougeTip at gougeAt and beyond. */
export function fairness(state: GameState, d: DrinkId): number {
  const r = priceRatio(state, d);
  if (r <= LOYALTY.fairUpTo) return 1;
  const t = Math.min(1, (r - LOYALTY.fairUpTo) / (LOYALTY.gougeAt - LOYALTY.fairUpTo));
  return 1 - t * (1 - LOYALTY.gougeTip);
}

/** The extra tip factor for a regular being served their favourite. */
export function regularTipFactor(state: GameState, r: Regular): number {
  return (1 + LOYALTY.tipPerPoint * loyaltyOf(r)) * fairness(state, r.drink);
}

const bump = (r: Regular, by: number) => {
  const next = Math.max(0, Math.min(LOYALTY.max, loyaltyOf(r) + by));
  if (next === 0) delete r.loyalty;
  else r.loyalty = next;
};

/** After a regular is served: fair price earns a point, a gouge costs one. */
export function noteRegularServed(state: GameState, r: Regular): void {
  const f = fairness(state, r.drink);
  if (f === 1) bump(r, 1);
  else if (f <= 0.75) bump(r, -1);
}

export function noteRegularLost(r: Regular): void {
  bump(r, -1);
}

/** End of day: a regular whose favourite wasn't on the menu loses a point. Returns their names. */
export function noteMissedFavourites(state: GameState): string[] {
  const missed: string[] = [];
  for (const r of state.regulars) {
    if (state.menu[r.drink]) continue;
    bump(r, -1);
    missed.push(r.name);
  }
  return missed;
}

export interface RegularVM {
  name: string;
  drink: DrinkId;
  drinkName: string;
  loyalty: number;
  max: number;
  /** 'ok' | 'off' (favourite off the menu) | 'pricey' (tips fall) */
  status: 'ok' | 'off' | 'pricey';
  /** Gear G10b: a snob regular (big tips for a perfect cup, little for a sloppy one). */
  snob?: boolean;
}

export function regularsViewModel(state: GameState): RegularVM[] {
  return state.regulars.map((r) => ({
    name: r.name,
    drink: r.drink,
    drinkName: DRINK_INFO[r.drink].name,
    loyalty: loyaltyOf(r),
    max: LOYALTY.max,
    status: !state.menu[r.drink] ? 'off' : fairness(state, r.drink) < 1 ? 'pricey' : 'ok',
    ...(r.snob ? { snob: true } : {}),
  }));
}
