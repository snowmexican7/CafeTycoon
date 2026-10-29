import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../data/economy';
import { LAYOUT } from '../data/layout';
import { finishDay } from './closing';
import { serveCustomer, stepCustomers } from './customers';
import { ROGUE_REVIEW } from './describe';
import { isFreeForRogue } from './rogue';
import { createRun, startDay } from './run';
import { step } from './step';
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
    expect(s.rogue).toMatchObject({ customerId: ada.id, name: 'Ada', stage: 'walking', pos: { x: 6, y: 7 }, drink: 'latte', station: 'steamer' });
  });
});

/** A day-2 café with the doors already shut (no spawns, no events) and a long closing phase. */
const quietCafe = (): GameState => {
  const s = rogueCafe(2);
  s.phase = 'closing';
  s.phaseTicksLeft = 100000;
  s.events = [];
  s.eventSchedule = [];
  s.supplies = { beans: 10, milk: 10, concentrate: 10 };
  return s;
};

/** Queue one customer whose remake window ends on the next tick, then step once. */
const goRogue = (s: GameState, drink: DrinkId = 'latte'): GameState => {
  s.customers = [fresh(drink, { upset: { ticksLeft: 1 } })];
  return step(s, []);
};

const runUntil = (s: GameState, done: (t: GameState) => boolean, max = 5000): GameState => {
  let t = s;
  for (let i = 0; i < max; i++) {
    if (done(t)) return t;
    t = step(t, []);
  }
  throw new Error('runUntil: condition never met');
};

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
const station = (s: GameState, id: string) => s.stations.find((st) => st.id === id)!;
const RECIPE_IDS = ['grinder', 'espresso', 'steamer', 'coldBrewTap'];

