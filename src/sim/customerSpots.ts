import { LAYOUT, layoutFor } from '../data/layout';
import type { GameState, Vec2 } from './types';

/**
 * Customers have no position of their own: where each one stands is a pure function of the queue. This is the sim's copy
 * of what the renderer draws (src/render/pickupModel.ts `customerSpots`; a test keeps the two in step), so bumps and the
 * picture agree on who is standing where.
 */

/** How far up the floor the pickup crowd stands (the order line's y). */
export const PICKUP_Y = 7.6;
/** Space between people waiting at pickup, in tiles. */
export const PICKUP_GAP = 0.75;
/** The pickup crowd never stands left of this (the box corner and the door are there). */
export const PICKUP_MIN_X = 1.7;

/**
 * Where each customer stands, in the order of `state.customers`. Classic: the layout's queue slots by index (the last
 * slot holds the overflow). Gear: customers still ordering line up from the till to the right; rung-up customers
 * (`stage === 'pickup'`) wait in front of the pickup counter, to the left.
 */
export function customerSpots(state: Pick<GameState, 'customers' | 'tier' | 'gear'>): Vec2[] {
  const lay = layoutFor(state.tier);
  const customers = state.customers;
  const slots = lay.queueSlots;
  if (state.gear !== true) return customers.map((_, i) => ({ ...slots[Math.min(i, slots.length - 1)] }));
  const till = (LAYOUT.stations.find((s) => s.kind === 'counter') ?? LAYOUT.stations[0]).pos;
  const lineY = slots[0]?.y ?? PICKUP_Y;
  const ordering = customers.filter((c) => c.stage !== 'pickup').length;
  const right = lay.width - 0.45;
  const step = ordering > 1 ? Math.max(0.45, Math.min(1, (right - till.x) / (ordering - 1))) : 1;
  let o = 0;
  let p = 0;
  return customers.map((c) => {
    if (c.stage === 'pickup') {
      const x = Math.max(PICKUP_MIN_X, lay.pickup.x - p * PICKUP_GAP);
      p++;
      return { x, y: PICKUP_Y };
    }
    const x = Math.min(right, till.x + o * step);
    o++;
    return { x, y: lineY };
  });
}
