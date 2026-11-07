import type { HostToClient } from '../net/transport';
import { TICK_RATE } from '../sim/constants';
import { step } from '../sim/step';
import type { GameState, PlayerInput } from '../sim/types';

/** Snapshots go out at 20 Hz. */
export const SNAPSHOT_INTERVAL_MS = 50;
/** After a stall, run at most this many ticks in one call and drop the rest. */
export const MAX_CATCHUP_TICKS = 10;

export interface Loop {
  advance(nowMs: number): void;
  pushInput(input: PlayerInput): void;
  /** The live state. Treat as read-only outside tests. */
  getState(): GameState;
}

/** Fixed-step driver: turns wall-clock time into whole ticks and posts snapshots on a cadence. */
export function createLoop(initial: GameState, post: (msg: HostToClient) => void, startMs: number): Loop {
  let state = initial;
  let pending: PlayerInput[] = [];
  let ticksDone = 0;
  let lastSnapshotMs = startMs;

  return {
    advance(nowMs) {
      const target = Math.floor(((nowMs - startMs) * TICK_RATE) / 1000);
      const wanted = target - ticksDone;
      const run = Math.min(wanted, MAX_CATCHUP_TICKS);
      const phaseBefore = state.phase;
      for (let i = 0; i < run; i++) {
        state = step(state, pending);
        pending = [];
      }
      ticksDone = wanted > MAX_CATCHUP_TICKS ? target : ticksDone + Math.max(run, 0);
      if (nowMs - lastSnapshotMs >= SNAPSHOT_INTERVAL_MS || state.phase !== phaseBefore) {
        post({ t: 'snapshot', state, sentAt: nowMs });
        lastSnapshotMs = nowMs;
      }
    },
    pushInput(input) {
      pending.push(input);
    },
    getState() {
      return state;
    },
  };
}
