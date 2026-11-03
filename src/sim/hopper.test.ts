import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { applyGearInput, preferPartnerSlot } from './gear';
import { interact, stepStations } from './stations';
import { finishDay } from './closing';
import { GEAR, type GearId } from '../data/gear';
import { ECONOMY } from '../data/economy';
import { TICK_RATE } from './constants';
import { addStandIns } from './bots/roster';
import { chainFor } from './bots/brain';
import { stationsFromSlots } from './slots';
import type { GameState, StationKind } from './types';
import { gearStats } from '../ui/gearVM';
import { ACCURACY } from './accuracy';
import { stationLeft } from './counts';

const gearRun = (seed = 9): GameState =>
  createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 200 }, tier: 'stand', gear: true });

const buy = (s: GameState, ...ids: GearId[]): GameState => {
  let out = s;
  out.cash = 2000;
  for (const id of ids) out = step(out, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: id }]);
  return out;
};

const openBar = (...ids: GearId[]): GameState => {
  let s = buy(gearRun(), ...ids);
  for (const k of Object.keys(s.supplies) as (keyof typeof s.supplies)[]) s.supplies[k] = 40;
  s = startDay(s);
  s.eventSchedule = [];
  s.customers = [];
  return s;
};

const at = (s: GameState, kind: StationKind): GameState => {
  const st = s.stations.find((x) => x.kind === kind && !x.twin)!;
  s.players[0]!.pos = { x: st.pos.x, y: st.pos.y + 1 };
  return s;
};

const grindDone = (s: GameState): GameState => {
  at(s, 'grinder');
  s = interact(s, 'p1');
  const g = s.stations.find((x) => x.kind === 'grinder')!;
  while (g.busyTicksLeft > 0) stepStations(s);
  return s;
};

