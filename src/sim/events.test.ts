import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../data/economy';
import { computeModifiers } from './effects';
import { counterInteract } from './pass';
import { createRun, startDay } from './run';
import { step } from './step';
import type { GameState } from './types';

const make = (seed = 1): GameState =>
  createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });

/** A fresh run whose next startDay is day 2 (no need to play night 1). */
const dayTwo = (seed: number): GameState => {
  const s = make(seed);
  s.day = 2;
  return startDay(s);
};

const ticks = (s: GameState, n: number): GameState => {
  for (let i = 0; i < n; i++) s = step(s, []);
  return s;
};

describe('event schedule', () => {
  it('day 1 has no events; later days follow the 0.35/0.45/0.20 count split', () => {
    expect(startDay(make(1)).eventSchedule).toEqual([]);
    const counts = [0, 0, 0];
    for (let seed = 1; seed <= 400; seed++) {
      const s = dayTwo(seed);
      const sched = s.eventSchedule;
      counts[sched.length] += 1;
      expect(new Set(sched.map((e) => e.kind)).size).toBe(sched.length);
      const dayTicks = s.settings.dayLengthSec * 60;
      for (const e of sched) {
        const off = (e.startTick - s.tick) / dayTicks;
        expect(off).toBeGreaterThanOrEqual(ECONOMY.events.windowStart - 0.001);
        expect(off).toBeLessThanOrEqual(ECONOMY.events.windowEnd + 0.001);
      }
      expect(sched.map((e) => e.startTick)).toEqual(sched.map((e) => e.startTick).sort((a, b) => a - b));
    }
    expect(counts[0] / 400).toBeGreaterThanOrEqual(0.28);
    expect(counts[0] / 400).toBeLessThanOrEqual(0.42);
    expect(counts[2] / 400).toBeGreaterThanOrEqual(0.14);
    expect(counts[2] / 400).toBeLessThanOrEqual(0.26);
  });

  it('is deterministic per seed', () => {
    const a = make(7);
    a.day = 2;
    const b = structuredClone(a);
    expect(startDay(a).eventSchedule).toEqual(startDay(b).eventSchedule);
    expect(a.rng).toBe(b.rng);
  });
});

describe('rush hour', () => {
  it('doubles traffic and trims patience for 30 s', () => {
    let s = dayTwo(1);
    s.eventSchedule = [];
    const base = computeModifiers(s);
    s.eventSchedule = [{ kind: 'rushHour', startTick: s.tick + 1 }];
    s = step(s, []);
    expect(computeModifiers(s).traffic).toBeCloseTo(base.traffic * 2);
    expect(computeModifiers(s).patience).toBeCloseTo(base.patience * 0.9);
    expect(s.eventSchedule).toEqual([]);
    expect(s.log.some((e) => e.kind === 'event.start')).toBe(true);
    s = ticks(s, 1800);
    expect(s.events).toEqual([]);
    expect(s.today.events).toEqual(['rushHour']);
    expect(s.log.some((e) => e.kind === 'event.end')).toBe(true);
  });
});

describe('power flicker', () => {
  it('pauses stations for 4 s and loses nothing', () => {
    let s = dayTwo(1);
    s.eventSchedule = [];
    s.stations[0].busyTicksLeft = 100;
    s.events = [{ kind: 'powerFlicker', ticksLeft: 240 }];
    s = ticks(s, 240);
    expect(s.stations[0].busyTicksLeft).toBe(99); // stepEvents removes the event on tick 240, then stepStations counts down once
    s = ticks(s, 100);
    expect(s.stations[0].output).toBe('grounds');
  });
});

