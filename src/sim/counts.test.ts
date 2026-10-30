import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { stationsFromSlots } from './slots';
import { stationCountsLeft, stationLeft } from './counts';
import { GEAR, type GearId } from '../data/gear';
import type { GameState, PassItem, Station } from './types';

function gearDay(gear: GearId[] = ['c1', 'e1', 'd1', 'g2']): GameState {
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
  return startDay(s);
}

const st = (s: GameState, id: string): Station => s.stations.find((x) => x.id === id)!;
const cup = (): PassItem => ({ item: 'espresso', ticksLeft: 900 } as PassItem);

describe('stationLeft (FB2 A5)', () => {
  it('cold brew tap: cups left today, null at 0 or without a cap', () => {
    const s = gearDay(['c1', 'e1', 'd1', 'g2']);
    const tap = s.stations.find((x) => x.kind === 'coldBrewTap')!;
    tap.batchLeft = 7;
    expect(stationLeft(s, tap.id)).toBe(7);
    tap.batchLeft = 0;
    expect(stationLeft(s, tap.id)).toBeNull();
    delete tap.batchLeft;
    expect(stationLeft(s, tap.id)).toBeNull();
  });

  it('drip: cups in a brewed pot; null empty, brewing, or off the machine; a stale pot shows its cups', () => {
    const s = gearDay(['c1', 'e1', 'd1', 'g2']);
    const d = s.stations.find((x) => x.kind === 'drip');
    expect(d, 'a drip station in this loadout').toBeDefined();
    expect(stationLeft(s, d!.id)).toBeNull(); // empty
    d!.potLeft = 5;
    d!.busyTicksLeft = 0;
    expect(stationLeft(s, d!.id)).toBe(5);
    d!.busyTicksLeft = 40; // brewing
    expect(stationLeft(s, d!.id)).toBeNull();
    d!.busyTicksLeft = 0;
    d!.potOut = 'p1'; // carried to the sink
    expect(stationLeft(s, d!.id)).toBeNull();
    delete d!.potOut;
    d!.stale = true; // overnight pot, cups still in it
    expect(stationLeft(s, d!.id)).toBe(5);
    d!.potLeft = 0;
    expect(stationLeft(s, d!.id)).toBeNull();
  });

  it('a machine holding a pulled shot or a steamed drink reads 1; an empty one null', () => {
    const s = gearDay(['c1', 'e1', 'd1', 'g2']);
    const e = s.stations.find((x) => x.kind === 'espresso')!;
    expect(stationLeft(s, e.id)).toBeNull();
    e.output = 'espresso';
    expect(stationLeft(s, e.id)).toBe(1);
    const g = s.stations.find((x) => x.kind === 'grinder')!;
    expect(stationLeft(s, g.id)).toBeNull();
    g.output = 'grounds';
    expect(stationLeft(s, g.id)).toBe(1);
  });

  it('condiment bar: servings left, null at 0', () => {
    const s = gearDay();
    s.condiments = { servings: 12 };
    expect(stationLeft(s, 'condiments')).toBe(12);
    s.condiments.servings = 0;
    expect(stationLeft(s, 'condiments')).toBeNull();
  });

  it('pickup counter: cups on it, null when bare', () => {
    const s = gearDay();
    s.pass = [];
    expect(stationLeft(s, 'pickup')).toBeNull();
    s.pass = [cup(), cup(), cup()];
    expect(stationLeft(s, 'pickup')).toBe(3);
  });

  it('till, sink, trash and unknown ids read null', () => {
    const s = gearDay();
    s.pass = [cup()];
    s.condiments = { servings: 9 };
    for (const id of ['counter', 'sink', 'nope']) expect(stationLeft(s, id)).toBeNull();
    for (const t of s.stations.filter((x) => x.kind === 'trash')) expect(stationLeft(s, t.id)).toBeNull();
  });

  it('is pure: no state change', () => {
    const s = gearDay();
    s.condiments = { servings: 9 };
    const before = JSON.stringify(s);
    stationCountsLeft(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('stationCountsLeft', () => {
  it('lists every station with a count, in station order', () => {
    const s = gearDay(['c1', 'e1', 'd1', 'g2']);
    s.pass = [cup(), cup()];
    s.condiments = { servings: 4 };
    const tap = s.stations.find((x) => x.kind === 'coldBrewTap')!;
    tap.batchLeft = 3;
    const e = s.stations.find((x) => x.kind === 'espresso')!;
    e.output = 'espresso';
    const list = stationCountsLeft(s);
    const want = s.stations.map((x) => x.id).filter((id) => ['pickup', 'condiments', tap.id, e.id].includes(id));
    expect(list.map((x) => x.id)).toEqual(want);
    expect(Object.fromEntries(list.map((x) => [x.id, x.n]))).toEqual({ pickup: 2, condiments: 4, [tap.id]: 3, [e.id]: 1 });
    expect(list.every((x) => x.n >= 1)).toBe(true);
  });

  it('is empty when nothing is waiting', () => {
    const s = gearDay();
    s.pass = [];
    s.condiments = { servings: 0 };
    for (const x of s.stations) if (x.kind === 'coldBrewTap') x.batchLeft = 0;
    expect(stationCountsLeft(s)).toEqual([]);
  });
});
