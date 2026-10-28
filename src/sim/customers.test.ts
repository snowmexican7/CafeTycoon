import { describe, it, expect } from 'vitest';
import { availableDrinks, spawnCustomers, stepCustomers } from './customers';
import { createRun, startDay } from './run';
import { interact } from './stations';

const day = () => {
  const s = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
  s.scenario = 'normal';
  return startDay(s);
};

describe('customers', () => {
  it('spawns about one customer per six seconds at normal pace', () => {
    let s = day();
    let spawned = 0;
    for (let i = 0; i < 60 * 600; i++) {
      s = spawnCustomers(s);
      spawned += s.customers.length;
      s.customers = [];
    }
    expect(spawned).toBeGreaterThan(70); // 100 expected over 600 s; deterministic for seed 3
    expect(spawned).toBeLessThan(130);
  });

  it('only orders drinks with supplies, and never past the queue cap', () => {
    let s = day();
    s.supplies = { beans: 0, milk: 5, concentrate: 3 };
    expect(availableDrinks(s)).toEqual(['coldBrew']);
    s.customers = Array.from({ length: 6 }, (_, i) => ({ id: i, drink: 'coldBrew' as const, patienceLeft: 100, patienceMax: 100 }));
    for (let i = 0; i < 60 * 60; i++) s = spawnCustomers(s);
    expect(s.customers).toHaveLength(6);
    expect(s.today.turnedAway).toBeGreaterThan(0);
    s.supplies.concentrate = 0;
    s.customers = [];
    s.today.turnedAway = 0;
    for (let i = 0; i < 60 * 60; i++) s = spawnCustomers(s);
    expect(s.customers).toHaveLength(0);
    expect(s.today.turnedAway).toBe(0);
  });

  it('customers leave at zero patience and count as lost', () => {
    let s = day();
    s.customers = [{ id: 1, drink: 'espresso', patienceLeft: 2, patienceMax: 1500 }];
    s = stepCustomers(s);
    expect(s.customers).toHaveLength(1);
    s = stepCustomers(s);
    expect(s.customers).toHaveLength(0);
    expect(s.today.lost).toBe(1);
  });

  it('serves the most impatient matching customer with a patience-scaled tip', () => {
    let s = day();
    s.players[0].holding = 'latte';
    s.players[0].pos = { x: 6, y: 5.1 };
    s.customers = [
      { id: 1, drink: 'latte', patienceLeft: 1000, patienceMax: 1000 },
      { id: 2, drink: 'latte', patienceLeft: 500, patienceMax: 1000 },
      { id: 3, drink: 'espresso', patienceLeft: 10, patienceMax: 1000 },
    ];
    s = interact(s, 'p1');
    expect(s.customers.map((c) => c.id)).toEqual([1, 3]);
    expect(s.cash).toBeCloseTo(100 + 4.75 + 0.83, 2); // tip = 4.75 × 0.35 × 0.5 = 0.83125 -> 0.83
    expect(s.today.served).toBe(1);
    expect(s.today.sales).toBe(4.75);
    expect(s.players[0].holding).toBeNull();
    s.players[0].holding = 'coldBrew';
    s = interact(s, 'p1');
    expect(s.players[0].holding).toBeNull(); // nobody ordered it: it goes onto the pass
    expect(s.pass).toEqual([{ item: 'coldBrew', ticksLeft: 36000 }]);
  });
});