describe('the rogue entity', () => {
  it('a rogue heads for their own station when free', () => {
    const s = goRogue(quietCafe(), 'latte');
    expect(s.rogue?.station).toBe('steamer');
    expect(s.rogue?.stage).toBe('walking');
    expect(s.rogue?.path.length).toBeGreaterThan(0);
  });

  it('own station busy: the nearest other free recipe station', () => {
    const s0 = quietCafe();
    station(s0, 'steamer').busyTicksLeft = 100;
    const from = LAYOUT.rogueStart;
    const expected = s0.stations
      .filter((st) => RECIPE_IDS.includes(st.id) && st.id !== 'steamer')
      .reduce((best, st) => (dist(st.pos, from) < dist(best.pos, from) ? st : best)).id;
    const s = goRogue(s0, 'latte');
    expect(s.rogue?.station).toBe(expected);
    expect(s.rogue?.stage).toBe('walking');
  });

  it('walks at 0.8× the base speed', () => {
    let s = goRogue(quietCafe(), 'latte');
    let covered = 0;
    for (let i = 0; i < 60; i++) {
      const before = { ...s.rogue!.pos };
      s = step(s, []);
      covered += dist(before, s.rogue!.pos);
    }
    expect(covered).toBeLessThanOrEqual(ECONOMY.moveSpeedTilesPerSecond * 0.8 + 0.01);
    expect(covered).toBeGreaterThan(2.9);
  });

  it('makes for 10 s: occupied, supplies used, no output, then leaves and is removed at the door', () => {
    let s = goRogue(quietCafe(), 'latte');
    const id = s.rogue!.customerId;
    const { beans, milk, concentrate } = s.supplies;
    s = runUntil(s, (t) => t.rogue?.stage === 'making');
    expect(station(s, 'steamer').occupiedBy).toBe(id);
    expect(station(s, 'steamer').busyTicksLeft).toBe(600);
    expect(s.rogue!.ticksLeft).toBe(600);
    expect(s.supplies).toEqual({ beans: beans - 1, milk: milk - 1, concentrate });
    s = runUntil(s, (t) => t.rogue === null);
    expect(station(s, 'steamer').output).toBeNull();
    expect(station(s, 'steamer').occupiedBy).toBeNull();
    expect(s.log.some((e) => e.kind === 'rogue.made')).toBe(true);
    expect(s.log.some((e) => e.kind === 'rogue.stormed')).toBe(false);
  });

  it('out of milk: makes it anyway', () => {
    const s0 = quietCafe();
    s0.supplies.milk = 0;
    let s = goRogue(s0, 'latte');
    s = runUntil(s, (t) => t.rogue?.stage === 'making');
    expect(s.supplies.milk).toBe(0);
    expect(s.supplies.beans).toBe(9);
    expect(station(s, 'steamer').occupiedBy).toBe(s.rogue!.customerId);
  });

  it('a player at the station: wait 5 s, then another station', () => {
    let s = goRogue(quietCafe(), 'latte');
    expect(s.rogue?.station).toBe('steamer');
    s.players[0].pos = { x: 5, y: 2 };
    s = runUntil(s, (t) => t.rogue?.stage !== 'walking');
    expect(s.rogue?.stage).toBe('waiting');
    expect(s.rogue?.waitTicks).toBe(0);
    for (let i = 0; i < 299; i++) s = step(s, []);
    expect(s.rogue?.stage).toBe('waiting');
    expect(s.rogue?.station).toBe('steamer');
    s = step(s, []);
    expect(s.rogue?.stage).toBe('walking');
    expect(s.rogue?.station).not.toBe('steamer');
    expect(station(s, 'steamer').occupiedBy).toBeNull();
  });

  it('the player steps away during the wait: making starts', () => {
    let s = goRogue(quietCafe(), 'latte');
    s.players[0].pos = { x: 5, y: 2 };
    s = runUntil(s, (t) => t.rogue?.stage === 'waiting');
    for (let i = 0; i < 100; i++) s = step(s, []);
    expect(s.rogue?.stage).toBe('waiting');
    s.players[0].pos = { x: 6, y: 4 };
    s = step(s, []);
    expect(s.rogue?.stage).toBe('making');
    expect(s.rogue?.station).toBe('steamer');
    expect(station(s, 'steamer').occupiedBy).toBe(s.rogue!.customerId);
  });

  it('nothing free at decision time or after the wait: storm out', () => {
    const s0 = quietCafe();
    for (const id of RECIPE_IDS) station(s0, id).busyTicksLeft = 5000;
    let s = goRogue(s0, 'latte');
    expect(s.rogue?.stage).toBe('stormingOut');
    expect(s.rogue?.station).toBeNull();
    expect(s.log.some((e) => e.kind === 'rogue.stormed')).toBe(true);
    s = runUntil(s, (t) => t.rogue === null);
    expect(s.stations.every((st) => st.occupiedBy === null)).toBe(true);

    // After the wait: the player blocks the steamer, everything else is busy by then.
    let w = goRogue(quietCafe(), 'latte');
    w.players[0].pos = { x: 5, y: 2 };
    w = runUntil(w, (t) => t.rogue?.stage === 'waiting');
    for (const id of RECIPE_IDS) if (id !== 'steamer') station(w, id).busyTicksLeft = 5000;
    w = runUntil(w, (t) => t.rogue?.stage !== 'waiting');
    expect(w.rogue?.stage).toBe('stormingOut');
    expect(w.log.some((e) => e.kind === 'rogue.stormed')).toBe(true);
    w = runUntil(w, (t) => t.rogue === null);
  });

  it('isFreeForRogue: idle recipe stations only, with nobody in range', () => {
    const s = quietCafe();
    const from = LAYOUT.rogueStart;
    expect(isFreeForRogue(s, station(s, 'steamer'), from)).toBe(true);
    expect(isFreeForRogue(s, station(s, 'counter'), from)).toBe(false);
    expect(isFreeForRogue(s, station(s, 'trash'), from)).toBe(false);
    station(s, 'grinder').output = 'grounds';
    expect(isFreeForRogue(s, station(s, 'grinder'), from)).toBe(false);
    station(s, 'espresso').occupiedBy = 5;
    expect(isFreeForRogue(s, station(s, 'espresso'), from)).toBe(false);
    s.players[0].pos = { x: 8, y: 2 };
    expect(isFreeForRogue(s, station(s, 'coldBrewTap'), from)).toBe(false);
    s.players[0].connected = false;
    expect(isFreeForRogue(s, station(s, 'coldBrewTap'), from)).toBe(true);
  });

  it('never two rogues', () => {
    const s = goRogue(quietCafe(), 'latte');
    expect(s.rogue).not.toBeNull();
    // A state whose next serve would upset the customer, with a rogue on the floor.
    const primed = upsetServe(rogueCafe(2));
    primed.rogue = structuredClone(s.rogue);
    serveCustomer(primed, primed.customers[0], 'latte');
    expect(primed.customers[0]?.upset).toBeUndefined();
    let upset = 0;
    for (let i = 0; i < 500; i++) {
      const c = fresh();
      s.customers = [c];
      serveCustomer(s, c, 'latte');
      if (c.upset) upset++;
    }
    expect(upset).toBe(0);
  });

  it('day end with a rogue mid-make frees the station and counts once', () => {
    let s = goRogue(quietCafe(), 'latte');
    s = runUntil(s, (t) => t.rogue?.stage === 'making');
    finishDay(s);
    expect(station(s, 'steamer').occupiedBy).toBeNull();
    expect(s.rogue).toBeNull();
    expect(s.days.at(-1)!.lost).toBe(1);
    expect(s.days.at(-1)!.rogues).toBe(1);
  });

  it('rogues cost reputation and a review next morning', () => {
    const base = quietCafe();
    base.reputation = 3;
    const calm = structuredClone(base);
    calm.today.rogues = 0;
    const rough = structuredClone(base);
    rough.today.rogues = 2;
    finishDay(calm);
    finishDay(rough);
    expect(calm.reputation - rough.reputation).toBeCloseTo(0.2);
    expect(rough.phase).toBe('night');
    startDay(rough);
    expect(rough.morningNotes.filter((n) => n === ROGUE_REVIEW)).toHaveLength(1);
    startDay(calm);
    expect(calm.morningNotes).not.toContain(ROGUE_REVIEW);
  });
});
