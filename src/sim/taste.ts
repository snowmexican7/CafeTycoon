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
  tip: [1, 0.55, 0.85, 1, 1.2, 1.45],
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

/** P3 B8: seasons. Tastes drift every `TASTE_SEASON.days` days (season 0 is days 1..3). */
export const TASTE_SEASON = { days: 3 };

export function seasonOf(day: number): number {
  return Math.max(0, Math.floor((Math.max(1, day) - 1) / TASTE_SEASON.days));
}

/** True when `day` opens a new taste season (never day 1). */
export function seasonStarts(day: number): boolean {
  return day > 1 && (day - 1) % TASTE_SEASON.days === 0;
}

/** The base ladder for a drink: [stars per twist], one 5★ and one 1★, from the seed. */
function baseLadder(seed: number, di: number): number[] {
  // Shuffle the star ladder [5,4,3,2,1] across the five twists per drink, from the seed.
  const ladder = [5, 4, 3, 2, 1];
  for (let i = ladder.length - 1; i > 0; i--) {
    const j = hash32(seed * 31 + di * 977 + i * 7919) % (i + 1);
    [ladder[i], ladder[j]] = [ladder[j], ladder[i]];
  }
  return ladder;
}

/** Which twist (index) steps up to 5★ in season `s` (≥1): the current 4★ or 3★, from the seed. */
function riser(seed: number, di: number, s: number, ladder: number[]): number {
  const target = hash32(seed * 131 + di * 613 + s * 104729) % 2 === 0 ? 4 : 3;
  return ladder.indexOf(target);
}

/** The ladder in season `s`: each new season the reigning 5★ trades places with a 4★ or 3★. */
function seasonLadder(seed: number, di: number, s: number): number[] {
  const ladder = baseLadder(seed, di);
  for (let k = 1; k <= s; k++) {
    const top = ladder.indexOf(5);
    const up = riser(seed, di, k, ladder);
    [ladder[top], ladder[up]] = [ladder[up], ladder[top]];
  }
  return ladder;
}

/**
 * The hidden stars (1–5) for a drink with a twist in this run, on `day` (default: day 1's season).
 * Each drink always has one 5★ and one 1★ twist; the 5★ moves each season (B8).
 */
export function comboStars(seed: number, drink: DrinkId, twist: TwistId, day = 1): number {
  const di = DRINK_IDS.indexOf(drink);
  return seasonLadder(seed, di, seasonOf(day))[TWISTS.indexOf(twist)];
}

/** The twist that becomes 5★ for a drink when the season opening on `day` starts. */
export function risingTwist(seed: number, drink: DrinkId, day: number): TwistId {
  const di = DRINK_IDS.indexOf(drink);
  return TWISTS[seasonLadder(seed, di, seasonOf(day)).indexOf(5)];
}

export const comboKey = (drink: DrinkId, twist: TwistId) => `${drink}:${twist}`;

export function twistFor(state: GameState, drink: DrinkId): TwistId | null {
  return state.twists?.[drink] ?? null;
}

/** Known stars for a combo, or null if nobody has served it yet. */
export function knownStars(state: GameState, drink: DrinkId, twist: TwistId): number | null {
  return state.tasteBook?.[comboKey(drink, twist)] ?? null;
}

/** P3 B8: the notebook entry was learned in an earlier taste season, so it may have drifted. */
export function knownStale(state: GameState, drink: DrinkId, twist: TwistId): boolean {
  const key = comboKey(drink, twist);
  if (state.tasteBook?.[key] === undefined) return false;
  return (state.tasteSeason?.[key] ?? 0) < seasonOf(state.day);
}

/** At serve: the combo's stars (null with no twist); records a discovery on first serve. */
export function serveCombo(state: GameState, drink: DrinkId, today: DayStats, override?: TwistId): { twist: TwistId; stars: number; found: boolean } | null {
  const twist = override ?? twistFor(state, drink);
  if (!twist) return null;
  const stars = comboStars(state.seed, drink, twist, state.day);
  const key = comboKey(drink, twist);
  const found = state.tasteBook?.[key] === undefined;
  const season = seasonOf(state.day);
  const stale = !found && (state.tasteSeason?.[key] ?? 0) < season;
  if (found || stale) {
    state.tasteBook = { ...(state.tasteBook ?? {}), [key]: stars };
    if (season > 0 || state.tasteSeason) state.tasteSeason = { ...(state.tasteSeason ?? {}), [key]: season };
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
