import { ECONOMY } from '../data/economy';
import type { Pace } from '../sim/types';
import { readJson, type StorageLike } from './storageLike';

const KEY = 'cafetycoon.settings';

/** Per-browser preferences and this player's identity token. */
export interface LocalSettings {
  playerName: string;
  playerToken: string;
  pace: Pace;
  dayLengthSec: number;
  nightLengthSec: number;
  /**
   * Bot cut step 3: a solo run's robot cashier (src/sim/cashier.ts), on by default (also for stored settings that
   * predate it). main.ts passes it to a solo run as `CreateRunOptions.settings.cashier`; a co-op room never has one.
   */
  soloCashier: boolean;
}

export function createSettingsStore(
  storage: StorageLike,
  randomToken: () => string,
): { get(): LocalSettings; set(patch: Partial<LocalSettings>): LocalSettings } {
  const defaults = (): LocalSettings => ({
    playerName: 'Barista',
    playerToken: randomToken(),
    pace: 3,
    dayLengthSec: ECONOMY.dayLengthSec,
    nightLengthSec: ECONOMY.nightLengthSec,
    soloCashier: true,
  });
  const get = (): LocalSettings => {
    const stored = readJson<Partial<LocalSettings>>(storage, KEY);
    // Only the keys LocalSettings knows (bot cut 4a: the old bots choices in stored JSON are dropped).
    const merged = defaults();
    const known = merged as unknown as Record<string, unknown>;
    for (const k of Object.keys(known)) if (stored && k in stored) known[k] = (stored as Record<string, unknown>)[k];
    merged.soloCashier = merged.soloCashier !== false; // only an explicit false switches it off
    if (!stored || !stored.playerToken) storage.setItem(KEY, JSON.stringify(merged));
    return merged;
  };
  return {
    get,
    set(patch) {
      const next = { ...get(), ...patch };
      storage.setItem(KEY, JSON.stringify(next));
      return next;
    },
  };
}
