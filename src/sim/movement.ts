import { ECONOMY } from '../data/economy';
import { LAYOUT } from '../data/layout';
import { floorWidth } from './growth';
import { TICK_RATE } from './constants';
import type { GameState, Station, Vec2 } from './types';
import { botSpeed } from './bots/roster';
import { espressoSpeed } from './espresso';

const HALF = ECONOMY.baristaHalfWidth;

/** True when a barista centred at `pos` overlaps a wall or any station's unit square. */
export function blocked(pos: Vec2, stations: Station[], width: number = LAYOUT.width): boolean {
  if (pos.x < HALF || pos.y < HALF || pos.x > width - HALF || pos.y > LAYOUT.height - HALF) return true;
  for (const s of stations) {
    if (Math.abs(pos.x - s.pos.x) < 0.5 + HALF && Math.abs(pos.y - s.pos.y) < 0.5 + HALF) return true;
  }
  return false;
}

/** Advance every connected barista along its moveDir, axis by axis, stopping at walls and stations. Bots walk at their own pace. */
export function applyMovement(state: GameState, moveSpeedMul: number): GameState {
  const speed = (ECONOMY.moveSpeedTilesPerSecond * moveSpeedMul) / TICK_RATE;
  const w = floorWidth(state);
  for (const p of state.players) {
    if (!p.connected) continue;
    const len = Math.hypot(p.moveDir.x, p.moveDir.y);
    if (len === 0) continue;
    const mine = (p.bot ? speed * botSpeed(state, p.bot) : speed) * espressoSpeed(p) * ((p.staggerTicksLeft ?? 0) > 0 ? ECONOMY.bump.staggerSpeed : 1);
    const dx = (p.moveDir.x / len) * mine;
    const dy = (p.moveDir.y / len) * mine;
    const next = { x: p.pos.x + dx, y: p.pos.y };
    if (!blocked(next, state.stations, w)) p.pos.x = next.x;
    next.x = p.pos.x;
    next.y = p.pos.y + dy;
    if (!blocked(next, state.stations, w)) p.pos.y = next.y;
  }
  return state;
}

/** The closest station within interact range of `pos`, or null. Ties go to the lower index. */
export function nearestStation(state: GameState, pos: Vec2): Station | null {
  let best: Station | null = null;
  let bestDist: number = ECONOMY.interactRangeTiles;
  for (const s of state.stations) {
    const d = Math.hypot(pos.x - s.pos.x, pos.y - s.pos.y);
    if (d < bestDist || (best === null && d <= bestDist)) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}
