import type { GameState } from '../sim/types';
import { readJson, type StorageLike } from './storageLike';

const KEY = 'cafetycoon.run';

/** Bump whenever GameState changes shape; older saves are then ignored instead of crashing the worker. */
export const SNAPSHOT_VERSION = 3;

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
      if (!env || env.version !== SNAPSHOT_VERSION) return null;
      const s = env.state;
      if (!s || typeof s !== 'object' || typeof (s as GameState).phase !== 'string') return null;
      return s;
    },
    clear: () => storage.removeItem(KEY),
  };
}
