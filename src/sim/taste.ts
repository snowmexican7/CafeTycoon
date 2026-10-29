import { DRINK_IDS } from '../data/drinks';
import type { DayStats, DrinkId, GameState, PlayerInput } from './types';

/**
 * P3 B6: a hidden, seeded taste map. Each drink can carry one house twist, picked at night on the
 * menu board. Every drink × twist pair has a hidden star rating (1–5) fixed by the run's seed; you
 * only learn it by serving that combo. Good combos tip and please more, poor ones less. The map is
 * a pure hash of the seed, so it never touches the sim's RNG stream.
 */
export type TwistId = 'cinnamon' | 'vanilla' | 'seaSalt' | 'honey' | 'oat';
export const TWISTS: TwistId[] = ['cinnamon', 'vanilla', 'seaSalt', 'honey', 'oat'];
export const TWIST_INFO: Record<TwistId, { name: string; icon: string }> = {
  cinnamon: { name: 'Cinnamon', icon: '🍂' },
  vanilla: { name: 'Vanilla', icon: '🌼' },
  seaSalt: { name: 'Sea salt', icon: '🧂' },
  honey: { name: 'Honey', icon: '🍯' },
  oat: { name: 'Oat milk', icon: '🌾' },
};

export const TASTE = {
  /** Tip multiplier by combo stars (index = stars; 0 unused). */
  tip: [1, 0.7, 0.85, 1, 1.2, 1.4],
  /** Rating per serve, per star away from 3 (summed over the day, then capped). */
  repPerServe: 0.004,
  repCap: 0.25,
  /** Ingredient cost of a twist, per cup. */
  cost: 0.2,
};

/** 32-bit integer hash (xmur3-style finaliser); pure, no RNG state. */
function hash32(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** The hidden stars (1–5) for a drink with a twist in this run. Each drink gets one 5★ and one 1★ twist. */
export function comboStars(seed: number, drink: DrinkId, twist: TwistId): number {
  const di = DRINK_IDS.indexOf(drink);
  // Shuffle the star ladder [5,4,3,2,1] across the five twists per drink, from the seed.
  const ladder = [5, 4, 3, 2, 1];
  for (let i = ladder.length - 1; i > 0; i--) {
    const j = hash32(seed * 31 + di * 977 + i * 7919) % (i + 1);
    [ladder[i], ladder[j]] = [ladder[j], ladder[i]];
  }
  return ladder[TWISTS.indexOf(twist)];
}

export const comboKey = (drink: DrinkId, twist: TwistId) => `${drink}:${twist}`;

export function twistFor(state: GameState, drink: DrinkId): TwistId | null {
  return state.twists?.[drink] ?? null;
}

/** Known stars for a combo, or null if nobody has served it yet. */
export function knownStars(state: GameState, drink: DrinkId, twist: TwistId): number | null {
  return state.tasteBook?.[comboKey(drink, twist)] ?? null;
}

/** At serve: the combo's stars (null with no twist); records a discovery on first serve. */
export function serveCombo(state: GameState, drink: DrinkId, today: DayStats): { twist: TwistId; stars: number; found: boolean } | null {
  const twist = twistFor(state, drink);
  if (!twist) return null;
  const stars = comboStars(state.seed, drink, twist);
  const key = comboKey(drink, twist);
  const found = state.tasteBook?.[key] === undefined;
  if (found) {
    state.tasteBook = { ...(state.tasteBook ?? {}), [key]: stars };
    (today.combosFound ??= []).push(key);
  }
  today.comboStarSum = (today.comboStarSum ?? 0) + (stars - 3);
  today.twistCost = Math.round(((today.twistCost ?? 0) + TASTE.cost) * 100) / 100;
  return { twist, stars, found };
}

export function comboTip(stars: number | undefined): number {
  return stars ? TASTE.tip[stars] ?? 1 : 1;
}

/** Closing rating change from today's combos: capped either way. */
export function comboRating(today: DayStats): number {
  const raw = (today.comboStarSum ?? 0) * TASTE.repPerServe;
  return Math.max(-TASTE.repCap, Math.min(TASTE.repCap, raw));
}

/** Night input: set or clear a drink's twist. */
export function applyTwistInput(state: GameState, input: Extract<PlayerInput, { kind: 'twist' }>): GameState {
  if (state.phase !== 'night') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  if (!DRINK_IDS.includes(input.drink)) return state;
  const next = { ...(state.twists ?? {}) };
  if (input.twist === null) delete next[input.drink];
  else if (TWISTS.includes(input.twist)) next[input.drink] = input.twist;
  else return state;
  if (Object.keys(next).length) state.twists = next;
  else delete state.twists;
  return state;
}
