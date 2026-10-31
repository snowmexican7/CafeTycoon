import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { stationsFromSlots } from './slots';
import { applyGearPrices, gearAfterUse, gearArea, gearMorning, gearPolish, gearPullMul, gearSpeed } from './gear';
import { computeModifiers } from './effects';
import { addStandIns } from './bots/roster';
import { type GearId } from '../data/gear';
import { gearStats } from '../ui/gearVM';
import type { AreaId } from '../data/areas';
import type { GameState, StationKind } from './types';

const run = (gear: boolean, seed = 5): GameState =>
  createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', ...(gear ? { gear: true } : {}) });
const kit = (s: GameState, slots: (StationKind | null)[], gear: (GearId | null)[]) => {
  s.slotGear = gear;
  s.stations = stationsFromSlots('stand', slots as never, gear);
};
const inArea = (area: AreaId): GameState => {
  for (let seed = 1; seed < 100; seed++) {
    const s = run(true, seed);
    if (gearArea(s) === area) return s;
  }
  throw new Error(`no seed for ${area}`);
};

describe('G10: top-tier perks', () => {
  it('flow state doubles the pour-over speed until it runs out, and clears in the morning', () => {
    const s = run(true);
    kit(s, ['drip', null, null, 'trash'], ['d4b', null, null, 'b0']);
    const st = s.stations.find((x) => x.gear === 'd4b')!;
    const base = gearSpeed(st, s.tick);
    let tries = 0;
    while (st.flowUntil === undefined && tries++ < 5000) gearAfterUse(s, st, s.players[0]!);
    expect(st.flowUntil).toBeGreaterThan(s.tick);
    expect(gearSpeed(st, s.tick)).toBeCloseTo(base * 2);
    expect(gearSpeed(st, st.flowUntil!)).toBeCloseTo(base);
    gearMorning(s);
    expect(st.flowUntil).toBeUndefined();
  });

  it('only the flow gear rolls flow', () => {
    const s = run(true);
    kit(s, ['drip', null, null, 'trash'], ['d4', null, null, 'b0']);
    const st = s.stations.find((x) => x.gear === 'd4')!;
    for (let i = 0; i < 2000; i++) gearAfterUse(s, st, s.players[0]!);
    expect(st.flowUntil).toBeUndefined();
  });

  it('polish forgives one slip on the top cold brew and espresso machines only', () => {
    const s = run(true);
    kit(s, ['coldBrewTap', 'espresso', 'grinder', 'trash'], ['c5', 'e6', 'g3', 'b0']);
    for (const id of ['c5', 'e6'] as GearId[]) {
      const st = s.stations.find((x) => x.gear === id)!;
      st.cupSlips = 2;
      gearPolish(st);
      expect(st.cupSlips).toBe(1);
      st.cupSlips = 0;
      gearPolish(st);
      expect(st.cupSlips).toBe(0);
    }
    const g = s.stations.find((x) => x.gear === 'g3')!;
    g.cupSlips = 2;
    gearPolish(g);
    expect(g.cupSlips).toBe(2);
  });

  it('the nitro tap draws a few more iced orders', () => {
    const s = inArea('arts');
    kit(s, ['coldBrewTap', null, null, 'trash'], ['c4', null, null, 'b0']);
    const before = gearPullMul(s, 'coldBrew');
    kit(s, ['coldBrewTap', null, null, 'trash'], ['c5', null, null, 'b0']);
    const after = gearPullMul(s, 'coldBrew');
    expect(after / before).toBeGreaterThan(1.1);
    expect(gearPullMul(s, 'latte')).toBe(1);
  });

  it('areas tilt what walk-ins order', () => {
    const office = inArea('office');
    kit(office, [null, null, null, 'trash'], [null, null, null, 'b0']);
    expect(gearPullMul(office, 'drip')).toBeCloseTo(1.5);
    expect(gearPullMul(office, 'pourOver')).toBeCloseTo(1);
    const arts = inArea('arts');
    kit(arts, [null, null, null, 'trash'], [null, null, null, 'b0']);
    expect(gearPullMul(arts, 'espresso')).toBeCloseTo(1.4);
    const gym = inArea('gym');
    kit(gym, [null, null, null, 'trash'], [null, null, null, 'b0']);
    expect(gearPullMul(gym, 'coldBrew')).toBeCloseTo(1.3);
    expect(gearPullMul(gym, 'latte')).toBeCloseTo(1);
  });

  it('The Annihilator (E5 since FB2 C9) draws influencers; classic runs are untouched', () => {
    const s = run(true);
    kit(s, ['espresso', 'grinder', null, 'trash'], ['e4', 'g3', null, 'b0']);
    const without = computeModifiers(s).eventOdds.influencerVisit;
    kit(s, ['espresso', 'grinder', null, 'trash'], ['e5', 'g3', null, 'b0']);
    expect(computeModifiers(s).eventOdds.influencerVisit / without).toBeCloseTo(1.5);
    const c = run(false);
    const m = computeModifiers(c);
    const odds = m.eventOdds.influencerVisit;
    applyGearPrices(c, m);
    expect(m.eventOdds.influencerVisit).toBe(odds);
    expect(gearPullMul(c, 'drip')).toBe(1);
  });

  it('the cards say so', () => {
    expect(gearStats('c5')).toMatch(/slip/);
    expect(gearStats('e5')).toMatch(/Influencers/);
    expect(gearStats('d4b')).toMatch(/flow/i);
  });
});

describe('G10: bots and the pod machine', () => {
  it('a stand-in pulls pod shots with no grinder in the shop', () => {
    let s = createRun({ seed: 101, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 150 }, tier: 'stand', gear: true });
    addStandIns(s, 1);
    for (const g of ['c1', 'e1'] as GearId[]) s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: g }]);
    expect(s.stations.some((x) => x.kind === 'grinder')).toBe(false);
    s.supplies.beans = 40;
    s.supplies.milk = 40;
    s.supplies.concentrate = 20;
    startDay(s);
    while (s.phase === 'day') s = step(s, []);
    const day = s.days[s.days.length - 1] ?? s.today;
    expect((day.drinks?.espresso ?? 0) + (day.drinks?.latte ?? 0)).toBeGreaterThan(0);
  });
});
