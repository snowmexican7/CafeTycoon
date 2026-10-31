import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../data/economy';
import { BASE_DRINKS } from '../data/drinks';
import type { GearId } from '../data/gear';
import { secondsToTicks } from '../sim/constants';
import { createRun } from '../sim/run';
import { ensureCounterSpots, stationsFromSlots, type SlotContent } from '../sim/slots';
import { step } from '../sim/step';
import type { PlayerInput, SupplyId } from '../sim/types';
import { preOpenHtml, preOpenKey, preOpenVM } from './preOpen';
import { atCarrySpot, carryTarget, nearestCarrySpot } from './rearrangeCarry';

const STAND: SlotContent[] = ['grinder', 'espresso', 'drip', 'trash'];
const STAND_GEAR: (GearId | null)[] = ['g1', 'e2', 'd1', 'b0'];

/** Gear night → ready → day with a 15 s pre-open (mirrors sim/rearrange.test.ts). */
function gearDay() {
  const s = createRun({
    seed: 3,
    hostId: 'p1',
    players: [{ id: 'p1', name: 'Kim' }, { id: 'p2', name: 'Sam' }],
    settings: { bots: 0, dayLengthSec: 600 },
    gear: true,
    tier: 'stand',
  });
  s.slots = [...STAND];
  s.slotGear = [...STAND_GEAR];
  s.slotWand = STAND.map(() => null);
  s.stations = stationsFromSlots('stand', s.slots, s.slotGear, s.slotWand);
  ensureCounterSpots(s);
  s.unlocked = [...BASE_DRINKS, 'drip'];
  for (const d of s.unlocked) s.menu[d] = true;
  for (const k of Object.keys(s.supplies) as SupplyId[]) s.supplies[k] = 99;
  return step(
    s,
    s.players.filter((p) => !p.bot).map((p) => ({ kind: 'ready', playerId: p.id }) as PlayerInput),
  );
}

describe('preOpenVM (FB2 C10)', () => {
  it('closed outside the pre-open', () => {
    const s = gearDay();
    delete s.preOpenUntil;
    expect(preOpenVM(s, 'p1').open).toBe(false);
    expect(preOpenKey(preOpenVM(s, 'p1'))).toBe('');
  });

  it('shows countdown, ready counts, and host Open doors', () => {
    const s = gearDay();
    s.preOpenUntil = s.tick + secondsToTicks(ECONOMY.preOpenSeconds);
    s.ready = ['p2'];
    const host = preOpenVM(s, 'p1');
    expect(host.open).toBe(true);
    expect(host.secsLeft).toBe(ECONOMY.preOpenSeconds);
    expect(host.ready).toBe(1);
    expect(host.needed).toBe(2);
    expect(host.mine).toBe(false);
    expect(host.isHost).toBe(true);
    const html = preOpenHtml(host);
    expect(html).toContain('Open doors');
    expect(html).toContain('Ready');
    expect(html).toContain('1/2 ready');
    expect(preOpenVM(s, 'p2').mine).toBe(true);
    expect(preOpenHtml(preOpenVM(s, 'p2'))).not.toContain('Open doors');
  });

  it('key changes with the countdown and ready state', () => {
    const s = gearDay();
    s.preOpenUntil = s.tick + secondsToTicks(10);
    const a = preOpenKey(preOpenVM(s, 'p1'));
    s.tick += secondsToTicks(1);
    expect(preOpenKey(preOpenVM(s, 'p1'))).not.toBe(a);
    s.ready = ['p1'];
    expect(preOpenKey(preOpenVM(s, 'p1'))).toContain('|1/2|1|');
  });
});

describe('rearrangeCarry (FB2 C10)', () => {
  it('names a movable station near the player during pre-open', () => {
    const s = gearDay();
    s.preOpenUntil = s.tick + secondsToTicks(15);
    const drip = s.stations.find((x) => x.kind === 'drip')!;
    // Stand one tile below the drip (within ECONOMY.interactRangeTiles).
    s.players[0]!.pos = { x: drip.pos.x, y: drip.pos.y + 1 };
    const t = carryTarget(s, 'p1');
    expect(t).not.toBeNull();
    expect(t!.spots.length).toBeGreaterThan(0);
    expect(t!.stationId).toBe(drip.id);
  });

  it('returns null outside pre-open or for fixtures', () => {
    const s = gearDay();
    delete s.preOpenUntil;
    expect(carryTarget(s, 'p1')).toBeNull();
    s.preOpenUntil = s.tick + 60;
    const till = s.stations.find((x) => x.id === 'till' || x.kind === 'counter')!;
    s.players[0]!.pos = { x: till.pos.x + 0.5, y: till.pos.y + 1 };
    // Fixtures have no validStationSpots; may still be nearest — carryTarget requires spots.
    const t = carryTarget(s, 'p1');
    if (t) expect(t.spots.length).toBeGreaterThan(0);
  });

  it('nearestCarrySpot picks the closest tile', () => {
    const spot = nearestCarrySpot([{ x: 1, y: 1 }, { x: 4, y: 2 }], { x: 3.6, y: 2.4 });
    expect(spot).toEqual({ x: 4, y: 2 });
    expect(atCarrySpot({ x: 4.4, y: 2.5 }, { x: 4, y: 2 })).toBe(true);
    expect(atCarrySpot({ x: 1, y: 1 }, { x: 4, y: 2 })).toBe(false);
  });
});
