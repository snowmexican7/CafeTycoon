/**
 * FB2 C10: local-only station carry during the pre-open.
 * Pickup is UI-only (no sim event). Set-down sends `moveStation`. Ghost spots come from
 * `validStationSpots` once on pickup, not every frame.
 */
import { nearestStation } from '../sim/movement';
import { inPreOpen, validStationSpots } from '../sim/rearrange';
import type { GameState, PlayerId, Vec2 } from '../sim/types';

export interface StationCarry {
  stationId: string;
  /** Valid set-down tiles, computed once on pickup. */
  spots: Vec2[];
}

/** Nearest movable station the player can pick up, or null. */
export function carryTarget(state: GameState, me: PlayerId): { stationId: string; spots: Vec2[] } | null {
  if (!inPreOpen(state)) return null;
  const player = state.players.find((p) => p.id === me);
  if (!player || player.bot) return null;
  const near = nearestStation(state, player.pos);
  if (!near) return null;
  const spots = validStationSpots(state, near.id);
  if (spots.length === 0) return null;
  return { stationId: near.id, spots };
}

/** Snap player position to the nearest valid set-down tile. */
export function nearestCarrySpot(spots: readonly Vec2[], pos: Vec2): Vec2 | null {
  if (spots.length === 0) return null;
  let best = spots[0]!;
  let bestD = Infinity;
  for (const s of spots) {
    const d = (s.x + 0.5 - pos.x) ** 2 + (s.y + 0.5 - pos.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** True when the player is close enough to set the machine down on `spot`. */
export function atCarrySpot(pos: Vec2, spot: Vec2, reach = 1.35): boolean {
  const dx = pos.x - (spot.x + 0.5);
  const dy = pos.y - (spot.y + 0.5);
  return dx * dx + dy * dy <= reach * reach;
}
