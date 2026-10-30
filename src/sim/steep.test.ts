import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { finishDay } from './closing';
import { step } from './step';
import { stationsFromSlots } from './slots';
import { validateInput } from './validate';
import { steepCap, steepPlan, steepTarget } from './steep';
import { GEAR, type GearId } from '../data/gear';
import { TAP_DRINKS } from '../data/drinks';
import type { GameState, PlayerInput, SupplyId } from './types';

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

const withSupplies = (s: GameState, supplies: Partial<Record<SupplyId, number>>): GameState => {
  Object.assign(s.supplies, supplies);
  return s;
};
const gearDay = (gear: GearId[], supplies: Partial<Record<SupplyId, number>> = {}) => startDay(withSupplies(gearNight(gear), supplies));
const tapsOf = (s: GameState) => s.stations.filter((x) => x.kind === 'coldBrewTap');

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

describe('steeping at night: morning top-up, leftovers, closing (Task 4)', () => {
  it('the morning tops the tap up to the target and charges concentrate for fresh cups only', () => {
    const s = gearDay(['c1'], { concentrate: 10 });
    const tap = tapsOf(s)[0];
    expect([tap.batchLeft, s.supplies.concentrate]).toEqual([8, 2]);
    expect(s.log.find((e) => e.kind === 'steep')?.data).toEqual({ cups: 8, paid: 8 });
  });

  it('a lower target steeps fewer; the number sticks to the next night', () => {
    const n = step(withSupplies(gearNight(['c1']), { concentrate: 10 }), [{ kind: 'steep', playerId: 'p1', cups: 5 }]);
    const s = startDay(n);
    expect([tapsOf(s)[0].batchLeft, s.supplies.concentrate, s.steep]).toEqual([5, 5, 5]);
  });

  it('short on concentrate: steeps what it can and says so', () => {
    const s = gearDay(['c1'], { concentrate: 3 });
    expect([tapsOf(s)[0].batchLeft, s.supplies.concentrate]).toEqual([3, 0]);
    expect(s.morningNotes).toContain('Only 3 of 8 cold brews could steep: not enough concentrate.');
    expect(s.log.find((e) => e.kind === 'steep')?.data).toEqual({ cups: 3, paid: 3 });
  });

  it('leftovers keep one day, then pour out at closing', () => {
    const s = gearDay(['c1'], { concentrate: 10 });
    tapsOf(s)[0].batchLeft = 5;
    finishDay(s);
    expect(s.coldBrewLeft).toBe(5);
    expect(tapsOf(s)[0].batchLeft).toBeUndefined();
    expect(s.days[s.days.length - 1].wasted ?? 0).toBe(0);
    s.supplies.concentrate = 10;
    startDay(s);
    const tap = tapsOf(s)[0];
    expect([tap.batchLeft, tap.batchOld, s.supplies.concentrate, s.coldBrewLeft]).toEqual([8, 5, 7, undefined]);
    tap.batchLeft = 6;
    tap.batchOld = 2;
    finishDay(s);
    expect(s.days[s.days.length - 1].wasted).toBe(2);
    expect(s.coldBrewLeft).toBe(4);
    expect([tapsOf(s)[0].batchLeft, tapsOf(s)[0].batchOld]).toEqual([undefined, undefined]);
  });

  it('a clean sell-through leaves nothing over', () => {
    const s = gearDay(['c1'], { concentrate: 10 });
    tapsOf(s)[0].batchLeft = 0;
    finishDay(s);
    expect(s.coldBrewLeft).toBeUndefined();
  });

  it('two taps pool the target in slot order', () => {
    const n = step(withSupplies(gearNight(['c1', 'c1']), { concentrate: 20 }), [{ kind: 'steep', playerId: 'p1', cups: 12 }]);
    const s = startDay(n);
    expect(tapsOf(s).map((t) => t.batchLeft)).toEqual([8, 4]);
    expect(s.supplies.concentrate).toBe(8);
  });

  it('more leftovers than the tap holds: the rest is poured out with a note (Review Focus 1)', () => {
    const n = withSupplies(gearNight(['c1']), { concentrate: 10 });
    n.coldBrewLeft = 20;
    const s = startDay(n);
    const tap = tapsOf(s)[0];
    expect([tap.batchLeft, tap.batchOld, s.supplies.concentrate, s.coldBrewLeft]).toEqual([8, 8, 10, undefined]);
    expect(s.morningNotes.some((x) => x === "12 cups of yesterday's cold brew had no tap to go in and were poured out.")).toBe(true);
    // the tap sold or downgraded away: no tap at all
    const none = withSupplies(gearNight([]), { concentrate: 10 });
    none.coldBrewLeft = 5;
    const d = startDay(none);
    expect(d.coldBrewLeft).toBeUndefined();
    expect(d.supplies.concentrate).toBe(10);
    expect(d.morningNotes.some((x) => x === "5 cups of yesterday's cold brew had no tap to go in and were poured out.")).toBe(true);
    expect(d.stations.every((x) => (x.batchLeft ?? 0) >= 0)).toBe(true);
    // leftovers that fit go into the cheaper tap without a note
    const fit = withSupplies(gearNight(['c2']), { concentrate: 3 });
    fit.coldBrewLeft = 14;
    const f = startDay(fit);
    expect([tapsOf(f)[0].batchLeft, tapsOf(f)[0].batchOld, f.supplies.concentrate]).toEqual([16, 14, 1]);
    expect(f.morningNotes.some((x) => x.includes('poured out'))).toBe(false);
  });

  it('C4 and C5 steep up to 60', () => {
    expect(steepCap(gearNight(['c4']))).toBe(60);
    expect(steepCap(gearNight(['c5']))).toBe(60);
    expect(GEAR.c4.blurb).toBe('A real tap. Steep up to 60 cups a night.');
  });

  it('the jar crack takes cups after steeping and never leaves more old cups than cups', () => {
    const s = gearNight(['c2']);
    s.supplies.concentrate = 10_000;
    s.coldBrewLeft = 14;
    let seen = false;
    for (let i = 0; i < 400 && !seen; i++) {
      s.coldBrewLeft = 14;
      s.morningNotes = [];
      startDay(s);
      const tap = tapsOf(s)[0];
      if (s.morningNotes.some((n) => n.includes('A jar cracked'))) {
        seen = true;
        expect(tap.batchLeft).toBe(12);
        expect(tap.batchOld).toBe(12);
      }
    }
    expect(seen).toBe(true);
  });
});
