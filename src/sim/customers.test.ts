import { describe, it, expect } from 'vitest';
import { addCustomer, availableDrinks, rollKind, spawnCustomers, stepCustomers } from './customers';
import { counterInteract } from './pass';
import { createRun, startDay } from './run';
import { interact } from './stations';

const day = () => {
  const s = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
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

  it('day 1 spawns only normal and impatient; later days follow the 0.65/0.15/0.12/0.08 mix', () => {
    const s = day();
    const share = (kind: string, n = 2000) => {
      let c = 0;
      for (let i = 0; i < n; i++) if (rollKind(s) === kind) c++;
      return c / n;
    };
    s.day = 1;
    expect(share('group')).toBe(0);
    expect(share('regular')).toBe(0);
    const imp1 = share('impatient');
    expect(imp1).toBeGreaterThanOrEqual(0.11);
    expect(imp1).toBeLessThanOrEqual(0.19);
    s.day = 2;
    const group = share('group');
    const regular = share('regular');
    expect(group).toBeGreaterThanOrEqual(0.09);
    expect(group).toBeLessThanOrEqual(0.15);
    expect(regular).toBeGreaterThanOrEqual(0.05);
    expect(regular).toBeLessThanOrEqual(0.11);
    const normal = addCustomer(s, 'normal')!;
    const impatient = addCustomer(s, 'impatient')!;
    const grp = addCustomer(s, 'group')!;
    expect(impatient.patienceMax / normal.patienceMax).toBeCloseTo(0.6, 2);
    expect(1 + (grp.extra?.length ?? 0)).toBeGreaterThanOrEqual(2);
    expect(1 + (grp.extra?.length ?? 0)).toBeLessThanOrEqual(3);
    expect(grp.patienceMax / normal.patienceMax).toBeCloseTo(1.3, 2);
    expect(s.customers).toHaveLength(3);
  });

  it('a group orders 2-3 drinks, refills patience on each, and leaves after the last', () => {
    const s = day();
    s.customers = [{ id: 1, kind: 'group', drink: 'espresso', extra: ['latte'], patienceLeft: 100, patienceMax: 1000 }];
    s.players[0].holding = 'espresso';
    counterInteract(s, 'p1');
    expect(s.customers[0]).toMatchObject({ drink: 'latte', extra: [], patienceLeft: 400 });
    expect(s.today.served).toBe(1);
    expect(s.today.drinks?.espresso).toBe(1);
    s.players[0].holding = 'latte';
    counterInteract(s, 'p1');
    expect(s.customers).toEqual([]);
    expect(s.today.served).toBe(2);
    expect(s.today.drinks?.latte).toBe(1);
  });

  it('a group that walks out counts one lost per unserved drink', () => {
    const s = day();
    s.customers = [{ id: 1, kind: 'group', drink: 'espresso', extra: ['latte', 'coldBrew'], patienceLeft: 1, patienceMax: 1000 }];
    stepCustomers(s);
    expect(s.today.lost).toBe(3);
    expect(s.customers).toEqual([]);
  });

  it('impatient customers tip 1.5x', () => {
    const tipFor = (kind?: 'impatient') => {
      const s = day();
      s.customers = [{ id: 1, kind, drink: 'latte', patienceLeft: 500, patienceMax: 1000 }];
      s.players[0].holding = 'latte';
      counterInteract(s, 'p1');
      return s.today.tips;
    };
    expect(tipFor('impatient')).toBeCloseTo(tipFor() * 1.5, 1);
  });
});
