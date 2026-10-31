import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../data/economy';
import { createRun, startDay } from '../sim/run';
import { gearStart } from '../sim/gear';
import { waitingRoom } from '../sim/line';
import type { GameState, TierId } from '../sim/types';
import { complainSpot, tumbleweedSpawn, WAITING_SPOTS, waitingArtRoom, waitingSpotCap, waitingSpots, waitingToDraw } from './waitingModel';
import { LAYOUT, layoutFor } from '../data/layout';

function shop(tier: TierId): GameState {
  let s = createRun({ seed: 4, hostId: 'p1', players: [{ id: 'p1', name: 'Ana' }], settings: { bots: 0 } });
  s = startDay(s);
  s.phase = 'day';
  s.gear = true;
  gearStart(s);
  s.tier = tier;
  return s;
}

describe('waitingModel', () => {
  it('matches the sim waiting-room size per tier', () => {
    for (const tier of ['stand', 'cart', 'cafe'] as const) {
      expect(waitingSpotCap(tier)).toBe(ECONOMY.line.waiting[tier]);
      expect(WAITING_SPOTS[tier]).toHaveLength(ECONOMY.line.waiting[tier]);
      expect(waitingRoom(shop(tier))).toBe(waitingSpotCap(tier));
    }
  });

  it('places browsers in arrival order and clips to the room', () => {
    expect(waitingSpots('stand', 3)).toEqual([]);
    expect(waitingSpots('cart', 2)).toEqual([
      { x: 2.0, y: 6.8 },
      { x: 2.9, y: 6.8 },
    ]);
    expect(waitingSpots('cafe', 99)).toHaveLength(4);
  });

  it('keeps browsers on the customers\' side of the counter, off the order line (ui-3.8.0)', () => {
    for (const tier of ['cart', 'cafe'] as const) {
      for (const p of waitingSpots(tier, 99)) {
        expect(p.y).toBeGreaterThan(6.5); // the counter row is y 6; the bar is above it
        for (const q of layoutFor(tier).queueSlots) expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(0.6);
      }
    }
  });

  it('draws only as many browsers as the art room allows', () => {
    const s = shop('cart');
    s.waiting = [
      { id: 1, drink: 'latte', patienceLeft: 800, patienceMax: 1000 },
      { id: 2, drink: 'espresso', patienceLeft: 700, patienceMax: 1000 },
      { id: 3, drink: 'mocha', patienceLeft: 600, patienceMax: 1000 },
    ];
    expect(waitingArtRoom(s)).toBe(2);
    expect(waitingToDraw(s).map((c) => c.id)).toEqual([1, 2]);
  });

  it('puts the complain bubble on the named customer in line', () => {
    const s = shop('cafe');
    s.customers = [
      { id: 10, drink: 'latte', patienceLeft: 800, patienceMax: 1000 },
      { id: 11, drink: 'espresso', patienceLeft: 700, patienceMax: 1000 },
      { id: 12, drink: 'mocha', patienceLeft: 600, patienceMax: 1000 },
    ];
    const at = complainSpot(s, 12);
    expect(at.y).toBeCloseTo(7.6, 5);
    expect(at.x).toBeGreaterThan(complainSpot(s, 10).x - 0.01);
  });

  it('rolls the tumbleweed from just inside the door', () => {
    const s = shop('cafe');
    const at = tumbleweedSpawn(s);
    expect(at.x).toBeCloseTo(LAYOUT.door.x + 0.6);
    expect(at.y).toBeCloseTo(LAYOUT.door.y + 0.4);
  });
});
