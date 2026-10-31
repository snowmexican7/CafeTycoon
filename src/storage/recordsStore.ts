/**
 * Lifetime stats and records (B10), per browser, in localStorage. Folded in once per week-end screen
 * (and again if the crew keeps going and stops later: only the new days count). Pure fold +
 * a thin store, so the maths is testable without a browser.
 */
import type { Award } from '../sim/awards';
import type { DayStats, GameState } from '../sim/types';
import { isGearRun } from '../sim/gear';
import { profitOf } from '../sim/profit';
import { SEASON, seasonMedal, targetsHit, type Medal } from '../sim/season';
import { readJson, type StorageLike } from './storageLike';

const KEY = 'cafetycoon.records';
const KEEP_RUNS = 20;
const KEEP_MVPS = 8;
const KEEP_SEASONS = 6;

/** P4 follow-up: one row per season played (best first), updated at every season week-end. */
export interface SeasonRecord { key: string; seed: number; date: string; crew: string[]; weeksPlayed: number; hit: number; made: number; medal: Medal; done: boolean; /** P6: week-by-week profit vs target (optional: older records have none). */ weeks?: { week: number; target: number | null; profit: number }[] }

export interface Totals {
  days: number;
  served: number;
  perfect: number;
  slips: number;
  espressos: number;
  mopped: number;
  lost: number;
}

/** The four "best" records. Since G11 the top-level ones are Gear-era; classic runs keep their own. */
export interface Bests {
  bestWeek: Records['bestWeek'];
  bestDay: Records['bestDay'];
  bestDayProfit: Records['bestDayProfit'];
  longestRun: Records['longestRun'];
}

export interface Records {
  version: 1;
  /** Week-end screens reached (runs folded in). */
  weeks: number;
  totals: Totals;
  bestWeek: { score: number; seed: number; date: string; crew: string[]; days: number } | null;
  bestDay: { served: number; day: number; seed: number; date: string } | null;
  bestDayProfit: { profit: number; day: number; seed: number; date: string } | null;
  longestRun: { days: number; seed: number; date: string } | null;
  /** Awards won, by barista name (people only). */
  hall: Record<string, { mvp: number; awards: number }>;
  mvps: { name: string; seed: number; date: string }[];
  /** What has been counted for each recent run (key = seed|host), so a later stop only adds the new days. */
  counted: ({ key: string } & Totals)[];
  /**
   * G11 records split (still version 1, so v2 browsers read it fine). Once `split` is set, the top-level
   * bests are Gear-era only and `classic` holds the retired v2 bests ("Classic (retired)"). Totals and the
   * hall of fame stay lifetime.
   */
  split?: true;
  classic?: Bests;
  /** P4 follow-up: the season board (optional; older records have none). */
  seasons?: SeasonRecord[];
}

const ZERO: Totals = { days: 0, served: 0, perfect: 0, slips: 0, espressos: 0, mopped: 0, lost: 0 };

/** P6: keep only well-formed week rows (a damaged or older row just shows no week table). */
function cleanSeasonWeeks(x: SeasonRecord): SeasonRecord {
  const weeks = Array.isArray(x.weeks) ? x.weeks.filter((w) => w && typeof w.week === 'number' && Number.isFinite(w.profit) && (w.target === null || Number.isFinite(w.target))) : [];
  const { weeks: _drop, ...rest } = x;
  return weeks.length ? { ...rest, weeks } : rest;
}

export function emptyRecords(): Records {
  return { version: 1, weeks: 0, totals: { ...ZERO }, bestWeek: null, bestDay: null, bestDayProfit: null, longestRun: null, hall: {}, mvps: [], counted: [], split: true };
}

const NO_BESTS: Bests = { bestWeek: null, bestDay: null, bestDayProfit: null, longestRun: null };
const hasBests = (b: Bests) => !!(b.bestWeek || b.bestDay || b.bestDayProfit || b.longestRun);

/** G11: move pre-split (v2, all classic) bests into `classic` and start the Gear bests fresh. Pure, idempotent. */
export function splitRecords(r: Records): Records {
  if (r.split) return r;
  const old: Bests = { bestWeek: r.bestWeek ?? null, bestDay: r.bestDay ?? null, bestDayProfit: r.bestDayProfit ?? null, longestRun: r.longestRun ?? null };
  return { ...r, ...NO_BESTS, split: true, ...(hasBests(old) ? { classic: old } : {}) };
}

const dayProfit = profitOf; // review M2: the day's full net (branch, twists, licences, wages), like the rest of the game

export function runTotals(state: GameState): Totals {
  const crew = state.crew?.players ?? [];
  return {
    days: state.days.length,
    served: state.days.reduce((n, d) => n + d.served, 0),
    perfect: state.days.reduce((n, d) => n + (d.perfect ?? 0), 0),
    slips: state.days.reduce((n, d) => n + (d.slips ?? 0), 0),
    lost: state.days.reduce((n, d) => n + d.lost, 0),
    espressos: crew.reduce((n, r) => n + r.espressos, 0),
    mopped: crew.reduce((n, r) => n + r.mopped, 0),
  };
}

