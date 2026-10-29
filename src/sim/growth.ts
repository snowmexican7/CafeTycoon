/**
 * P3 B13: the growth path. A new run opens as a tiny kerbside stand and the crew grows it at night:
 * stand → coffee cart → the café. Each tier changes the floor (the rest of the lot is hoarding),
 * the stations (the stand has no steamer), the line's length, the rent and who walks in:
 *
 *  - Stand: 8 tiles wide, grinder + espresso + cold-brew tap, a line of 3, $10 rent. Commuters in a
 *    hurry: more impatient walk-ins, no groups, fewer regulars.
 *  - Cart: 10 wide, adds the steamer (lattes, mochas, matcha), a line of 5, $17 rent, some groups.
 *  - Café: the full 12-wide floor, a line of 6, $25 rent, everyone (the game before B13).
 *
 * Runs without a tier (every save before B13) are the café. Pure arithmetic: no RNG of its own, and a
 * café run's numbers are exactly what they were.
 */
import { ECONOMY } from '../data/economy';
import { layoutFor } from '../data/layout';
import type { Modifiers } from './effects';
import { defaultSlots, growSlots, stationsFromSlots } from './slots';
import type { DrinkId, GameState, PlayerInput, Station, StationKind, TierId } from './types';

export interface TierInfo {
  name: string;
  short: string;
  icon: string;
  /** Price to grow into this tier (the stand is where runs start). */
  cost: number;
  /** Line length before walk-ins are turned away. */
  queue: number;
  rentPerDay: number;
  /** Who walks in: multipliers on the base mix weights. */
  mix: { impatient: number; group: number; regular: number };
  /** What a shop this size can charge (× every price) and how many people pass by (× traffic). */
  price: number;
  traffic: number;
  crowd: string;
  blurb: string;
  /** The morning-after line. */
  milestone: string;
}

export const TIER_IDS: TierId[] = ['stand', 'cart', 'cafe'];

export const TIERS: Record<TierId, TierInfo> = {
  stand: {
    name: 'Kerbside stand',
    short: 'stand',
    icon: '⛱️',
    cost: 0,
    queue: 3,
    rentPerDay: 10,
    mix: { impatient: 1.4, group: 0, regular: 0.6 },
    price: 0.75,
    traffic: 0.65,
    crowd: 'Commuters in a hurry, no groups. Fewer passers-by, and nobody pays café prices at a folding table (−25%)',
    blurb: 'A folding table, one grinder, one machine and a cold-brew keg. Everyone is late for something.',
    milestone: '',
  },
  cart: {
    name: 'Coffee cart',
    short: 'cart',
    icon: '🛺',
    cost: 80,
    queue: 5,
    rentPerDay: 17,
    mix: { impatient: 1.15, group: 0.5, regular: 0.85 },
    price: 0.9,
    traffic: 0.85,
    crowd: 'Some friends in pairs, more regulars. Busier, prices −10%',
    blurb: 'A proper cart with a striped awning and a milk steamer. Lattes are back on the board.',
    milestone: 'Somebody asked if we do oat milk. We are a real business now.',
  },
  cafe: {
    name: 'The café',
    short: 'café',
    icon: '☕',
    cost: 150,
    queue: ECONOMY.queueCapacity,
    rentPerDay: ECONOMY.rentPerDay,
    mix: { impatient: 1, group: 1, regular: 1 },
    price: 1,
    traffic: 1,
    crowd: 'Everyone: groups, regulars, the lot',
    blurb: 'Four walls, a window seat and a doormat that says HELLO. The whole floor is ours.',
    milestone: 'We started with a folding table. Look at us now.',
  },
};

/** The stations each drink's recipe walks (counter and trash are everywhere). */
export const DRINK_STATIONS: Record<DrinkId, StationKind[]> = {
  espresso: ['grinder', 'espresso'],
  latte: ['grinder', 'espresso', 'steamer'],
  coldBrew: ['coldBrewTap'],
  icedLatte: ['grinder', 'espresso', 'coldBrewTap'],
  mocha: ['grinder', 'espresso', 'steamer'],
  matcha: ['steamer'],
  special: ['coldBrewTap', 'steamer'],
};

export function isTierId(x: unknown): x is TierId {
  return typeof x === 'string' && (TIER_IDS as string[]).includes(x);
}

/** The shop's size (absent = the café). */
export function tierOf(state: GameState): TierId {
  return state.tier ?? 'cafe';
}

export function tierInfo(state: GameState): TierInfo {
  return TIERS[tierOf(state)];
}

/** The next tier up, or null at the café. */
export function nextTier(state: GameState): TierId | null {
  return TIER_IDS[TIER_IDS.indexOf(tierOf(state)) + 1] ?? null;
}

/** Floor width in tiles. */
export function floorWidth(state: GameState): number {
  return layoutFor(state.tier).width;
}

/** True when a station of this kind stands on the floor (FB1 WP5: read from the floor, not the tier). */
export function hasStation(state: GameState, kind: StationKind): boolean {
  return state.stations.some((s) => s.kind === kind);
}

/** True when the floor has every station the drink's recipe needs (a café with its steamer removed cannot make a latte). */
export function canMake(state: GameState, drink: DrinkId): boolean {
  return DRINK_STATIONS[drink].every((k) => hasStation(state, k));
}

/** Fresh, idle stations for a tier's default loadout. */
export function stationsFor(tier: TierId | undefined): Station[] {
  return stationsFromSlots(tier, defaultSlots(tier));
}

/** What the crew spent growing this run (for the week's fittings value). */
export function tierSpent(state: GameState): number {
  return (state.tierLog ?? []).reduce((a, e) => a + TIERS[e.tier].cost, 0);
}

/** The latest growth if it happened tonight (its day is the coming day), for the milestone banner and note. */
export function grownToday(state: GameState): { tier: TierId; day: number; by: string } | null {
  const last = state.tierLog?.[state.tierLog.length - 1];
  return last && last.day === state.day ? last : null;
}

/** Night input: grow into the next tier (in order, humans only, cash in hand). The new floor is set up at once: its default slots, with any extra machines moved to equipment. */
export function applyGrowInput(state: GameState, input: Extract<PlayerInput, { kind: 'grow' }>): GameState {
  if (state.phase !== 'night') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  if (nextTier(state) !== input.tier) return state;
  const cost = TIERS[input.tier].cost;
  if (state.cash < cost) return state;
  state.cash = Math.round((state.cash - cost) * 100) / 100;
  growSlots(state, state.tier, input.tier);
  state.tier = input.tier;
  state.tierLog = [...(state.tierLog ?? []), { tier: input.tier, day: state.day, by: p.name }];
  if (state.mop.heldBy === null) state.mop = { pos: { ...layoutFor(input.tier).mopHome }, heldBy: null };
  return state;
}

/** Morning: the milestone note on the first day in the bigger shop. */
export function growthMorning(state: GameState): string | null {
  const g = grownToday(state);
  if (!g) return null;
  const t = TIERS[g.tier];
  const w = layoutFor(g.tier).width;
  return `🎉 Grand re-opening: we're ${g.tier === 'cafe' ? 'a café' : `a ${t.short}`} now (grown by ${g.by})! The floor is ${w} tiles wide and the line holds ${t.queue}. ${t.milestone}`;
}

/** A smaller shop charges less and has fewer people walking past (the café is unchanged). */
export function applyGrowth(state: GameState, m: Modifiers): void {
  const t = tierInfo(state);
  if (t.traffic !== 1) m.traffic *= t.traffic;
  if (t.price !== 1) for (const d of Object.keys(m.price) as DrinkId[]) m.price[d] *= t.price;
}