describe('health inspector', () => {
  it('fines 15 at four wasted drinks and passes below, with a reputation bonus', () => {
    let s = dayTwo(1);
    s.eventSchedule = [];
    s.today.wasted = 4;
    s.events = [{ kind: 'healthInspector', ticksLeft: 1 }];
    const cash = s.cash;
    s = step(s, []);
    expect(s.today).toMatchObject({ fines: 15, inspection: 'fail' });
    expect(s.cash).toBeCloseTo(cash - 15);
    expect(s.events).toEqual([]);

    let t = dayTwo(1);
    t.eventSchedule = [];
    t.today.wasted = 3;
    t.events = [{ kind: 'healthInspector', ticksLeft: 1 }];
    t = step(t, []);
    expect(t.today.inspection).toBe('pass');
    expect(t.today.fines).toBe(0);
    t.today.served = 10;
    t.today.lost = 0;
    t.reputation = 2.5;
    t.phase = 'closing';
    t.phaseTicksLeft = 1;
    t = step(t, []);
    expect(t.reputation).toBeCloseTo(2.8);
  });

  it('Review Focus 5: day end with an active inspector and drinks on the pass', () => {
    let s = dayTwo(1);
    s.eventSchedule = [];
    s.today.wasted = 0;
    s.events = [
      { kind: 'healthInspector', ticksLeft: 500 },
      { kind: 'rushHour', ticksLeft: 900 },
    ];
    s.pass = [{ item: 'latte', ticksLeft: 999 }];
    s.phase = 'closing';
    s.phaseTicksLeft = 1;
    s = step(s, []);
    const d = s.days.at(-1)!;
    expect(d.inspection).toBe('pass');
    expect(d.wasted).toBe(0);
    expect([s.pass, s.events]).toEqual([[], []]);
    s = ticks(s, 60 * 60);
    expect(s.phase).toBe('day');
    expect(s.today.inspection).toBeNull();
  });
});

describe('influencer visit', () => {
  it('jumps a full queue, pays a bonus and boosts traffic', () => {
    let s = dayTwo(1);
    s.scenario = 'normal';
    s.owned = [];
    s.customers = Array.from({ length: 6 }, (_, i) => ({
      id: 100 + i,
      drink: 'espresso' as const,
      patienceLeft: 99999,
      patienceMax: 99999,
    }));
    s.eventSchedule = [{ kind: 'influencerVisit', startTick: s.tick + 1 }];
    s = step(s, []);
    const inf = s.customers.find((c) => c.kind === 'influencer')!;
    expect(s.customers).toHaveLength(7);
    expect(inf.drink).toBe('latte');
    expect(inf.patienceMax).toBe(Math.round(25 * computeModifiers(s).patience * 1.5 * 60));
    expect(s.events).toEqual([{ kind: 'influencerVisit', ticksLeft: inf.patienceMax - 1, customerId: inf.id }]);

    const before = computeModifiers(s).traffic;
    const cash = s.cash;
    s.players[0].holding = 'latte';
    counterInteract(s, s.players[0].id);
    expect(s.customers.some((c) => c.kind === 'influencer')).toBe(false);
    expect(s.today).toMatchObject({ bonus: ECONOMY.events.influencer.bonus, influencer: 'served' });
    expect(s.cash).toBeGreaterThan(cash + ECONOMY.events.influencer.bonus);
    expect(computeModifiers(s).traffic).toBeCloseTo(before * ECONOMY.events.influencer.trafficAfter);
    s = step(s, []);
    expect(s.events).toEqual([]);
    expect(s.log.filter((e) => e.kind === 'event.end').length).toBe(1);
  });

  it('is lost when the queue is already at seven, or when patience runs out', () => {
    let s = dayTwo(1);
    s.scenario = 'normal';
    s.owned = [];
    s.customers = Array.from({ length: 7 }, (_, i) => ({ id: 100 + i, drink: 'espresso' as const, patienceLeft: 99999, patienceMax: 99999 }));
    s.eventSchedule = [{ kind: 'influencerVisit', startTick: s.tick + 1 }];
    s = step(s, []);
    expect(s.customers).toHaveLength(7);
    expect(s.events).toEqual([]);
    expect(s.today.events).toEqual(['influencerVisit']);

    let t = dayTwo(1);
    t.scenario = 'normal';
    t.owned = [];
    t.eventSchedule = [{ kind: 'influencerVisit', startTick: t.tick + 1 }];
    t = step(t, []);
    const inf = t.customers.find((c) => c.kind === 'influencer')!;
    inf.patienceLeft = 1;
    t = step(t, []);
    expect(t.today.influencer).toBe('lost');
    t = step(t, []);
    expect(t.events).toEqual([]);
  });
});
