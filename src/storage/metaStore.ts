/**
 * P3 B16: progress carried between runs ("meta"), per browser, under its own localStorage key with
 * its own version. Separate from the run save (snapshotStore) and the records (recordsStore) so a
 * bad meta save can never stop a new run: anything unreadable reads as a fresh meta (the raw text
 * is kept once under `cafetycoon.meta.bad`), and a save from a newer version is read but never
 * overwritten.
 *
 * Only Gear runs count. Folded at the week-end screen (like the records), keyed per run so a later
 * stop only adds the new drinks.
 */
import { isPerkId, PERK_IDS, PERK_TUNING, type PerkId } from '../data/perks';
import { DRINK_IDS } from '../data/drinks';
import type { DrinkId, GameState, TierId } from '../sim/types';
import { readJson, type StorageLike } from './storageLike';
import type { Records } from './recordsStore';

export const META_KEY = 'cafetycoon.meta';
export const META_BAD_KEY = 'cafetycoon.meta.bad';
export const RECORDS_KEY = 'cafetycoon.records';
export const META_VERSION = 1;
const KEEP_RUNS = 20;
const TIER_RANK: Record<TierId, number> = { stand: 0, cart: 1, cafe: 2 };

export interface MetaSave {
  version: 1;
  /** Gear runs that reached the week-end screen. */
  weeks: number;
  /** Drinks served across Gear runs. */
  served: number;
  /** Biggest shop any Gear run grew into. */
  bestTier: TierId;
  /** Drinks ever unlocked in a Gear run (the recipe book). */
  discovered: DrinkId[];
  unlocked: PerkId[];
  /** The head start picked last time, preselected on the title. */
  lastPerk: PerkId | null;
  /** What each recent run already added (key = seed|host). */
  counted: { key: string; served: number; week: boolean; tier: TierId }[];
}

