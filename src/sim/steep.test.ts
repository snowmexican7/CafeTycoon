import { describe, it, expect } from 'vitest';
import { createRun } from './run';
import { step } from './step';
import { stationsFromSlots } from './slots';
import { validateInput } from './validate';
import { steepCap, steepPlan, steepTarget } from './steep';
import { GEAR, type GearId } from '../data/gear';
import { TAP_DRINKS } from '../data/drinks';
import type { GameState, PlayerInput } from './types';

/** A Gear stand at night with `gear` in the first slots (the free bin stays in the last). */
function gearNight(gear: GearId[]): GameState {
  const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear: true });
  const slots = [...s.slots!];
  const slotGear = [...s.slotGear!];
  gear.forEach((id, i) => {
    slots[i] = GEAR[id].station;
    slotGear[i] = id;
  });
  s.slots = slots;
  s.slotGear = slotGear;
  s.stations = stationsFromSlots(s.tier, slots, slotGear);
  return s;
}

describe('steeping cold brew at night (Task 1 shapes)', () => {
  it('validates the steep input', () => {
    expect(validateInput({ kind: 'steep', playerId: 'p1', cups: 12 })).toEqual({ kind: 'steep', playerId: 'p1', cups: 12 });
    expect(validateInput({ kind: 'steep', playerId: 'p1', cups: 0 })).toEqual({ kind: 'steep', playerId: 'p1', cups: 0 });
    for (const cups of [2.5, -1, 201, NaN]) expect(validateInput({ kind: 'steep', playerId: 'p1', cups } as PlayerInput)).toBeNull();
  });

  it('steep sets the sticky target, clamped to the taps; night, Gear and people only', () => {
    const s = gearNight(['c1']);
    expect(steepTarget(s)).toBe(8); // absent = full cap
    expect(step(s, [{ kind: 'steep', playerId: 'p1', cups: 20 }]).steep).toBe(8);
    expect(step(s, [{ kind: 'steep', playerId: 'p1', cups: 5 }]).steep).toBe(5);
    const none = gearNight([]); // no tap: cap 0, input ignored
    expect(step(none, [{ kind: 'steep', playerId: 'p1', cups: 5 }]).steep).toBeUndefined();
    const classic = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
    expect(step(classic, [{ kind: 'steep', playerId: 'p1', cups: 5 }]).steep).toBeUndefined();
    const stranger = step(s, [{ kind: 'steep', playerId: 'nobody', cups: 5 }]);
    expect(stranger.steep).toBeUndefined();
  });

  it('caps add up over taps', () => {
    expect(steepCap(gearNight(['c1', 'c1']))).toBe(16);
    expect(steepCap(gearNight(['c2']))).toBe(16);
    expect(steepCap(gearNight(['c4']))).toBe(60);
  });

  it('steepPlan: leftovers first, concentrate for the top-up only', () => {
    const s = gearNight(['c1']);
    s.supplies.concentrate = 5;
    s.coldBrewLeft = 2;
    expect(steepPlan(s)).toEqual({ cap: 8, target: 8, leftover: 2, topUp: 6, paid: 5, short: 1 });
  });

  it('TAP_DRINKS: every drink drawn from the cold brew tap', () => {
    expect(TAP_DRINKS).toEqual(['coldBrew', 'icedLatte', 'special', 'sweetCream']);
  });
});