describe('Round 5: grinder hopper', () => {
  it('one grind fills doses; each empty-hands press takes one at once; empty grinds again', () => {
    let s = openBar('g2', 'e3');
    expect(GEAR.g2.doses).toBe(3);
    s = grindDone(s);
    const g = () => s.stations.find((x) => x.kind === 'grinder')!;
    expect(g().output).toBe('grounds');
    expect(g().doses).toBe(3);
    expect(s.supplies.beans).toBe(39);

    for (let i = 3; i >= 1; i--) {
      expect(g().doses).toBe(i);
      s.players[0]!.holding = null;
      at(s, 'grinder');
      s = interact(s, 'p1');
      expect(s.players[0]!.holding).toBe('grounds');
      if (i > 1) {
        expect(g().output).toBe('grounds');
        expect(g().doses).toBe(i - 1);
        expect(g().busyTicksLeft).toBe(0);
      } else {
        expect(g().output).toBeNull();
        expect(g().doses).toBeUndefined();
      }
      s.players[0]!.holding = null; // dump to take the next
    }

    // empty hopper: next press grinds again
    at(s, 'grinder');
    s = interact(s, 'p1');
    expect(g().busyTicksLeft).toBeGreaterThan(0);
    expect(s.supplies.beans).toBe(38);
  });

  it('closing clears hopper doses; g3 polish on grounds forgives one slip on the shot', () => {
    let s = openBar('g3', 'e2');
    s = grindDone(s);
    const g = s.stations.find((x) => x.kind === 'grinder')!;
    expect(g.doses).toBe(4);
    at(s, 'grinder');
    s = interact(s, 'p1');
    expect(s.players[0]!.groundsPolish).toBe(true);
    expect(s.players[0]!.holding).toBe('grounds');

    // mark the grounds, then pull: polish credit forgives one
    s.players[0]!.cupSlips = 1;
    at(s, 'espresso');
    s = interact(s, 'p1');
    const e = s.stations.find((x) => x.kind === 'espresso' && !x.twin)!;
    expect(e.making).toBe('espresso');
    expect(e.cupSlips ?? 0).toBe(0);
    expect(s.players[0]!.groundsPolish).toBeUndefined();

    s.stations.find((x) => x.kind === 'grinder')!.doses = 2;
    s.stations.find((x) => x.kind === 'grinder')!.output = 'grounds';
    s = finishDay(s);
    expect(s.stations.find((x) => x.kind === 'grinder')!.doses).toBeUndefined();
    expect(s.stations.find((x) => x.kind === 'grinder')!.output).toBeNull();
  });

  it('bots take from the hopper when making a shot', () => {
    let s = createRun({ seed: 44, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 240 }, tier: 'stand', gear: true });
    s = buy(s, 'g1', 'e2');
    addStandIns(s, 1);
    for (const k of Object.keys(s.supplies) as (keyof typeof s.supplies)[]) s.supplies[k] = 40;
    s.fridge = 'f1';
    s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
    s = startDay(s);
    s.eventSchedule = [];
    s.milkOut = 20;
    s.customers = [{ id: 1, drink: 'espresso', patienceLeft: 100_000, patienceMax: 100_000, stage: 'pickup', rungAt: 0 }];
    const g = () => s.stations.find((x) => x.kind === 'grinder')!;
    g().output = 'grounds';
    g().doses = 2;
    g().outputSince = s.tick;
    g().doneAt = s.tick;
    const beans = s.supplies.beans;
    for (let i = 0; i < 60 * 90 && s.today.served < 1; i++) s = step(s, []);
    expect(s.today.served).toBe(1);
    // Took a hopper dose rather than grinding again: no beans spent, one dose still waiting in the hopper.
    expect(s.supplies.beans).toBe(beans);
    expect(g().doses).toBe(1);
    expect(g().output).toBe('grounds');
  });

  it('a bot with doses in the hopper takes one before a free pod machine (G4e mixed bar)', () => {
    let s = gearRun();
    s.slots = ['grinder', 'espresso', 'espresso', 'trash'];
    s.slotGear = ['g1', 'e2', 'e1', 'b0'];
    s.stations = stationsFromSlots('stand', s.slots, s.slotGear);
    addStandIns(s, 1);
    for (const k of Object.keys(s.supplies) as (keyof typeof s.supplies)[]) s.supplies[k] = 40;
    s = startDay(s);
    const g = s.stations.find((x) => x.kind === 'grinder')!;
    g.output = 'grounds';
    g.doses = 2;
    g.outputSince = g.doneAt = s.tick;
    const bot = s.players.find((p) => p.bot)!;
    const steps = chainFor(s, bot, 'espresso', 'put');
    expect(steps[0]).toMatchObject({ kind: 'use', station: g.id });
  });

  it('a dose taken long after the grind is not marked as sat too long (the hopper keeps doses for later)', () => {
    let s = openBar('g1', 'e2');
    s = grindDone(s);
    const g = () => s.stations.find((x) => x.kind === 'grinder')!;
    expect(g().doses).toBe(2);
    for (const wait of [10, 30]) {
      s.tick += wait * TICK_RATE;
      s.players[0]!.holding = null;
      at(s, 'grinder');
      s = interact(s, 'p1');
      expect(s.players[0]!.holding).toBe('grounds');
      expect(s.players[0]!.cupSlips).toBeUndefined();
    }
    expect(30).toBeGreaterThan(ACCURACY.sitSeconds); // both waits are past the sit limit
  });

  it('idle bots leave the last hopper dose alone (it waits to be used or clears at closing)', () => {
    let s = createRun({ seed: 44, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 240 }, tier: 'stand', gear: true });
    s = buy(s, 'g1', 'e2');
    addStandIns(s, 1);
    for (const k of Object.keys(s.supplies) as (keyof typeof s.supplies)[]) s.supplies[k] = 40;
    s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
    s = startDay(s);
    s.eventSchedule = [];
    s.customers = [];
    const g = () => s.stations.find((x) => x.kind === 'grinder')!;
    g().output = 'grounds';
    g().doses = 1;
    g().outputSince = s.tick - 20 * TICK_RATE; // the first dose went a while ago
    g().doneAt = s.tick - 20 * TICK_RATE;
    for (let i = 0; i < 30 * TICK_RATE; i++) s = step(s, []);
    expect([g().output, g().doses]).toEqual(['grounds', 1]);
    expect(s.today.wasted ?? 0).toBe(0);
  });

  it('pulling a hopper grind early takes one dose and keeps the rest', () => {
    let s = openBar('g2', 'e3');
    at(s, 'grinder');
    s = interact(s, 'p1');
    const g = () => s.stations.find((x) => x.kind === 'grinder')!;
    expect(g().making).toBe('grounds');
    while (g().busyTicksLeft > g().busyTotal! * ACCURACY.earlyShare) stepStations(s);
    expect(g().busyTicksLeft).toBeGreaterThan(0);
    s = interact(s, 'p1');
    expect(s.players[0]!.holding).toBe('grounds');
    expect([g().busyTicksLeft, g().output, g().doses]).toEqual([0, 'grounds', GEAR.g2.doses! - 1]);
  });

  it('the left count over a hopper grinder is its doses', () => {
    let s = openBar('g3', 'e2');
    s = grindDone(s);
    const g = s.stations.find((x) => x.kind === 'grinder')!;
    expect(stationLeft(s, g.id)).toBe(4);
    at(s, 'grinder');
    s = interact(s, 'p1');
    expect(stationLeft(s, g.id)).toBe(3);
  });

  it('grinder + espresso beats two pods at every tier (shot time table, 0.4 s walk)', () => {
    const walk = 0.4;
    const pod = 5 / GEAR.e1.speed; // 6.0 — POD_SHOT, not the espresso base
    const shot = (g: GearId, e: GearId, emptyHopper = false) => {
      const grind = ECONOMY.stationSeconds.grinder / GEAR[g].speed;
      const pull = ECONOMY.stationSeconds.espresso / GEAR[e].speed;
      const perDose = emptyHopper ? grind : grind / (GEAR[g].doses ?? 1);
      return perDose + walk + pull;
    };
    expect(pod).toBeCloseTo(6.0, 2);
    expect(shot('g1', 'e2')).toBeLessThan(pod);
    expect(shot('g1', 'e2', true)).toBeLessThan(pod);
    expect(shot('g2', 'e3')).toBeLessThan(pod);
    expect(shot('g3', 'e4')).toBeLessThan(pod);
    expect(shot('g3', 'e5')).toBeLessThan(pod);
    expect(shot('g3', 'e6')).toBeLessThan(pod);
    // table numbers (one barista, cards ×1)
    expect(shot('g1', 'e2')).toBeCloseTo(4.5, 1);
    expect(shot('g1', 'e2', true)).toBeCloseTo(5.8, 1);
    expect(shot('g2', 'e3')).toBeCloseTo(3.3, 1);
    expect(shot('g3', 'e4')).toBeCloseTo(3.1, 1);
  });

  it('buying a grinder prefers the empty slot nearest an espresso (not merely the first empty)', () => {
    let s = gearRun();
    s.cash = 500;
    // Espresso in slot 2: first empty is 0, nearest empty is 1.
    s.slots = [null, null, 'espresso', 'trash'];
    s.slotGear = [null, null, 'e2', 'b0'];
    s.stations = stationsFromSlots('stand', s.slots, s.slotGear);
    expect(preferPartnerSlot(s, GEAR.g1, s.slots)).toBe(1);
    s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: 'g1' }]);
    expect(s.slotGear?.[1]).toBe('g1');
    expect(s.slotGear?.[0]).toBeNull();
  });

  it('gear cards show seconds and Grinds N shots at once', () => {
    expect(gearStats('g1')).toMatch(/2\.5 s grind/);
    expect(gearStats('g1')).toMatch(/Grinds 2 shots at once/);
    expect(gearStats('g2')).toMatch(/1\.25 s grind/);
    expect(gearStats('g2')).toMatch(/Grinds 3 shots at once/);
    expect(gearStats('g3')).toMatch(/Grinds 4 shots at once/);
    expect(gearStats('g3')).toMatch(/Forgives/);
    expect(gearStats('e2')).toMatch(/2\.86 s shots/);
    expect(gearStats('e3')).toMatch(/2\.5 s shots/);
    expect(gearStats('e1')).toMatch(/6 s pods/);
  });

  it('grind and pull tick counts match the new speeds', () => {
    let s = openBar('g2', 'e3');
    at(s, 'grinder');
    s = interact(s, 'p1');
    // 2.5 / 2.0 = 1.25 s → 75 ticks
    expect(s.stations.find((x) => x.kind === 'grinder')!.busyTicksLeft).toBe(Math.round((2.5 / 2) * TICK_RATE));
    while (s.stations.find((x) => x.kind === 'grinder')!.busyTicksLeft > 0) stepStations(s);
    at(s, 'grinder');
    s = interact(s, 'p1');
    at(s, 'espresso');
    s = interact(s, 'p1');
    // 3 / 1.2 = 2.5 s → 150 ticks
    expect(s.stations.find((x) => x.kind === 'espresso' && !x.twin)!.busyTicksLeft).toBe(Math.round((3 / 1.2) * TICK_RATE));
  });
});

describe('Round 5: preferPartnerSlot helper', () => {
  it('measures from where the crew moved the partner (state.slotPos), not its default spot', () => {
    const s = gearRun();
    s.slots = [null, null, 'espresso', 'trash'];
    s.slotGear = [null, null, 'e2', 'b0'];
    // Stand slots sit at x 1, 3, 5, 7 on row 1. Move the espresso (slot 2) next to slot 0's spot.
    s.slotPos = [null, null, { x: 1, y: 2 }, null];
    expect(preferPartnerSlot(s, GEAR.g1, s.slots)).toBe(0);
  });


  it('returns -1 with no partner or no empty slot', () => {
    const s = gearRun();
    s.slots = ['trash', 'trash', 'trash', 'trash'] as never;
    s.slotGear = ['b0', 'b0', 'b0', 'b0'];
    expect(preferPartnerSlot(s, GEAR.g1, s.slots!)).toBe(-1);
    s.slots = [null, null, null, 'trash'];
    s.slotGear = [null, null, null, 'b0'];
    expect(preferPartnerSlot(s, GEAR.g1, s.slots)).toBe(-1);
  });
});
