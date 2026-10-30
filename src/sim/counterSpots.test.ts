import { describe, it, expect } from 'vitest';
import { createRun } from './run';
import { applyGearInput } from './gear';
import { applyGrowInput } from './growth';
import { ensureCounterSpots, stationsFromSlots } from './slots';
import { returnBox } from './condiments';
import { nearestStation } from './movement';
import { findPath, targetNodes } from './bots/path';
import { CONDIMENTS_ID, LAYOUT, PICKUP_ID, layoutFor } from '../data/layout';
import { GEAR, type GearId } from '../data/gear';
import type { GameState, TierId } from './types';

const gearRun = (tier: TierId): GameState =>
  createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier, gear: true });

/** Every slot of the tier filled with gear (the bin stays in the last slot). */
const FULL: Record<TierId, GearId[]> = {
  stand: ['c1', 'e1', 's1', 'b0'],
  cart: ['g1', 'e1', 's1', 'c1', 'b0'],
  cafe: ['g1', 'e1', 's1', 'd1', 'c1', 'b0'],
};

function fullShop(tier: TierId): GameState {
  const s = gearRun(tier);
  s.slotGear = [...FULL[tier]];
  s.slots = FULL[tier].map((id) => GEAR[id].station);
  s.stations = stationsFromSlots(s.tier, s.slots, s.slotGear);
  return s;
}

const counters = (s: GameState) => s.stations.filter((x) => x.kind === 'counter').map((x) => [x.id, x.pos]);

describe('the pickup counter and condiment bar spots (Task 2)', () => {
  it('a Gear shop has the till, then the pickup counter, then the condiment bar; classic has the till only', () => {
    expect([PICKUP_ID, CONDIMENTS_ID]).toEqual(['pickup', 'condiments']);
    for (const tier of ['stand', 'cart', 'cafe'] as const) {
      const s = gearRun(tier);
      expect(counters(s)).toEqual([
        ['counter', { x: 6, y: 6 }],
        ['pickup', { x: 5, y: 6 }],
        ['condiments', { x: 4, y: 6 }],
        ['sink', layoutFor(tier).sink], // FB2 A3: the back sink is a counter-kind fixed spot too
      ]);
      const spot = s.stations.find((x) => x.id === 'pickup')!;
      expect(spot).toEqual({ id: 'pickup', kind: 'counter', pos: { x: 5, y: 6 }, busyTicksLeft: 0, output: null, occupiedBy: null });
    }
    expect(createRun({ seed: 7, hostId: 'p1', players: [], settings: { bots: 0 } }).stations.filter((x) => x.kind === 'counter')).toHaveLength(1);
    for (const tier of ['stand', 'cart', 'cafe'] as const) {
      expect(createRun({ seed: 7, hostId: 'p1', players: [], settings: { bots: 0 }, tier }).stations.filter((x) => x.kind === 'counter')).toHaveLength(1);
    }
  });

  it('box corners sit two tiles left of the mop', () => {
    expect([layoutFor('stand').boxCorner, layoutFor('cart').boxCorner, layoutFor('cafe').boxCorner]).toEqual([
      { x: 1, y: 7 },
      { x: 7, y: 7 },
      { x: 9, y: 7 },
    ]);
    for (const tier of ['stand', 'cart', 'cafe'] as const) {
      const l = layoutFor(tier);
      expect([l.pickup, l.condiments]).toEqual([{ x: 5, y: 6 }, { x: 4, y: 6 }]);
      expect(l.boxCorner).toEqual({ x: l.mopHome.x - 2, y: l.mopHome.y });
    }
  });

  it('every spot has a barista tile; the door, rogue start and both corners stay clear', () => {
    for (const tier of ['stand', 'cart', 'cafe'] as const) {
      const s = fullShop(tier);
      for (const id of ['counter', 'pickup', 'condiments']) {
        expect(targetNodes(s, s.stations.find((x) => x.id === id)!, LAYOUT.door).length, `${tier} ${id}`).toBeGreaterThan(0);
      }
      expect(findPath(s, LAYOUT.rogueStart, LAYOUT.door)).not.toBeNull();
      expect(nearestStation(s, layoutFor(tier).boxCorner)).toBeNull();
      expect(nearestStation(s, layoutFor(tier).mopHome)).toBeNull();
    }
  });

  it('growing and gear deals keep the spots; ensureCounterSpots adds missing ones once', () => {
    const s = gearRun('stand');
    s.cash = 10_000;
    applyGrowInput(s, { kind: 'grow', playerId: 'p1', tier: 'cart' });
    expect(s.tier).toBe('cart');
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'c1' });
    expect(s.stations.some((x) => x.gear === 'c1')).toBe(true);
    const ids = () => s.stations.filter((x) => x.kind === 'counter').map((x) => x.id);
    expect(ids()).toEqual(['counter', 'pickup', 'condiments', 'sink']);

    s.stations = s.stations.filter((x) => x.id !== 'pickup' && x.id !== 'condiments' && x.id !== 'sink');
    ensureCounterSpots(s);
    ensureCounterSpots(s);
    expect(ids()).toEqual(['counter', 'pickup', 'condiments', 'sink']);
    s.stations = s.stations.filter((x) => x.id !== 'condiments');
    ensureCounterSpots(s);
    expect(ids()).toEqual(['counter', 'pickup', 'sink', 'condiments']);

    const classic = createRun({ seed: 7, hostId: 'p1', players: [], settings: { bots: 0 } });
    ensureCounterSpots(classic);
    expect(classic.stations.filter((x) => x.kind === 'counter')).toHaveLength(1);
  });

  it('a returned box lands in the tier\'s box corner', () => {
    for (const tier of ['stand', 'cart', 'cafe'] as const) {
      const s = gearRun(tier);
      s.players[0]!.tool = 'box';
      returnBox(s, s.players[0]!);
      const e = s.log.filter((x) => x.kind === 'drop').at(-1)!;
      expect({ x: e.data.x, y: e.data.y }).toEqual(layoutFor(tier).boxCorner);
    }
  });

  it('the till is still the first counter-kind station (eggs, idle nodes)', () => {
    for (const tier of ['stand', 'cart', 'cafe'] as const) {
      expect(fullShop(tier).stations.find((x) => x.kind === 'counter')!.id).toBe('counter');
    }
  });
});
