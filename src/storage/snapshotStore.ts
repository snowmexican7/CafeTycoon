import type { GameState } from '../sim/types';
import { ensureCounterSpots } from '../sim/slots';
import { readJson, type StorageLike } from './storageLike';

const KEY = 'cafetycoon.run';

/**
 * Bump whenever GameState changes shape. Kennedy (2026-10-30, docs/HANDOFF.md "Decisions"): no save backwards
 * compatibility for now, so there are no migrations: a save from any other version is turned away (the title then starts
 * fresh) instead of crashing the worker. 29: FB2 C9, the steamer tree retired (wands on the espresso machine,
 * `slotWand`, `Station.wand`); every older save is refused. 30: FB2 C10, moved stations (`slotPos`) and the morning
 * pre-open (`preOpenUntil`). 31: Round 4 night clutter, roles/rerolls/classic equipment removed from the state.
 * 32: Round 5 espresso hopper (`Station.doses`) and grounds polish credit (`Player.groundsPolish`). 33: Round 5
 * block 5, the morning pre-open removed (`preOpenUntil` gone from the state; rearranging is at night).
 * Recheck before 1.0.
 */
export const SNAPSHOT_VERSION = 37; // 37: specialty shops phase 1, GameState.soldWindow and shopIdentity, DayStats.oneOffLeft. 36: playtest feel, GameState.learned (how-to queue). 35: bot cut step 4b, GameState.callDecision replaces callAnswer/callRang; crew stats rows lose `bot`. 34: Round 6 block 4, the milk counter's own stock (`supplyMilk`).

/** A saved state if it was written at SNAPSHOT_VERSION (with its shop's fixed spots made sure of), else null. */
export function migrateSnapshot(version: number, state: GameState): GameState | null {
  if (version !== SNAPSHOT_VERSION) return null;
  // FB2 review I1: every Gear save gets the fixed spots its shop has (the fridge, A3's sink…).
  ensureCounterSpots(state);
  return state;
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
