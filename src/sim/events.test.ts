import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../data/economy';
import { computeModifiers } from './effects';
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

  it('an influencer visit starts and ends at once with no active entry', () => {
    let s = dayTwo(1);
    s.eventSchedule = [{ kind: 'influencerVisit', startTick: s.tick + 1 }];
    s = step(s, []);
    expect(s.events).toEqual([]);
    expect(s.today.events).toEqual(['influencerVisit']);
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
