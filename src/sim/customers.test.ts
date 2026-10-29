import { describe, it, expect } from 'vitest';
import { finishDay } from './closing';
import { addCustomer, availableDrinks, rollKind, spawnCustomers, stepCustomers } from './customers';
import { counterInteract } from './pass';
import { createRun, startDay } from './run';
import { interact } from './stations';
import { step } from './step';
import { ECONOMY } from '../data/economy';

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
    s.supplies = { beans: 0, milk: 5, concentrate: 3, flavour: 0, pastry: 0 };
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
    expect(s.cash).toBeCloseTo(100 + 4.75 + 0.87, 2); // ★★★ cup tips ×1.05 (P3 B5); tip = 4.75 × 0.35 × 0.5 = 0.83125 -> 0.83
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

  it('creates up to three regulars, then brings back one not already queued', () => {
    const s = day();
    for (let i = 0; i < 3; i++) addCustomer(s, 'regular');
    expect(s.regulars.map((r) => [r.name, r.visits])).toEqual([['Ada', 1], ['Ravi', 1], ['June', 1]]);
    s.customers = s.customers.filter((c) => c.name === 'Ada' || c.name === 'Ravi');
    expect(addCustomer(s, 'regular')).toMatchObject({ kind: 'regular', name: 'June' });
    expect(s.regulars[2].visits).toBe(2);
    const fallback = addCustomer(s, 'regular'); // all three queued: a normal customer (kind absent) instead
    expect(fallback?.kind).toBeUndefined();
    expect(fallback?.name).toBeUndefined();
  });

  it('a lost regular counts double toward reputation and keeps coming back', () => {
    const rep = (served: number) => {
      const s = day();
      s.regulars = [{ name: 'Ada', drink: 'latte', visits: 1, lost: 0 }];
      s.customers = [{ id: 1, kind: 'regular', name: 'Ada', drink: 'latte', patienceLeft: 1, patienceMax: 100 }];
      stepCustomers(s);
      expect(s.today).toMatchObject({ lost: 1, lostRegulars: 1 });
      expect(s.regulars[0].lost).toBe(1);
      s.today.served = served;
      const before = s.reputation;
      finishDay(s);
      return Math.round((s.reputation - before) * 100) / 100;
    };
    expect(rep(6)).toBe(0.2); // 6/8 = 0.75
    expect(rep(4)).toBe(-0.2); // 4/6 < 0.7
  });
  it('an upset customer is served first among matches', () => {
    const s = day();
    s.day = 2;
    s.customers = [
      { id: 1, drink: 'latte', patienceLeft: 200, patienceMax: 1000 },
      { id: 2, drink: 'latte', patienceLeft: 900, patienceMax: 1000, upset: { ticksLeft: 500 } },
    ];
    s.players[0].holding = 'latte';
    counterInteract(s, 'p1');
    expect(s.customers.map((c) => c.id)).toEqual([1]);
    expect(s.today.served).toBe(1);
  });
});

describe('served log (Block 3)', () => {
  it('logs who served what, the take, the kind and a perfect serve; nothing on an upset', () => {
    const s = day();
    s.customers = [{ id: 50, drink: 'latte', patienceLeft: 1000, patienceMax: 1000, kind: 'regular', name: 'Ada' }];
    s.players[0].holding = 'latte';
    counterInteract(s, 'p1');
    const e = s.log.filter((x) => x.kind === 'served').at(-1)!;
    expect(e.data).toMatchObject({ by: 'p1', item: 'latte', kind: 'regular', name: 'Ada', cid: 50, perfect: true, left: 0 });
    expect(e.data.amount).toBeCloseTo(s.today.sales + s.today.tips, 2);
    // a nearly-out-of-patience serve is not perfect
    s.customers = [{ id: 51, drink: 'espresso', patienceLeft: 100, patienceMax: 1000 }];
    s.players[0].holding = 'espresso';
    counterInteract(s, 'p1');
    expect(s.log.filter((x) => x.kind === 'served').at(-1)!.data).toMatchObject({ cid: 51, perfect: false, kind: 'normal' });
  });
});

describe('sold-out walk-ups (FB1 WP4)', () => {
  const empty = { beans: 0, milk: 0, concentrate: 0, flavour: 0, pastry: 0 };
  const run = (s: ReturnType<typeof day>, ticks: number) => {
    for (let i = 0; i < ticks; i++) s = spawnCustomers(s);
    return s;
  };

  it('with the menu on and zero stock, people walk away and nothing is lost or turned away', () => {
    let s = day();
    s.supplies = { ...empty };
    s = run(s, 3600);
    expect(s.customers).toHaveLength(0);
    expect(s.today.soldOutWalkouts).toBeGreaterThan(0);
    expect(s.today.lost).toBe(0);
    expect(s.today.turnedAway).toBe(0);
    expect(typeof s.today.soldOutAt).toBe('number');
    expect(s.log.filter((e) => e.kind === 'walkout').every((e) => e.data.reason === 'soldOut')).toBe(true);
    expect(s.log.some((e) => e.kind === 'walkout')).toBe(true);
  });

  it('with every drink switched off nobody comes', () => {
    let s = day();
    s.supplies = { ...empty };
    for (const d of Object.keys(s.menu)) s.menu[d as keyof typeof s.menu] = false;
    const rng = s.rng;
    s = run(s, 3600);
    expect(s.today.soldOutWalkouts).toBeUndefined();
    expect(s.rng).toBe(rng);
  });

  it('rush hour brings more walkers over the same ticks', () => {
    const base = day();
    base.supplies = { ...empty };
    const rush = structuredClone(base);
    rush.events = [{ kind: 'rushHour', ticksLeft: 99999 }];
    expect(run(rush, 3600).today.soldOutWalkouts ?? 0).toBeGreaterThan(run(base, 3600).today.soldOutWalkouts ?? 0);
  });

  it('with stock nothing changes: identical runs, no walkouts', () => {
    let a = day();
    let b = day();
    for (let i = 0; i < 900; i++) {
      a = step(a, []);
      b = step(b, []);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.today.soldOutWalkouts).toBeUndefined();
    expect(a.today.soldOutAt).toBeUndefined();
  });

  it('the morning note counts yesterday\'s walkers', () => {
    let s = day();
    s.supplies = { ...empty };
    s = run(s, 3600);
    const n = s.today.soldOutWalkouts!;
    s = finishDay(s);
    s.supplies = { ...ECONOMY.startingSupplies };
    expect(startDay(s).morningNotes).toContain(`${n === 1 ? '1 person' : `${n} people`} walked away from a sold-out board yesterday.`);
  });
});
