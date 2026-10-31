/**
 * Round 3 item 5: pure helpers for the ring-up progress bar over the till.
 * No Pixi — unit-tested; layers/stations.ts and the scene draw from these.
 */
import { layoutFor } from '../data/layout';
import { ringProgress } from '../sim/till';
import type { GameState, Vec2 } from '../sim/types';

/** What to draw over the till while a ring is under way. */
export interface RingBar {
  /** 0..1 fill from `ringProgress(state)`. */
  progress: number;
  /** Self-order screen (`ringUp.by === ''`) vs a person ringing. */
  self: boolean;
  /** Till tile centre. */
  pos: Vec2;
}

/** The till's tile (Gear `counter` id, or the classic counter). */
export function tillPos(state: GameState): Vec2 {
  const live = state.stations.find((s) => s.id === 'counter');
  if (live) return live.pos;
  const lay = layoutFor(state.tier).stations.find((s) => s.kind === 'counter');
  return lay?.pos ?? { x: 6, y: 6 };
}

/** Ring-up bar state, or null when nobody is ringing. */
export function ringBar(state: GameState): RingBar | null {
  const progress = ringProgress(state);
  const r = state.ringUp;
  if (progress === null || !r) return null;
  return { progress, self: r.by === '', pos: tillPos(state) };
}

/** Short label over the bar (self-order vs a barista). */
export function ringBarLabel(self: boolean): string {
  return self ? 'Ordering…' : 'Ringing…';
}
