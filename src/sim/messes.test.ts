import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { stationsFromSlots } from './slots';
import { interact } from './stations';
import { floorPatience, stepCleanliness, placeMess } from './floor';
import { computeModifiers } from './effects';
import { nodeOf } from './bots/path';
import { rngNext } from './rng';
import { GEAR_FLOOR, MESSES } from './messes';
import { ECONOMY } from '../data/economy';
import { GEAR, type GearId } from '../data/gear';
import type { GameState, Station } from './types';

/** A Gear stand open for the day: grinder, steamer, espresso and the bin. */
function gearStand(gear: GearId[] = ['g2', 's3', 'e3', 'b0']): GameState {
  const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear: true });
  s.slotGear = [...gear];
  s.slots = gear.map((id) => GEAR[id].station);
  s.stations = stationsFromSlots(s.tier, s.slots, s.slotGear);
  s.supplies.beans = 10;
  s.supplies.milk = 10;
  return startDay(s);
}

const classicDay = (): GameState => startDay(createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand' }));

/** An rng state whose next draw passes `ok`. */
function rngWhere(ok: (r: number) => boolean): number {
  for (let k = 1; ; k++) if (ok(rngNext({ rng: k }))) return k;
}
const st = (s: GameState, kind: string): Station => s.stations.find((x) => x.kind === kind && !x.twin)!;
const below = (s: GameState, kind: string) => {
  const at = st(s, kind).pos;
  s.players[0].pos = { x: at.x, y: at.y + 1 };
};
const events = (s: GameState, kind: string) => s.log.filter((e) => e.kind === kind).map((e) => e.data);

describe('FB2 A3: the bin leaks now and then', () => {
  it('a forced draw under 1%: a spill in front of the bin, bin.leak and mess.spawn logged', () => {
    expect(MESSES.binLeak).toBe(0.01);
    const s = gearStand();
    below(s, 'trash');
    s.players[0].holding = 'latte';
    s.rng = rngWhere((r) => r < MESSES.binLeak);
    interact(s, 'p1');
    const tile = nodeOf(s, st(s, 'trash').pos);
    expect(s.messes.map((m) => [m.kind, m.x, m.y])).toEqual([['spill', tile.x, tile.y]]);
    expect(events(s, 'bin.leak')).toEqual([{ by: 'p1', at: 'trash', x: tile.x, y: tile.y }]);
    expect(events(s, 'mess.spawn')).toEqual([{ kind: 'leak', at: 'trash', x: tile.x, y: tile.y }]);
  });

  it('the common draw leaks nothing; R into the bin rolls too; grounds never leak', () => {
    const s = gearStand();
    below(s, 'trash');
    s.players[0].holding = 'latte';
    s.rng = rngWhere((r) => r >= MESSES.binLeak);
    interact(s, 'p1');
    expect([s.messes, events(s, 'bin.leak')]).toEqual([[], []]);

    let t = gearStand();
    below(t, 'trash');
    t.players[0].holding = 'espresso';
    t.rng = rngWhere((r) => r < MESSES.binLeak);
    t = step(t, [{ kind: 'drop', playerId: 'p1' }]);
    expect(events(t, 'bin.leak')).toHaveLength(1);

    const g = gearStand();
    below(g, 'trash');
    g.players[0].holding = 'grounds';
    const rng = (g.rng = rngWhere((r) => r < MESSES.binLeak));
    interact(g, 'p1');
    expect([g.rng, g.messes]).toEqual([rng, []]);
  });
});

describe('FB2 A3: milk drips and spilled grounds', () => {
  it('a forced draw at the steamer: a milk spill on the barista\'s tile', () => {
    expect(MESSES.milkDrip).toBe(0.03);
    const s = gearStand();
    below(s, 'steamer');
    s.players[0].holding = 'espresso';
    s.rng = rngWhere((r) => r < MESSES.milkDrip);
    interact(s, 'p1');
    expect(st(s, 'steamer').making).toBe('latte');
    const at = st(s, 'steamer').pos;
    expect(s.messes.map((m) => [m.kind, m.x, m.y])).toEqual([['spill', at.x, at.y + 1]]);
    expect(events(s, 'mess.spawn')).toEqual([{ kind: 'milk', at: 'steamer', x: at.x, y: at.y + 1 }]);
  });

  it('the dual boiler\'s steam wand drips too', () => {
    const s = gearStand(['g2', 'e4', 'c1', 'b0']);
    const wand = s.stations.find((x) => x.kind === 'steamer')!;
    expect(wand.twin).toBe(true);
    s.players[0].pos = { x: Math.round(wand.pos.x + 0.45), y: wand.pos.y + 1 };
    s.players[0].holding = 'espresso';
    s.rng = rngWhere((r) => r < MESSES.milkDrip);
    interact(s, 'p1');
    expect(wand.making).toBe('latte');
    expect(events(s, 'mess.spawn').map((d) => d.kind)).toEqual(['milk']);
  });

  it('a forced draw at the grinder: grounds on the floor; the common draw: nothing', () => {
    expect(MESSES.groundsSpill).toBe(0.03);
    const s = gearStand();
    below(s, 'grinder');
    s.rng = rngWhere((r) => r < MESSES.groundsSpill);
    interact(s, 'p1');
    expect(st(s, 'grinder').making).toBe('grounds');
    expect(s.messes.map((m) => m.kind)).toEqual(['grounds']);
    expect(events(s, 'mess.spawn')).toEqual([{ kind: 'grounds', at: 'grinder', x: 1, y: 2 }]);

    const t = gearStand();
    below(t, 'grinder');
    t.rng = rngWhere((r) => r >= MESSES.groundsSpill);
    interact(t, 'p1');
    expect([t.messes, events(t, 'mess.spawn')]).toEqual([[], []]);
  });

  it('other messes in a Gear run log mess.spawn with their own kind', () => {
    const s = gearStand();
    placeMess(s, 'spill', { x: 3, y: 4 });
    expect(events(s, 'mess.spawn')).toEqual([{ kind: 'spill', x: 3, y: 4 }]);
  });
});

describe('FB2 A3: the floor meter in Gear runs', () => {
  it('every new mess knocks GEAR_FLOOR.hit off the meter at once (merges too); classic has no hit', () => {
    const s = gearStand();
    placeMess(s, 'spill', { x: 3, y: 4 });
    expect(s.cleanliness).toBe(100 - GEAR_FLOOR.hit);
    placeMess(s, 'spill', { x: 3, y: 4 });
    expect(s.cleanliness).toBe(100 - 2 * GEAR_FLOOR.hit);
    s.cleanliness = 2;
    placeMess(s, 'grounds', { x: 2, y: 4 });
    expect(s.cleanliness).toBe(0);
    const c = classicDay();
    placeMess(c, 'spill', { x: 3, y: 4 });
    expect(c.cleanliness).toBe(100);
  });

  it('drifts down slower per mess than classic, and recovers slower too (the hit is what shows)', () => {
    const s = gearStand();
    s.messes = [{ id: 1, kind: 'spill', x: 3, y: 4, amount: 1 }];
    for (let i = 0; i < 60; i++) stepCleanliness(s);
    expect(s.cleanliness).toBeCloseTo(100 - 60 * GEAR_FLOOR.dirtPerMessPerTick, 6);
    s.messes = [];
    const low = s.cleanliness;
    stepCleanliness(s);
    expect(s.cleanliness).toBeCloseTo(low + GEAR_FLOOR.recoverPerTick, 6);
    expect(GEAR_FLOOR.dirtPerMessPerTick).toBeLessThan(ECONOMY.mess.dirtPerMessPerTick);
    expect(GEAR_FLOOR.recoverPerTick).toBeLessThan(ECONOMY.mess.recoverPerTick);
  });
});

describe('FB2 A3: the floor and patience in Gear runs', () => {
  it('patience is untouched down to GEAR_FLOOR.patienceFrom, then falls to the classic floor at 0', () => {
    const s = gearStand();
    expect(floorPatience(s)).toBe(1);
    s.cleanliness = GEAR_FLOOR.patienceFrom;
    expect(floorPatience(s)).toBe(1);
    s.cleanliness = GEAR_FLOOR.patienceFrom / 2;
    expect(floorPatience(s)).toBeCloseTo(ECONOMY.mess.patienceFloor + (1 - ECONOMY.mess.patienceFloor) / 2, 6);
    s.cleanliness = 0;
    expect(floorPatience(s)).toBeCloseTo(ECONOMY.mess.patienceFloor, 6);
    const at = (c: number) => { s.cleanliness = c; return computeModifiers(s).patience; };
    expect(at(90)).toBe(at(100));
    expect(at(40)).toBeLessThan(at(100));
  });

  it('classic keeps the straight line', () => {
    const c = classicDay();
    c.cleanliness = 90;
    expect(floorPatience(c)).toBeCloseTo(ECONOMY.mess.patienceFloor + (1 - ECONOMY.mess.patienceFloor) * 0.9, 6);
  });
});

describe('FB2 A3: classic runs keep their floor rules', () => {
  it('no sink, no leak or mess rolls, no mess.spawn, the classic floor rates', () => {
    const s = classicDay();
    expect(s.stations.some((x) => x.id === 'sink')).toBe(false);
    below(s, 'trash');
    s.players[0].holding = 'latte';
    s.rng = rngWhere((r) => r < MESSES.binLeak);
    const rng = s.rng;
    interact(s, 'p1');
    below(s, 'grinder');
    interact(s, 'p1');
    expect([s.rng, s.messes]).toEqual([rng, []]);
    placeMess(s, 'spill', { x: 3, y: 4 });
    expect(events(s, 'mess.spawn')).toEqual([]);
    s.cleanliness = 50;
    stepCleanliness(s);
    expect(s.cleanliness).toBeCloseTo(50 - ECONOMY.mess.dirtPerMessPerTick, 6);
  });
});
