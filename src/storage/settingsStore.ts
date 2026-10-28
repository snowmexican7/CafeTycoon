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
  });
  const get = (): LocalSettings => {
    const stored = readJson<Partial<LocalSettings>>(storage, KEY);
    const merged = { ...defaults(), ...stored };
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
