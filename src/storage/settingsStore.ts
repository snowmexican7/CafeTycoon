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
  /** Bots in a co-op room you host: 'auto' (fill the café), or 0..3. Kept for old stored JSON; solo reads soloBots. */
  bots: BotsChoice;
  /**
   * Bots in a solo run: 0..3 or 'auto', default 1 (a helper, not a crew). A separate key from `bots` so every
   * player who already has `bots: 'auto'` stored still gets the new solo default. main.ts passes it to the run
   * as `CreateRunOptions.settings.bots`.
   */
  soloBots: BotsChoice;
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
    soloBots: 1,
  });
  const get = (): LocalSettings => {
    const stored = readJson<Partial<LocalSettings>>(storage, KEY);
    const merged = { ...defaults(), ...stored };
    merged.bots = parseBots(merged.bots) ?? 'auto';
    merged.soloBots = parseBots(merged.soloBots) ?? 1;
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
