import { ECONOMY } from '../data/economy';
import { parseBots } from '../net/protocol';
import type { BotsChoice, Pace } from '../sim/types';
import { readJson, type StorageLike } from './storageLike';

const KEY = 'cafetycoon.settings';

/** Per-browser preferences and this player's identity token. */
export interface LocalSettings {
  playerName: string;
  playerToken: string;
  pace: Pace;
  dayLengthSec: number;
  nightLengthSec: number;
  /** Bots in a run you host: 'auto' (fill the café), or 0..3. Solo play reads this. */
  bots: BotsChoice;
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
    bots: 'auto',
  });
  const get = (): LocalSettings => {
    const stored = readJson<Partial<LocalSettings>>(storage, KEY);
    const merged = { ...defaults(), ...stored };
    merged.bots = parseBots(merged.bots) ?? 'auto';
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
