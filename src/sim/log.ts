import type { GameState, SimEvent, SimEventKind } from './types';

/** How long a log entry stays in state, so the host can drain it into telemetry. */
export const LOG_KEEP_TICKS = 120;

export function emitLog(state: GameState, kind: SimEventKind, data?: SimEvent['data']): void {
  state.log.push({ seq: state.nextLogSeq++, tick: state.tick, kind, data: data ?? {} });
}

export function pruneLog(state: GameState): void {
  state.log = state.log.filter((e) => state.tick - e.tick <= LOG_KEEP_TICKS);
}
