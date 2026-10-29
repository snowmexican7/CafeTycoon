import { describe, it, expect } from 'vitest';
import { serveCustomer, stepCustomers } from './customers';
import { createRun, startDay } from './run';
import type { Customer, DrinkId, GameState } from './types';

const rogueCafe = (dayNo = 2): GameState => {
  const s = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
  s.scenario = 'normal';
  startDay(s);
  s.day = dayNo;
  s.customers = [];
  s.rogue = null;
  return s;
};

let nextId = 1000;
const fresh = (drink: DrinkId = 'latte', extra: Partial<Customer> = {}): Customer => ({
  id: nextId++,
  drink,
  patienceLeft: 1000,
  patienceMax: 1000,
  ...extra,
});

/** Clone `s` and serve fresh normal customers until one comes back upset; return the clone just before that hit. */
function upsetServe(s: GameState, drink: DrinkId = 'latte'): GameState {
  let cur = structuredClone(s);
  for (let i = 0; i < 10000; i++) {
    const before = structuredClone(cur);
    before.customers = [fresh(drink)];
    const trial = structuredClone(before);
    serveCustomer(trial, trial.customers[0], drink);
    if (trial.customers[0]?.upset) return before;
    cur = trial;
  }
  throw new Error('no upset in 10000 serves');
}

describe('rogue trigger', () => {
  it('rogue rate is 0.8–2.5% over 2000 day-2 serves', () => {
    const s = rogueCafe(2);
    let upset = 0;
    for (let i = 0; i < 2000; i++) {
      const c = fresh();
      s.customers = [c];
      s.rogue = null;
      serveCustomer(s, c, 'latte');
      if (c.upset !== undefined) upset++;
    }
    expect(upset).toBeGreaterThanOrEqual(16);
    expect(upset).toBeLessThanOrEqual(50);
  });

  it('never on day 1, and day 1 draws nothing', () => {
    const s = rogueCafe(1);
    const rng = s.rng;
    let upset = 0;
    for (let i = 0; i < 2000; i++) {
      const c = fresh();
      s.customers = [c];
      serveCustomer(s, c, 'latte');
      if (c.upset !== undefined) upset++;
    }
    expect(upset).toBe(0);
    expect(s.rng).toBe(rng);
  });

  it('never for an influencer, a group, or while one is active', () => {
    const s = rogueCafe(2);
    const rng = s.rng;
    let upset = 0;
    for (let i = 0; i < 2000; i++) {
      const c = fresh('latte', { kind: 'influencer' });
      s.customers = [c];
      serveCustomer(s, c, 'latte');
      if (c.upset) upset++;
    }
    for (let i = 0; i < 2000; i++) {
      const c = fresh('latte', { kind: 'group', extra: ['espresso'] });
      s.customers = [c];
      serveCustomer(s, c, 'latte');
      if (c.upset) upset++;
    }
    for (let i = 0; i < 2000; i++) {
      const other = fresh('espresso', { upset: { ticksLeft: 500 } });
      const c = fresh();
      s.customers = [other, c];
      serveCustomer(s, c, 'latte');
      if (c.upset) upset++;
    }
    for (let i = 0; i < 2000; i++) {
      const c = fresh();
      s.customers = [c];
      s.rogue = { customerId: 1, drink: 'latte', stage: 'walking', pos: { x: 6, y: 7 }, path: [], station: null, ticksLeft: 0, waitTicks: 0 };
      serveCustomer(s, c, 'latte');
      if (c.upset) upset++;
    }
    expect(upset).toBe(0);
    expect(s.rng).toBe(rng);
  });

  it('an upset customer is not paid, keeps patience, and the drink is gone', () => {
    const s = upsetServe(rogueCafe(2));
    const c = s.customers[0];
    const { cash } = s;
    const { served, sales } = s.today;
    const wasted = s.today.wasted ?? 0;
    serveCustomer(s, c, 'latte');
    expect(c.upset).toEqual({ ticksLeft: 900 });
    expect(s.cash).toBe(cash);
    expect(s.today.served).toBe(served);
    expect(s.today.sales).toBe(sales);
    expect(s.today.wasted ?? 0).toBe(wasted);
    expect(s.customers).toEqual([c]);
    expect(s.log.some((e) => e.kind === 'rogue.upset' && e.data.drink === 'latte')).toBe(true);
    const patience = c.patienceLeft;
    for (let i = 0; i < 120; i++) stepCustomers(s);
    expect(c.patienceLeft).toBe(patience);
    expect(c.upset?.ticksLeft).toBe(900 - 120);
  });

  it('remake inside the window pays and never rolls again', () => {
    const s = upsetServe(rogueCafe(2));
    const c = s.customers[0];
    serveCustomer(s, c, 'latte');
    expect(c.upset).toBeDefined();
    const { cash } = s;
    const { served } = s.today;
    const rng = s.rng;
    serveCustomer(s, c, 'latte');
    expect(s.cash).toBeGreaterThan(cash);
    expect(s.today.served).toBe(served + 1);
    expect(s.customers).toEqual([]);
    expect(c.upset).toBeUndefined();
    expect(s.log.some((e) => e.kind === 'rogue.remade')).toBe(true);
    expect(s.rng).toBe(rng); // no roll on the remake serve
  });

  it('window ends: they leave the queue as a rogue, counted lost and a lost regular', () => {
    const s = rogueCafe(2);
    s.regulars = [{ name: 'Ada', drink: 'latte', visits: 1, lost: 0 }];
    const ada = fresh('latte', { kind: 'regular', name: 'Ada', upset: { ticksLeft: 900 } });
    s.customers = [ada];
    for (let i = 0; i < 900; i++) stepCustomers(s);
    expect(s.customers).toEqual([]);
    expect(s.today.lost).toBe(1);
    expect(s.today.rogues).toBe(1);
    expect(s.today.lostRegulars).toBe(1);
    expect(s.regulars[0].lost).toBe(1);
    expect(s.rogue).toMatchObject({ customerId: ada.id, name: 'Ada', stage: 'walking', pos: { x: 6, y: 7 }, drink: 'latte', station: null });
  });
});
