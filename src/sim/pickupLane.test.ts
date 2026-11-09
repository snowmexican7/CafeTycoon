import { describe, expect, it } from 'vitest';
import { layoutFor } from '../data/layout';
import { ECONOMY } from '../data/economy';
import { createRun, startDay } from './run';
import { ensureCounterSpots, stationsFromSlots } from './slots';
import { blocked, nearestStation } from './movement';
import { cashierHome } from './cashier';
import { tileOf } from './tiles';
import type { GameState, TierId } from './types';

function shop(tier: TierId): GameState {
  const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }], tier, gear: true, settings: { cashier: true } });
  s.slots = tier === 'stand' ? ['grinder', 'espresso', null, 'trash'] : tier === 'cart' ? ['grinder', 'espresso', null, null, 'trash'] : ['grinder', 'espresso', null, null, null, 'trash'];
  s.slotGear = s.slots.map((k) => (k === 'grinder' ? 'g1' : k === 'espresso' ? 'e2' : k === 'trash' ? 'b0' : null));
  s.stations = stationsFromSlots(tier, s.slots, s.slotGear);
  s.fridge = tier === 'cafe' ? 'f3' : tier === 'cart' ? 'f2' : 'f1';
  ensureCounterSpots(s);
  startDay(s);
  return s;
}

describe('pickup counter is wide and off the cashier lane', () => {
  for (const tier of ['stand', 'cart', 'cafe'] as const) {
    it(`${tier}: two staff tiles reach pickup, and neither is beside the till`, () => {
      const s = shop(tier);
      const lay = layoutFor(tier);
      expect(lay.pickup).toEqual({ x: 4, y: 6 });
      expect(lay.condiments).toEqual({ x: 5, y: 6 });
      const left = { x: 3, y: 5 };
      const right = { x: 4, y: 5 };
      expect(nearestStation(s, left)?.id).toBe('pickup');
      expect(nearestStation(s, right)?.id).toBe('pickup');
      expect(blocked(left, s.stations, lay.width)).toBe(false);
      expect(blocked(right, s.stations, lay.width)).toBe(false);
      const home = cashierHome(s)!;
      expect(tileOf(home)).toEqual({ x: 6, y: 5 });
      for (const spot of [left, right]) {
        const t = tileOf(spot);
        const beside = Math.abs(t.x - home.x) + Math.abs(t.y - home.y);
        expect(beside).toBeGreaterThan(ECONOMY.cashier.deferTiles);
      }
      // The tile beside the cashier is not the pickup.
      expect(nearestStation(s, { x: 5, y: 5 })?.id).not.toBe('pickup');
    });
  }
});
