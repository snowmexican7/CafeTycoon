import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { ECONOMY } from '../data/economy';
import { TICK_RATE, secondsToTicks } from './constants';
import type { GameState } from './types';

const day = (seed: number): GameState => {
  let s = createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
  s.scenario = 'normal';
  s = startDay(s);
  return s;
};

(ECONOMY as { openGraceSeconds: number }).openGraceSeconds = 8; // the shared test setup zeroes it

describe('open grace window', () => {
  it('has a configured length', () => {
    expect(ECONOMY.openGraceSeconds).toBe(8);
  });

  it('spawns only fans (at most one) in the grace window, then normal arrivals resume', () => {
    let fanDays = 0;
    for (let seed = 1; seed <= 25; seed++) {
      let s = day(seed);
      const grace = secondsToTicks(ECONOMY.openGraceSeconds);
      let fans = 0;
      const seen = new Set<number>();
      for (let i = 0; i < grace; i++) {
        s = step(s, []);
        for (const c of s.customers) {
          if (seen.has(c.id)) continue;
          seen.add(c.id);
          expect(c.kind).toBe('fan');
          expect(c.patienceMax).toBeGreaterThan(0);
          fans++;
        }
      }
      expect(fans).toBeLessThanOrEqual(1);
      fanDays += fans;
      let later = 0;
      for (let i = 0; i < 25 * TICK_RATE; i++) {
        s = step(s, []);
        for (const c of s.customers) if (!seen.has(c.id)) { seen.add(c.id); later++; expect(c.kind).not.toBe('fan'); }
      }
      expect(later).toBeGreaterThan(0);
    }
    expect(fanDays).toBeGreaterThan(2); // ~35% of 25
    expect(fanDays).toBeLessThan(18);
  });

  it('a fan waits 2.5x as long as a normal customer', async () => {
    const { addCustomer } = await import('./customers');
    const a = day(5);
    const b = day(5);
    const fan = addCustomer(a, 'fan')!;
    const norm = addCustomer(b, 'normal')!;
    expect(fan.kind).toBe('fan');
    expect(fan.patienceMax / norm.patienceMax).toBeGreaterThan(2.3);
    expect(fan.patienceMax / norm.patienceMax).toBeLessThan(2.7);
  });
});
