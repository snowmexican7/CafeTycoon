/**
 * Lifetime stats and records (B10), per browser, in localStorage. Folded in once per week-end screen
 * (and again if the crew keeps going and stops later: only the new days count). Pure fold +
 * a thin store, so the maths is testable without a browser.
 */
import type { Award } from '../sim/awards';
import { crewOf } from '../sim/stats';
import type { DayStats, GameState } from '../sim/types';
import { readJson, type StorageLike } from './storageLike';

const KEY = 'cafetycoon.records';
const KEEP_RUNS = 20;
const KEEP_MVPS = 8;

export interface Totals {
  days: number;
  served: number;
  perfect: number;
  slips: number;
  espressos: number;
  mopped: number;
  lost: number;
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
}

const ZERO: Totals = { days: 0, served: 0, perfect: 0, slips: 0, espressos: 0, mopped: 0, lost: 0 };

export function emptyRecords(): Records {
  return { version: 1, weeks: 0, totals: { ...ZERO }, bestWeek: null, bestDay: null, bestDayProfit: null, longestRun: null, hall: {}, mvps: [], counted: [] };
}

const dayProfit = (d: DayStats) => Math.round((d.sales + d.tips + (d.bonus ?? 0) - d.rent - (d.fines ?? 0) - (d.debtPaid ?? 0)) * 100) / 100;

export function runTotals(state: GameState): Totals {
  const crew = crewOf(state).players;
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
  if (!r.bestWeek || score > r.bestWeek.score) r.bestWeek = { score, seed: state.seed, date, crew, days: state.days.length };
  if (!r.longestRun || state.days.length > r.longestRun.days) r.longestRun = { days: state.days.length, seed: state.seed, date };
  for (const d of state.days) {
    if (!r.bestDay || d.served > r.bestDay.served) r.bestDay = { served: d.served, day: d.day, seed: state.seed, date };
    const p = dayProfit(d);
    if (!r.bestDayProfit || p > r.bestDayProfit.profit) r.bestDayProfit = { profit: p, day: d.day, seed: state.seed, date };
  }
  if (fresh) {
    for (const a of awards) {
      if (a.bot || a.tone === 'joke') continue;
      const h = (r.hall[a.winner] ??= { mvp: 0, awards: 0 });
      if (a.id === 'mvp') {
        h.mvp += 1;
        r.mvps = [{ name: a.winner, seed: state.seed, date }, ...r.mvps].slice(0, KEEP_MVPS);
      } else h.awards += 1;
    }
  }
  return r;
}

function sanitize(raw: unknown): Records {
  const base = emptyRecords();
  if (!raw || typeof raw !== 'object' || (raw as Records).version !== 1) return base;
  const r = raw as Partial<Records>;
  return {
    ...base,
    ...r,
    totals: { ...ZERO, ...(r.totals ?? {}) },
    hall: r.hall && typeof r.hall === 'object' ? r.hall : {},
    mvps: Array.isArray(r.mvps) ? r.mvps : [],
    counted: Array.isArray(r.counted) ? r.counted : [],
  } as Records;
}

export function createRecordsStore(storage: StorageLike): { get(): Records; record(state: GameState, awards: Award[], date: string, score: number): Records } {
  const get = () => sanitize(readJson<unknown>(storage, KEY));
  return {
    get,
    record(state, awards, date, score) {
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
