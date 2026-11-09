import { ECONOMY } from '../data/economy';
import { frontCounterForWidth, isFrontSolid, LAYOUT, PICKUP_BODY, PICKUP_ID, PICKUP_REACH } from '../data/layout';
import { floorWidth } from './growth';
import { TICK_RATE } from './constants';
import type { GameState, Station, Vec2 } from './types';
import { botSpeed } from './botBody';
import { espressoSpeed } from './espresso';

const HALF = ECONOMY.baristaHalfWidth;

/** Half-width of a station's blocked body. The pickup counter is wide enough that two people fit along it. */
function bodyHalf(s: Station): number {
  return s.id === PICKUP_ID ? PICKUP_BODY : 0.5;
}

/**
 * True when a barista centred at `pos` overlaps a wall, the solid front counter, or any station's footprint.
 * The counter is layout, not a station: the same line in classic and Gear. The door and the right-hand flap stay open.
 */
export function blocked(pos: Vec2, stations: Station[], width: number = LAYOUT.width): boolean {
  if (pos.x < HALF || pos.y < HALF || pos.x > width - HALF || pos.y > LAYOUT.height - HALF) return true;
  const fc = frontCounterForWidth(width);
  if (Math.abs(pos.y - fc.y) < 0.5 + HALF) {
    for (let x = fc.x0; x <= fc.x1; x++) {
      if (!isFrontSolid(fc, x)) continue;
      if (Math.abs(pos.x - x) < 0.5 + HALF) return true;
    }
  }
  for (const s of stations) {
    if (Math.abs(pos.x - s.pos.x) < bodyHalf(s) + HALF && Math.abs(pos.y - s.pos.y) < 0.5 + HALF) return true;
  }
  return false;
}

/**
 * Staff side of the wide pickup counter: the two tiles in front of it, not the tile beside the till.
 * `at` is the pickup station. Customer-side spots (south of the counter) are not a staff interact.
 */
export function pickupStaffReach(pos: Vec2, at: Vec2): boolean {
  if (pos.y > at.y + 0.2) return false;
  if (pos.x > at.x + 0.45) return false;
  return Math.hypot(pos.x - at.x, pos.y - at.y) <= PICKUP_REACH;
}

/** Advance every connected barista along its moveDir, axis by axis, stopping at walls and stations. Bots walk at their own pace. */
export function applyMovement(state: GameState, moveSpeedMul: number): GameState {
  const speed = (ECONOMY.moveSpeedTilesPerSecond * moveSpeedMul) / TICK_RATE;
  const w = floorWidth(state);
  for (const p of state.players) {
    if (!p.connected) continue;
    const len = Math.hypot(p.moveDir.x, p.moveDir.y);
    if (len === 0) continue;
    const mine = (p.bot ? speed * botSpeed(p.bot) : speed) * espressoSpeed(p) * ((p.staggerTicksLeft ?? 0) > 0 ? ECONOMY.bump.staggerSpeed : 1);
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

/** The closest station within interact range of `pos`, or null. Ties go to the lower index. The pickup counter uses a wider staff-side reach. */
export function nearestStation(state: GameState, pos: Vec2): Station | null {
  let best: Station | null = null;
  let bestDist = Infinity;
  for (const s of state.stations) {
    const d = Math.hypot(pos.x - s.pos.x, pos.y - s.pos.y);
    const limit = s.id === PICKUP_ID ? (pickupStaffReach(pos, s.pos) ? PICKUP_REACH : -1) : ECONOMY.interactRangeTiles;
    if (d > limit) continue;
    if (best === null || d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}
