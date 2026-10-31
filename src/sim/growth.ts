/**
 * P3 B13: the growth path. A new run opens as a tiny kerbside stand and the crew grows it at night:
 * stand → coffee cart → the café. Each tier changes the floor (the rest of the lot is hoarding),
 * the stations (classic: the stand has no steamer), the line's length, the rent and who walks in:
 *
 *  - Stand: 8 tiles wide, grinder + espresso + cold-brew tap, a line of 3, $10 rent. Commuters in a
 *    hurry: more impatient walk-ins, no groups, fewer regulars.
 *  - Cart: 10 wide, a line of 5, $17 rent, some groups (classic: adds the steamer; FB2 C9 Gear: milk needs a wand, E3+).
 *  - Café: the full 12-wide floor, a line of 6, $25 rent, everyone (the game before B13).
 *
 * Runs without a tier (every save before B13) are the café. Pure arithmetic: no RNG of its own, and a
 * café run's numbers are exactly what they were.
 */
import { podsCoverGrinder, podsOnly } from './gear';
import { ECONOMY } from '../data/economy';
import { layoutFor } from '../data/layout';
import type { Modifiers } from './effects';
import { defaultSlots, ensureCounterSpots, slotCount, stationsFromSlots } from './slots';
import { growGearSlots, isGearRun, rebuildBar } from './gear';
import { DRINK_IDS, DRINK_INFO, GEAR_ONLY_DRINKS } from '../data/drinks';
import { emitLog } from './log';
import type { DrinkId, GameState, GrowDiff, PlayerInput, Station, StationKind, TierId } from './types';

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
    price: 0.8,
    traffic: 0.65,
    crowd: 'Commuters in a hurry, no groups. Fewer passers-by, and nobody pays café prices at a folding table (−20%)',
    blurb: 'A folding table, one grinder, one machine and a cold-brew keg. Everyone is late for something.',
    milestone: '',
  },
  cart: {
    name: 'Coffee cart',
    short: 'cart',
    icon: '🛺',
    cost: 70,
    queue: 5,
    rentPerDay: 17,
    mix: { impatient: 1.15, group: 0.5, regular: 0.85 },
    price: 0.9,
    traffic: 0.85,
    crowd: 'Some friends in pairs, more regulars. Busier, prices −10%',
    blurb: 'A proper cart with a striped awning, a beer fridge for the milk and room for one more machine. Put a wand on a Sylvia and lattes are back on the board.',
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
  drip: ['drip'],
  americano: ['grinder', 'espresso'],
  cappuccino: ['grinder', 'espresso', 'steamer'],
  doppio: ['grinder', 'espresso'],
  sweetCream: ['coldBrewTap'],
  cafeAuLait: ['drip', 'steamer'],
  redEye: ['drip', 'espresso'],
  pourOver: ['drip'],
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

/**
 * R3 6: the next tier up when the cash in hand covers it, else null (at the café, or too poor). Pure: the UI chip and the
 * `grow.affordable` event both read it. Ignores the phase and the Gear first night (stepNight's nudge handles those).
 */
export function nextTierAffordable(state: GameState): TierId | null {
  const next = nextTier(state);
  return next && state.cash >= TIERS[next].cost ? next : null;
}

/** Drinks whose recipe the tier's default floor can make (classic runs; Gear-only drinks left out unless `gear`). */
function drinksAt(tier: TierId, gear: boolean): DrinkId[] {
  const kinds = layoutFor(tier).stations.map((s) => s.kind);
  return DRINK_IDS.filter((d) => (gear || !GEAR_ONLY_DRINKS.includes(d)) && DRINK_STATIONS[d].every((k) => kinds.includes(k)));
}

/**
 * R3 7: what growing from `from` to `to` changes, before → after: the line, the price factor, foot traffic, the rent, who
 * comes in, and what is newly possible (floor tiles, back-bar slots or, in a classic run, stations and drinks; pairs and
 * groups walking in). Pure arithmetic on the tier table and layout: the UI previews it before buying, and `grow.done` carries it.
 */
export function growDiff(from: TierId, to: TierId, gear = true): GrowDiff {
  const a = TIERS[from];
  const b = TIERS[to];
  const unlocks: string[] = [];
  const tiles = layoutFor(to).width - layoutFor(from).width;
  if (tiles > 0) unlocks.push(`${tiles} more tiles of floor`);
  const slots = slotCount(to) - slotCount(from);
  if (gear && slots > 0) unlocks.push(`${slots} more back-bar slot${slots > 1 ? 's' : ''} for gear`);
  if (!gear) {
    const had = new Set(layoutFor(from).stations.map((s) => s.kind));
    const fresh = [...new Set(layoutFor(to).stations.map((s) => s.kind))].filter((k) => !had.has(k) && k !== 'counter' && k !== 'trash');
    if (fresh.length) unlocks.push(`New station${fresh.length > 1 ? 's' : ''}: ${fresh.join(', ')}`);
    const before = new Set(drinksAt(from, gear));
    const now = drinksAt(to, gear).filter((d) => !before.has(d)).map((d) => DRINK_INFO[d].name);
    if (now.length) unlocks.push(`New drinks: ${now.join(', ')}`);
  }
  if (b.mix.group > a.mix.group) unlocks.push(to === 'cafe' ? 'Groups come in' : 'Pairs of friends start coming');
  return {
    queue: { from: a.queue, to: b.queue },
    price: { from: a.price, to: b.price },
    traffic: { from: a.traffic, to: b.traffic },
    rent: { from: a.rentPerDay, to: b.rentPerDay },
    crowd: { from: a.crowd, to: b.crowd },
    unlocks,
  };
}

/** Floor width in tiles. */
export function floorWidth(state: GameState): number {
  return layoutFor(state.tier).width;
}

/** True when a station of this kind stands on the floor (FB1 WP5: read from the floor, not the tier). */
export function hasStation(state: GameState, kind: StationKind): boolean {
  return state.stations.some((s) => s.kind === kind);
}

/** True when the floor has every station the drink's recipe needs (no steam wand, no latte: FB2 C9's wand is the 'steamer' kind). */
export function canMake(state: GameState, drink: DrinkId): boolean {
  // Review I3: a pod machine has no hot-water tap or real group head, so a pods-only bar can't make these.
  if ((drink === 'americano' || drink === 'doppio' || drink === 'redEye') && podsOnly(state)) return false;
  // G4: a pod machine stands in for the grinder in a Gear run.
  return DRINK_STATIONS[drink].every((k) => hasStation(state, k) || (k === 'grinder' && podsCoverGrinder(state)));
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

/**
 * A classic run (tests and the balance script only; Round 4 f deleted the classic stations shop): the bigger shop opens
 * with its default stations.
 */
export function classicGrowSlots(state: GameState, to: TierId): void {
  state.slots = defaultSlots(to);
  state.stations = stationsFromSlots(to, state.slots);
}

/** Night input: grow into the next tier (in order, humans only, cash in hand). The new floor is set up at once (Gear: the owned gear moves over). */
export function applyGrowInput(state: GameState, input: Extract<PlayerInput, { kind: 'grow' }>): GameState {
  if (state.phase !== 'night') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  if (nextTier(state) !== input.tier) return state;
  const cost = TIERS[input.tier].cost;
  if (state.cash < cost) return state;
  state.cash = Math.round((state.cash - cost) * 100) / 100;
  if (isGearRun(state)) growGearSlots(state, input.tier);
  else classicGrowSlots(state, input.tier);
  const from = tierOf(state);
  state.tier = input.tier;
  ensureCounterSpots(state); // FB2 A4: the bigger shop's fridge (Gear runs; no-op in classic)
  if (isGearRun(state)) rebuildBar(state); // FB2 C10: moved machines stay where they still fit, else the defaults win
  state.tierLog = [...(state.tierLog ?? []), { tier: input.tier, day: state.day, by: p.name }];
  if (state.mop.heldBy === null) state.mop = { pos: { ...layoutFor(input.tier).mopHome }, heldBy: null };
  emitLog(state, 'grow.done', { from, to: input.tier, diff: growDiff(from, input.tier, state.gear === true) }); // R3 7
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
