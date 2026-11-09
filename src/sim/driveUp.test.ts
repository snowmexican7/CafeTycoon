import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../data/economy';
import { addDriveUp, availableDrinks, queueCapacity, spawnCustomers } from './customers';
import { DRIVE_UP_EVERY, driveUpThisTick } from './driveUp';
import { computeModifiers } from './effects';
import { tierInfo } from './growth';
import { waitingRoom } from './line';
import { createRun, startDay } from './run';

const day = () => {
  const s = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
  s.scenario = 'normal';
  return startDay(s);
};

function firstDriveUp(seed: number): number {
  for (let t = 0; t < DRIVE_UP_EVERY * 3; t++) if (driveUpThisTick(seed, t)) return t;
  return -1;
}

describe('drive-up customers', () => {
  it('is an occasional extra, and 0 turns it off', () => {
    expect(driveUpThisTick(1, 0, 0)).toBe(false);
    expect(driveUpThisTick(1, 10, 0)).toBe(false);
    let n = 0;
    for (let t = 0; t < DRIVE_UP_EVERY * 10; t++) if (driveUpThisTick(3, t)) n += 1;
    expect(n).toBeGreaterThan(5);
    expect(n).toBeLessThan(16);
    const tick = firstDriveUp(3);
    expect(driveUpThisTick(3, tick)).toBe(true);
    expect(driveUpThisTick(3, tick)).toBe(driveUpThisTick(3, tick));
  });

  it('adds one ordinary customer and does not touch the walk-in dice', () => {
    const tick = firstDriveUp(3);
    const quiet = tick + 1;
    expect(driveUpThisTick(3, quiet)).toBe(false);
    const run = (at: number) => {
      const s = day();
      s.tick = at;
      s.customers = [];
      spawnCustomers(s);
      return { rng: s.rng, n: s.customers.length };
    };
    const plain = run(quiet);
    const stopped = run(tick);
    expect(stopped.rng).toBe(plain.rng);
    expect(stopped.n).toBe(plain.n + 1);

    const s = day();
    s.tick = tick;
    s.customers = [];
    const rng = s.rng;
    const id = s.nextCustomerId;
    expect(addDriveUp(s)).toBe(true);
    expect(s.rng).toBe(rng);
    expect(s.customers).toHaveLength(1);
    const c = s.customers[0]!;
    expect(c.id).toBe(id);
    expect(c.kind).toBeUndefined();
    expect(c.order).toBeUndefined();
    expect(availableDrinks(s)).toContain(c.drink);
    expect(c.patienceMax).toBeGreaterThan(0);
    expect(c.patienceLeft).toBe(c.patienceMax);
  });

  it('does not stop when the queue and the waiting area are full', () => {
    const s = day();
    s.tick = firstDriveUp(s.seed);
    const cap = queueCapacity(computeModifiers(s), tierInfo(s).queue);
    s.customers = Array.from({ length: cap }, (_, i) => ({ id: i + 1, drink: 'espresso' as const, patienceLeft: 100, patienceMax: 100 }));
    s.waiting = Array.from({ length: waitingRoom(s) }, (_, i) => ({ id: 50 + i, drink: 'espresso' as const, patienceLeft: 100, patienceMax: 100 }));
    s.nextCustomerId = 80;
    const rng = s.rng;
    expect(waitingRoom(s)).toBe(ECONOMY.line.waiting.cafe);
    expect(addDriveUp(s)).toBe(false);
    expect(s.rng).toBe(rng);
    expect(s.customers).toHaveLength(cap);
    expect(s.waiting).toHaveLength(waitingRoom(s));
    expect(s.nextCustomerId).toBe(80);
  });

  it('does not stop when a card has turned walk-ins off', () => {
    const s = day();
    s.tick = firstDriveUp(s.seed);
    s.customers = [];
    s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
    const rng = s.rng;
    expect(addDriveUp(s)).toBe(false);
    expect(s.rng).toBe(rng);
    expect(s.customers).toHaveLength(0);
  });
});