/** Fold one finished week (or a later stop of the same run) into the records. Pure. */
export function foldRecords(prev: Records, state: GameState, awards: Award[], date: string, score: number): Records {
  const r: Records = structuredClone(prev);
  const key = `${state.seed}|${state.hostId}`;
  const now = runTotals(state);
  const before = r.counted.find((c) => c.key === key);
  const fresh = !before;
  for (const k of Object.keys(ZERO) as (keyof Totals)[]) r.totals[k] += Math.max(0, now[k] - (before?.[k] ?? 0));
  r.counted = [{ key, ...now }, ...r.counted.filter((c) => c.key !== key)].slice(0, KEEP_RUNS);
  const crew = state.players.filter((p) => !p.bot).map((p) => p.name);
  if (fresh) r.weeks += 1;
  // G11: Gear runs set the headline bests; a classic run (an old save, or ?gear=0) only counts as "Classic (retired)".
  const b: Bests = r.split && !isGearRun(state) ? (r.classic ??= { ...NO_BESTS }) : r;
  if (!b.bestWeek || score > b.bestWeek.score) b.bestWeek = { score, seed: state.seed, date, crew, days: state.days.length };
  if (!b.longestRun || state.days.length > b.longestRun.days) b.longestRun = { days: state.days.length, seed: state.seed, date };
  for (const d of state.days) {
    if (!b.bestDay || d.served > b.bestDay.served) b.bestDay = { served: d.served, day: d.day, seed: state.seed, date };
    const p = dayProfit(d);
    if (!b.bestDayProfit || p > b.bestDayProfit.profit) b.bestDayProfit = { profit: p, day: d.day, seed: state.seed, date };
  }
  if (state.season) {
    const s = state.season;
    const later = s.weeks.filter((w) => w.target !== null);
    const row: SeasonRecord = { key, seed: state.seed, date, crew, weeksPlayed: later.length, hit: targetsHit(s), made: Math.round(later.reduce((n, w) => n + w.profit, 0) * 100) / 100, medal: seasonMedal(s), done: !!s.done || later.length >= SEASON.weeks - 1, weeks: s.weeks.map((w) => ({ week: w.week, target: w.target, profit: Math.round(w.profit * 100) / 100 })) };
    r.seasons = [row, ...(r.seasons ?? []).filter((x) => x.key !== key)].sort(seasonOrder).slice(0, KEEP_SEASONS);
  }
  if (fresh) {
    for (const a of awards) {
      if (a.bot || a.tone === 'joke') continue;
      // Own-key check: a crew name is a network string ("__proto__", "constructor") and must not find an inherited member (review I4).
      if (!Object.hasOwn(r.hall, a.winner)) Object.defineProperty(r.hall, a.winner, { value: { mvp: 0, awards: 0 }, enumerable: true, writable: true, configurable: true });
      const h = r.hall[a.winner]!;
      if (a.id === 'mvp') {
        h.mvp += 1;
        r.mvps = [{ name: a.winner, seed: state.seed, date }, ...r.mvps].slice(0, KEEP_MVPS);
      } else h.awards += 1;
    }
  }
  return r;
}

const MEDAL_RANK: Record<string, number> = { gold: 3, silver: 2, bronze: 1 };
/** Best season first: medal, then targets hit, then profit made. */
export function seasonOrder(a: SeasonRecord, b: SeasonRecord): number {
  return (MEDAL_RANK[b.medal ?? ''] ?? 0) - (MEDAL_RANK[a.medal ?? ''] ?? 0) || b.hit - a.hit || b.made - a.made;
}

function sanitize(raw: unknown): Records {
  const base = emptyRecords();
  if (!raw || typeof raw !== 'object' || (raw as Records).version !== 1) return base;
  const r = raw as Partial<Records>;
  const classic = r.classic && typeof r.classic === 'object' ? { ...NO_BESTS, ...r.classic } : undefined;
  return splitRecords({
    ...base,
    ...r,
    split: r.split === true ? true : undefined,
    totals: { ...ZERO, ...(r.totals ?? {}) },
    hall: r.hall && typeof r.hall === 'object' ? r.hall : {},
    mvps: Array.isArray(r.mvps) ? r.mvps : [],
    counted: Array.isArray(r.counted) ? r.counted : [],
    seasons: Array.isArray(r.seasons) ? r.seasons.filter((x) => x && typeof x === 'object' && typeof x.key === 'string').map(cleanSeasonWeeks) : undefined,
    ...(classic ? { classic } : {}),
  } as Records);
}

export function createRecordsStore(storage: StorageLike): { get(): Records; record(state: GameState, awards: Award[], date: string, score: number): Records } {
  const get = () => sanitize(readJson<unknown>(storage, KEY));
  return {
    get,
    record(state, awards, date, score) {
      if (state.dev) return get(); // R4 a: dev runs never reach the records
      const next = foldRecords(get(), state, awards, date, score);
      try {
        storage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* private mode: records just don't stick */
      }
      return next;
    },
  };
}
