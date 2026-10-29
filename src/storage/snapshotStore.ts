import type { GameState } from '../sim/types';
import { forecastFor } from '../sim/forecast';
import { readJson, type StorageLike } from './storageLike';

const KEY = 'cafetycoon.run';

/**
 * Bump whenever GameState changes shape. Saves from a version with a migration below are upgraded;
 * anything older is ignored instead of crashing the worker.
 */
export const SNAPSHOT_VERSION = 4;

/** Upgrade steps, keyed by the version they upgrade from. Each fills in only what that version lacked. */
const MIGRATIONS: Record<number, (s: GameState) => void> = {
  // v4 (Phase 2 B4): neighbourhood forecasts.
  3: (s) => {
    s.forecast ??= forecastFor(s.seed, s.day);
  },
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
