/**
 * Round 3 item 4: pure helpers for the inside waiting-area browsers, the "Line's too long!"
 * bubble spot, and the tumbleweed spawn. No Pixi — unit-tested; actors / chaos draw from these.
 */
import { LAYOUT, layoutFor } from '../data/layout';
import { waitingRoom } from '../sim/line';
import { tierOf } from '../sim/growth';
import type { Customer, GameState, TierId, Vec2 } from '../sim/types';
import { customerSpots, type SpotsLayout } from './pickupModel';

/**
 * Inside waiting-area tiles by shop size (stand 0 / cart 2 / café 4): on the customers' side of the counter row
 * (y 6), between the door and the order line at y ≈ 7.6. Length matches `ECONOMY.line.waiting`.
 * ui-3.8.0: moved down from y 4.6–5.4, which stood the browsers on the baristas' floor behind the counter.
 */
export const WAITING_SPOTS: Record<TierId, readonly Vec2[]> = {
  stand: [],
  cart: [
    { x: 2.0, y: 6.8 },
    { x: 2.9, y: 6.8 },
  ],
  cafe: [
    { x: 2.0, y: 6.8 },
    { x: 2.9, y: 6.8 },
    { x: 2.45, y: 7.35 },
    { x: 3.35, y: 7.35 },
  ],
};

/** Where each browser in `state.waiting` stands (arrival order), capped by the tier's room. */
export function waitingSpots(tier: TierId, n: number): Vec2[] {
  const spots = WAITING_SPOTS[tier];
  const count = Math.max(0, Math.min(n, spots.length));
  return Array.from({ length: count }, (_, i) => ({ ...spots[i]! }));
}

/** Spot count matches the sim's waiting-room capacity for this tier. */
export function waitingSpotCap(tier: TierId): number {
  return WAITING_SPOTS[tier].length;
}

/** Where a complaining customer stands: their place in the order line, else the back of the queue. */
export function complainSpot(state: GameState, customerId: number): Vec2 {
  const lay = layoutFor(state.tier);
  const till = state.stations.find((s) => s.id === 'counter')?.pos ?? LAYOUT.stations.find((s) => s.kind === 'counter')!.pos;
  const spotsLay: SpotsLayout = { width: lay.width, queueSlots: lay.queueSlots, till, pickup: lay.pickup };
  const where = customerSpots(state.customers, state.gear === true, spotsLay);
  const i = state.customers.findIndex((c) => c.id === customerId);
  if (i >= 0) return where[i] ?? lay.queueSlots[Math.min(lay.queueSlots.length - 1, 0)]!;
  const last = lay.queueSlots[Math.min(state.customers.length, lay.queueSlots.length - 1)] ?? lay.queueSlots[0]!;
  return { ...last };
}

/** Tumbleweed rolls out from just inside the door. */
export function tumbleweedSpawn(state: GameState): Vec2 {
  return { x: LAYOUT.door.x + 0.6, y: LAYOUT.door.y + 0.4 };
}

/** Room the art should allow vs what the sim allows (they must agree). */
export function waitingArtRoom(state: GameState): number {
  return Math.min(waitingRoom(state), waitingSpotCap(tierOf(state)));
}

/** Browsers to draw: `state.waiting`, clipped to the art spots. */
export function waitingToDraw(state: GameState): Customer[] {
  const w = state.waiting ?? [];
  const cap = waitingArtRoom(state);
  return w.slice(0, cap);
}
