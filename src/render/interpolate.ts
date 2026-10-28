import type { GameState, PlayerId, Vec2 } from '../sim/types';

/** What the scene draws: the latest state plus smoothed barista positions. */
export interface RenderView {
  state: GameState;
  baristaPositions: Record<PlayerId, Vec2>;
}

/** Blend barista positions between two snapshots. Everything else comes from `next`. */
export function interpolateView(prev: GameState | null, next: GameState, alpha: number): RenderView {
  const a = Math.min(1, Math.max(0, alpha));
  const baristaPositions: Record<PlayerId, Vec2> = {};
  for (const p of next.players) {
    const before = prev?.players.find((q) => q.id === p.id);
    baristaPositions[p.id] = before
      ? { x: before.pos.x + (p.pos.x - before.pos.x) * a, y: before.pos.y + (p.pos.y - before.pos.y) * a }
      : { ...p.pos };
  }
  return { state: next, baristaPositions };
}
