import { DRINK_IDS, dayUnlocks } from '../data/drinks';
import type { GameState } from '../sim/types';
import { forecastFor } from '../sim/forecast';
import { defaultSlots } from '../sim/slots';
import { readJson, type StorageLike } from './storageLike';

const KEY = 'cafetycoon.run';

/**
 * Bump whenever GameState changes shape. Saves from a version with a migration below are upgraded;
 * anything older is ignored instead of crashing the worker.
 */
export const SNAPSHOT_VERSION = 27;

/** Upgrade steps, keyed by the version they upgrade from. Each fills in only what that version lacked. */
const MIGRATIONS: Record<number, (s: GameState) => void> = {
  // v4 (Phase 2 B4): neighbourhood forecasts.
  3: (s) => {
    s.forecast ??= forecastFor(s.seed, s.day);
  },
  // v5 (Phase 2 B5): menu variety. Drinks known by today's day, every menu key, a flavour jar.
  4: (s) => {
    s.unlocked ??= dayUnlocks(s.day);
    for (const d of DRINK_IDS) if (s.menu[d] === undefined) s.menu[d] = true;
    s.supplies.flavour ??= 0;
    for (const d of [...s.days, s.today]) if (d?.drinks) for (const k of DRINK_IDS) d.drinks[k] ??= 0;
  },
  // v6 (Phase 2 B6): upgrade cards. A night's re-roll count (the radio report stays absent until heard).
  5: (s) => {
    s.rerolls ??= 0;
  },
  // v7 (Phase 2 B7): daily challenges + day curve (challenges dealt each night; absent = none yet).
  6: (s) => {
    s.challenges ??= [];
  },
  // v8 (Phase 2 B8): Easter egg pack 2 (absent = no eggs yet; morning reset fills it).
  7: (s) => {
    /* eggs stays undefined until eggsMorning / first gag */
  },
  // v9 (Phase 2 B10): crew stats for the awards. Start counting from now (older days have no per-player stats; the few log entries still in the save are counted).
  8: (s) => {
    s.crew ??= { seen: 0, players: [] };
  },
  // v10 (Phase 3 B1): barista roles. Optional per player; absent = no role, so nothing to fill.
  9: () => {},
  // v11 (Phase 3 B2): per-drink price steps. Optional; absent = list prices.
  10: () => {},
  // v12 (Phase 3 B3): regular loyalty. Optional; absent = 0.
  11: () => {},
  // P3 B4: pastries join the pantry.
  12: (s) => {
    if (s.supplies && s.supplies.pastry === undefined) s.supplies.pastry = 0;
  },
  // P3 B5: recipe accuracy. Cup marks start clean; a machine mid-run counts its run from now.
  13: (s) => {
    for (const st of s.stations ?? []) if (st.busyTicksLeft > 0 && st.busyTotal === undefined) st.busyTotal = st.busyTicksLeft;
  },
  // P3 B6: taste map. No twists set and an empty notebook are both "absent", so nothing to fill in.
  14: () => {},
  // P3 B7: signature drink. No signature is "absent", so nothing to fill in.
  15: () => {},
  // P3 B8: taste seasons. A notebook entry with no season was learned in season 0, which is what
  // "absent" means, so older entries correctly read as stale once a later season starts.
  16: () => {},
  // P3 B9: the rival. Never scouted and nothing copied are both "absent".
  17: () => {},
  // P3 B10: ad campaigns. No campaign booked is "absent".
  18: () => {},
  // P3 B11: pitch an idea. No pitch yet is "absent".
  19: () => {},
  // P3 B12: the checkout path. The old kiosk and Squarely shop cards become installed checkouts
  // (their effects now come from the checkout, so the cards leave the owned list and the deal).
  20: (s) => {
    const had = (id: string) => (s.owned ?? []).some((o) => o.itemId === id);
    const kiosk = had('digitalKiosk');
    const squarely = had('squarelyTerminal');
    if (kiosk || squarely) {
      s.checkout ??= { owned: squarely ? ['register', 'kiosk', 'squarely'] : ['register', 'kiosk'], active: squarely ? 'squarely' : 'kiosk' };
    }
    const gone = (id: string) => id === 'digitalKiosk' || id === 'squarelyTerminal';
    s.owned = (s.owned ?? []).filter((o) => !gone(o.itemId));
    s.hand = (s.hand ?? []).filter((id) => !gone(id));
    s.boughtTonight = (s.boughtTonight ?? []).filter((id) => !gone(id));
  },
  // P3 B13: the growth path. Every run before it was the full café (its stations and floor already match).
  21: (s) => {
    s.tier ??= 'cafe';
  },
  // FB1 WP4: sold-out walk-ups are counted per day; earlier days saw none.
  22: (s) => {
    for (const d of [...(s.days ?? []), s.today]) if (d) d.soldOutWalkouts ??= 0;
  },
  // FB1 WP1-sim: lastCall is optional (absent = no last call); nothing to migrate.
  23: () => {},
  // FB1 WP5: station slots. Every older run has its tier's default stations, so its slots are the defaults and nothing is spare.
  24: (s) => {
    s.slots ??= defaultSlots(s.tier);
    s.equipment ??= [];
  },
  // Bots wait before taking a machine's output: Station.outputSince is optional (absent = age unknown, falls back to doneAt).
  25: () => {},
  // Collisions: Player.staggerTicksLeft / bumpCooldown and DayStats.bumps / bumpSpills are optional (absent = none).
  26: () => {},
};

/** Bring a saved state up to SNAPSHOT_VERSION, or null when no migration path exists. */
export function migrateSnapshot(version: number, state: GameState): GameState | null {
  for (let v = version; v < SNAPSHOT_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return null;
    step(state);
  }
  return version > SNAPSHOT_VERSION ? null : state;
}

interface Envelope {
  version: number;
  state: GameState;
}

/** The running game, saved so a crashed or refreshed host can pick the run back up. */
export function createSnapshotStore(storage: StorageLike): {
  save(state: GameState): void;
  load(): GameState | null;
  clear(): void;
} {
  return {
    save: (state) => storage.setItem(KEY, JSON.stringify({ version: SNAPSHOT_VERSION, state } satisfies Envelope)),
    load: () => {
      const env = readJson<Partial<Envelope>>(storage, KEY);
      if (!env || typeof env.version !== 'number') return null;
      const s = env.state;
      if (!s || typeof s !== 'object' || typeof (s as GameState).phase !== 'string') return null;
      return migrateSnapshot(env.version, s);
    },
    clear: () => storage.removeItem(KEY),
  };
}