export function emptyMeta(): MetaSave {
  return { version: 1, weeks: 0, served: 0, bestTier: 'stand', discovered: [], unlocked: [], lastPerk: null, counted: [] };
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const isTier = (v: unknown): v is TierId => v === 'stand' || v === 'cart' || v === 'cafe';
const maxTier = (a: TierId, b: TierId): TierId => (TIER_RANK[b] > TIER_RANK[a] ? b : a);

/** The head starts this progress has earned. */
export function earnedPerks(m: Pick<MetaSave, 'weeks' | 'served' | 'bestTier'>): PerkId[] {
  const out: PerkId[] = [];
  if (m.weeks >= 1) out.push('nestEgg');
  if (m.served >= PERK_TUNING.pantryServed) out.push('pantry');
  if (TIER_RANK[m.bestTier] >= TIER_RANK.cart) out.push('wordOfMouth');
  return out;
}

export type MetaRead = { meta: MetaSave; status: 'fresh' | 'ok' | 'migrated' | 'corrupt' | 'future' };

/**
 * Turn whatever is stored into a valid MetaSave. Never throws. `null` (nothing saved yet) seeds
 * from the lifetime records, so v3.0.0 players who already finished a Gear week keep the credit.
 */
export function migrateMeta(raw: unknown, records: Records | null = null): MetaRead {
  if (raw === null || raw === undefined) {
    const m = emptyMeta();
    // records.split marks G11+ records, whose top-level bests are Gear-era only.
    if (records?.split && records.bestWeek) m.weeks = 1;
    m.unlocked = earnedPerks(m);
    return { meta: m, status: m.weeks ? 'migrated' : 'fresh' };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return { meta: emptyMeta(), status: 'corrupt' };
  const r = raw as Record<string, unknown>;
  if (typeof r.version === 'number' && r.version > META_VERSION) return { meta: { ...emptyMeta(), ...sanitizeV1(r) }, status: 'future' };
  if (r.version !== 1) return { meta: emptyMeta(), status: 'corrupt' };
  return { meta: sanitizeV1(r), status: 'ok' };
}

function sanitizeV1(r: Record<string, unknown>): MetaSave {
  const m: MetaSave = {
    version: 1,
    weeks: num(r.weeks),
    served: num(r.served),
    bestTier: isTier(r.bestTier) ? r.bestTier : 'stand',
    discovered: Array.isArray(r.discovered) ? [...new Set(r.discovered.filter((d): d is DrinkId => (DRINK_IDS as string[]).includes(d as string)))] : [],
    unlocked: Array.isArray(r.unlocked) ? [...new Set(r.unlocked.filter(isPerkId))] : [],
    lastPerk: isPerkId(r.lastPerk) ? r.lastPerk : null,
    counted: Array.isArray(r.counted)
      ? r.counted
          .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && typeof (c as { key?: unknown }).key === 'string')
          .map((c) => ({ key: c.key as string, served: num(c.served), week: c.week === true, tier: isTier(c.tier) ? c.tier : 'stand' }))
          .slice(-KEEP_RUNS)
      : [],
  };
  // Unlocks never go away, and anything the progress has earned is unlocked.
  m.unlocked = PERK_IDS.filter((p) => m.unlocked.includes(p) || earnedPerks(m).includes(p));
  if (m.lastPerk && !m.unlocked.includes(m.lastPerk)) m.lastPerk = null;
  return m;
}

const runKey = (s: GameState) => `${s.seed}|${s.hostId}`;

/** Add a Gear run's progress. Pure and idempotent: folding the same state twice changes nothing. */
export function foldMeta(prev: MetaSave, state: GameState): { meta: MetaSave; newly: PerkId[] } {
  if (!state.gear || state.dev) return { meta: prev, newly: [] }; // R4 a: a dev run never earns head starts
  const key = runKey(state);
  const before = prev.counted.find((c) => c.key === key) ?? { key, served: 0, week: false, tier: 'stand' as TierId };
  const served = state.days.reduce((n, d) => n + d.served, 0);
  const week = before.week || ((state.phase === 'weekEnd' || state.phase === 'ended') && !state.bankrupt && state.days.length >= 7);
  const tier: TierId = maxTier(before.tier, state.tier ?? 'cafe');
  const now = { key, served: Math.max(served, before.served), week, tier };
  const meta: MetaSave = {
    ...prev,
    weeks: prev.weeks + (now.week && !before.week ? 1 : 0),
    served: prev.served + (now.served - before.served),
    bestTier: maxTier(prev.bestTier, tier),
    discovered: [...new Set([...prev.discovered, ...(state.unlocked ?? [])])],
    counted: [...prev.counted.filter((c) => c.key !== key), now].slice(-KEEP_RUNS),
  };
  const earned = earnedPerks(meta);
  const newly = earned.filter((p) => !prev.unlocked.includes(p));
  meta.unlocked = PERK_IDS.filter((p) => prev.unlocked.includes(p) || earned.includes(p));
  return { meta, newly };
}

export interface MetaStore {
  get(): MetaSave;
  /** Fold a run in; returns the head starts it just unlocked. */
  record(state: GameState): PerkId[];
  /** Remember the title pick (null = none). */
  setLastPerk(perk: PerkId | null): void;
}

export function createMetaStore(storage: StorageLike): MetaStore {
  const read = (): MetaRead => {
    let raw: string | null = null;
    try {
      raw = storage.getItem(META_KEY);
    } catch {
      return { meta: emptyMeta(), status: 'fresh' };
    }
    let parsed: unknown = null;
    if (raw !== null) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = '<unparseable>';
      }
    }
    const res = migrateMeta(parsed, raw === null ? readJson<Records>(storage, RECORDS_KEY) : null);
    if (res.status === 'corrupt' && raw !== null) {
      try {
        if (storage.getItem(META_BAD_KEY) === null) storage.setItem(META_BAD_KEY, raw);
      } catch {
        /* ignore */
      }
    }
    return res;
  };
  const write = (res: MetaRead, meta: MetaSave) => {
    if (res.status === 'future') return; // a newer build owns this save
    try {
      storage.setItem(META_KEY, JSON.stringify(meta));
    } catch {
      /* private mode: progress just doesn't stick */
    }
  };
  return {
    get: () => read().meta,
    record(state) {
      const res = read();
      const { meta, newly } = foldMeta(res.meta, state);
      if (meta !== res.meta) write(res, meta);
      return newly;
    },
    setLastPerk(perk) {
      const res = read();
      const lastPerk = perk && res.meta.unlocked.includes(perk) ? perk : null;
      if (res.meta.lastPerk === lastPerk && res.status === 'ok') return;
      write(res, { ...res.meta, lastPerk });
    },
  };
}
