import { describe, expect, it } from 'vitest';
import { layoutFor } from '../data/layout';
import { createRun, startDay } from './run';
import { ensureCounterSpots, stationsFromSlots } from './slots';
import { blocked, nearestStation } from './movement';
import { cashierHome } from './cashier';
import { tileOf } from './tiles';
import type { GameState, TierId } from './types';

function shop(tier: TierId): GameState {
  const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }], tier, gear: true, settings: { cashier: true } });
  s.slots = tier === 'cart' ? ['grinder', 'espresso', null, 'trash'] : tier === 'stand' ? ['grinder', 'espresso', null, null, 'trash'] : ['grinder', 'espresso', null, null, null, 'trash'];
  s.slotGear = s.slots.map((k) => (k === 'grinder' ? 'g1' : k === 'espresso' ? 'e2' : k === 'trash' ? 'b0' : null));
  s.stations = stationsFromSlots(tier, s.slots, s.slotGear);
  s.fridge = tier === 'cafe' ? 'f3' : tier === 'stand' ? 'f2' : 'f1';
  ensureCounterSpots(s);
  startDay(s);
  return s;
}

describe('pickup stays beside the register', () => {
  for (const tier of ['cart', 'stand', 'cafe'] as const) {
    it(`${tier}: the pickup is the tile left of the till, and the crew can stand behind both`, () => {
      const s = shop(tier);
      const lay = layoutFor(tier);
      expect(lay.pickup).toEqual({ x: 5, y: 6 });
      expect(lay.condiments).toEqual({ x: 4, y: 6 });
      const behindPickup = { x: 5, y: 5 };
      const behindTill = { x: 6, y: 5 };
      expect(blocked(behindPickup, s.stations, lay.width)).toBe(false);
      expect(blocked(behindTill, s.stations, lay.width)).toBe(false);
      expect(tileOf(cashierHome(s)!)).toEqual({ x: 6, y: 5 });
      expect(nearestStation(s, behindTill)?.id).toBe('counter');
      expect(Math.abs(behindPickup.x - behindTill.x)).toBe(1);
    });
  }
});
