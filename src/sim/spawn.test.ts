import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { stationsFromSlots } from './slots';
import { drinkEspresso } from './espresso';
import { blocked } from './movement';
import { floorWidth } from './growth';
import { isWalkable } from './bots/path';
import { freeSpot } from './spawn';
import { LAYOUT, layoutFor } from '../data/layout';
import { GEAR, type GearId } from '../data/gear';
import type { GameState, TierId } from './types';

/** FB2 C9: 'steamer' in a test kit is a plain steam station with no gear (a Gear shop only gets one as an espresso machine's wand; the steam station itself works the same). */
type Kit = GearId | 'steamer';

/** Every slot filled, so the fixtures (back bar, counter spots, the sink) are all on the floor. */
const FULL: Record<TierId, Kit[]> = {
  stand: ['d1', 'e3', 'steamer', 'b0'],
  cart: ['g2', 'e3', 'steamer', 'd1', 'b0'],
  cafe: ['g2', 'e3', 'steamer', 'd1', 'c1', 'b0'],
};
function fullShop(tier: TierId, bots: number | 'auto' = 0): GameState {
  const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots, dayLengthSec: 600 }, tier, gear: true });
  s.slotGear = FULL[tier].map((id) => (id === 'steamer' ? null : id));
  s.slots = FULL[tier].map((id) => (id === 'steamer' ? 'steamer' : GEAR[id].station));
  s.stations = stationsFromSlots(s.tier, s.slots, s.slotGear);
  return s;
}
const inside = (s: GameState) => s.players.filter((p) => p.connected && blocked(p.pos, s.stations, floorWidth(s))).map((p) => p.id);

describe('FB2 A3 fix round 2: nobody is placed inside a fixture', () => {
  it('every spawn point (and the door) on every tier lands on a free, walkable tile', () => {
    for (const tier of ['stand', 'cart', 'cafe'] as const) {
      const s = fullShop(tier);
      for (const sp of [...LAYOUT.spawnPoints, LAYOUT.door]) {
        const at = freeSpot(s, sp);
        expect(blocked(at, s.stations, floorWidth(s)), `${tier} ${sp.x},${sp.y}`).toBe(false);
        expect(isWalkable(s, at), `${tier} ${sp.x},${sp.y}`).toBe(true);
        if (!blocked(sp, s.stations, floorWidth(s))) expect(at).toEqual(sp); // a free spawn point is kept as it is
      }
    }
    expect(blocked(LAYOUT.spawnPoints[2]!, fullShop('stand').stations, layoutFor('stand').width)).toBe(true); // spawn index 2 is the stand's sink tile
  });

  it('a Gear stand run with three baristas places none of them inside the sink', () => {
    const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'L' }, { id: 'p3', name: 'M' }], settings: { bots: 0 }, tier: 'stand', gear: true });
    expect(inside(s)).toEqual([]);
  });

  it('the cover bot for an espresso collapse mid-day spawns on a free tile and gets to work', () => {
    let s = fullShop('stand', 'auto');
    s.supplies.beans = 60;
    s.supplies.milk = 60;
    s = startDay(s);
    // A crew of one person and one bot (bot-2 sent home), so the cover bot takes spawn index 2: the sink's tile.
    s.players = s.players.filter((p) => p.id !== 'bot-2');
    expect(s.players.map((p) => p.id)).toEqual(['p1', 'bot-1']);
    s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
    s.eventSchedule = [];
    const p1 = s.players[0]!;
    const esp = s.stations.find((x) => x.kind === 'espresso')!;
    p1.pos = { x: esp.pos.x, y: esp.pos.y + 1 };
    const before = s.players.length;
    for (let i = 0; i < 20 && !p1.espresso?.out; i++) drinkEspresso(s, 'p1');
    expect(p1.espresso?.out).toBe(true);
    expect(s.players.length).toBeGreaterThan(before); // cover bots clocked in
    expect(inside(s)).toEqual([]);
    const cover = s.players[before]!; // placed at spawn index 2
    expect(cover.bot).toBeDefined();
    const start = { ...cover.pos };
    s.unlocked = [...(s.unlocked ?? []), 'drip'];
    s.menu.drip = true;
    s.customers = [{ id: 1, drink: 'drip', patienceLeft: 1e5, patienceMax: 1e5, stage: 'pickup', rungAt: 0 }];
    for (let i = 0; i < 60 * 60 && s.today.served < 1; i++) s = step(s, []);
    expect(s.today.served).toBe(1);
    const moved = s.players.find((p) => p.id === cover.id)!;
    expect(moved.pos).not.toEqual(start);
  });
});
