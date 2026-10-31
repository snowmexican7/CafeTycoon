import { DRINK_IDS, DRINK_INFO, GEAR_ONLY_DRINKS } from '../data/drinks';
import { layoutFor } from '../data/layout';
import { DRINK_STATIONS, nextTier, TIER_IDS, TIERS } from '../sim/growth';
import { slotCount } from '../sim/slots';
import type { DrinkId, GameState, TierId } from '../sim/types';

/**
 * ui-3.4.0: the pure side of growing the shop (stand → cart → café): spotting the grow in the state stream,
 * the "What you gained" comparison, and the night nudge when the next size is affordable. No DOM here.
 */

/** What the client last saw: the run (seed) and its tier. */
export interface GrowSeen {
  seed: number;
  tier: TierId;
}

export function growSeen(state: Pick<GameState, 'seed' | 'tier'>): GrowSeen {
  return { seed: state.seed, tier: state.tier ?? 'cafe' };
}

/**
 * A grow happened between two states of the same run when the tier moved up. A new run, a loaded save or the first
 * state (prev null) is not a grow, so resuming a café run never replays the banner.
 */
export function detectGrow(prev: GrowSeen | null, state: Pick<GameState, 'seed' | 'tier'>): { from: TierId; to: TierId } | null {
  if (!prev || prev.seed !== state.seed) return null;
  const to = state.tier ?? 'cafe';
  return TIER_IDS.indexOf(to) > TIER_IDS.indexOf(prev.tier) ? { from: prev.tier, to } : null;
}

export interface GainedRow {
  label: string;
  from: string;
  to: string;
  /** good: better for you; bad: costs you more (rent); same: unchanged. */
  tone: 'good' | 'bad' | 'same';
}

export interface GainedVM {
  from: { id: TierId; name: string; icon: string };
  to: { id: TierId; name: string; icon: string };
  rows: GainedRow[];
  crowd: { from: string; to: string };
  unlocks: string[];
  blurb: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const row = (label: string, from: string, to: string, better: boolean | null): GainedRow => ({ label, from, to, tone: from === to ? 'same' : better === null ? 'same' : better ? 'good' : 'bad' });

function drinksAt(tier: TierId, gear: boolean): DrinkId[] {
  const kinds = layoutFor(tier).stations.map((s) => s.kind);
  return DRINK_IDS.filter((d) => (gear || !GEAR_ONLY_DRINKS.includes(d)) && DRINK_STATIONS[d].every((k) => kinds.includes(k)));
}

/** Old vs new for the "What you gained" card: line, prices, foot traffic, rent, who comes, and what unlocks. */
export function gainedDiff(from: TierId, to: TierId, gear = true): GainedVM {
  const a = TIERS[from];
  const b = TIERS[to];
  const rows = [
    row('Line holds', `${a.queue} people`, `${b.queue} people`, b.queue > a.queue),
    row('Prices you can charge', pct(a.price), pct(b.price), b.price > a.price),
    row('People walking by', pct(a.traffic), pct(b.traffic), b.traffic > a.traffic),
    row('Rent a day', money(a.rentPerDay), money(b.rentPerDay), b.rentPerDay < a.rentPerDay),
  ];
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
    from: { id: from, name: a.name, icon: a.icon },
    to: { id: to, name: b.name, icon: b.icon },
    rows,
    crowd: { from: a.crowd, to: b.crowd },
    unlocks,
    blurb: b.blurb,
  };
}

export interface GrowNudge {
  tier: TierId;
  name: string;
  short: string;
  icon: string;
  cost: number;
}

/**
 * The night chip "You can afford a cart!": at night, when the next size up is affordable. Not on a Gear run's first
 * night (that night is for picking the first gear, and the starting cash already covers a cart).
 */
export function growNudge(state: Pick<GameState, 'phase' | 'cash' | 'tier' | 'day' | 'gear'>): GrowNudge | null {
  if (state.phase !== 'night') return null;
  if (state.gear === true && state.day <= 1) return null;
  const next = nextTier(state as GameState);
  if (!next) return null;
  const t = TIERS[next];
  if (state.cash < t.cost) return null;
  return { tier: next, name: t.name, short: t.short, icon: t.icon, cost: t.cost };
}

/** "a cart" / "the café". */
export function tierPhrase(tier: TierId): string {
  return tier === 'cafe' ? 'the café' : `a ${TIERS[tier].short}`;
}

