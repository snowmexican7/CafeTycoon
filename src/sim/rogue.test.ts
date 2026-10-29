import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../data/economy';
import { LAYOUT } from '../data/layout';
import { finishDay } from './closing';
import { serveCustomer, stepCustomers } from './customers';
import { ROGUE_REVIEW } from './describe';
import { findPath, nodeOf, targetNodes } from './bots/path';
import { isFreeForRogue } from './rogue';
import { createRun, startDay } from './run';
import { step } from './step';
import type { Customer, DrinkId, GameState, Player, Vec2 } from './types';

const rogueCafe = (dayNo = 2, bots = 0): GameState => {
  const s = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots } });
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
const quietCafe = (bots = 0): GameState => {
  const s = rogueCafe(2, bots);
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

/** quietCafe with one bot (bot-1); p1 parked out of everyone's way at (11,5). */
const botCafe = (): GameState => {
  const s = quietCafe(1);
  s.players.find((p) => p.id === 'p1')!.pos = { x: 11, y: 5 };
  return s;
};
const botOf = (s: GameState): Player => s.players.find((p) => p.id === 'bot-1')!;
const huge = { patienceLeft: 100000, patienceMax: 100000 };
const sameTile = (a: Vec2, b: Vec2): boolean => a.x === b.x && a.y === b.y;

describe('bots and the rogue', () => {
  it('only people block a rogue: a bot parked at the steamer neither makes it unfree nor keeps a rogue waiting', () => {
    let s = goRogue(botCafe(), 'latte');
    expect(s.rogue?.station).toBe('steamer');
    const b = botOf(s);
    b.pos = { x: 5, y: 2 }; // within interact range of the steamer
    b.bot!.reactionTicksLeft = 100000; // parked: it stands still all test
    expect(dist(b.pos, station(s, 'steamer').pos)).toBeLessThanOrEqual(ECONOMY.interactRangeTiles);
    expect(isFreeForRogue(s, station(s, 'steamer'), LAYOUT.rogueStart)).toBe(true);
    s = runUntil(s, (t) => t.rogue?.stage !== 'walking');
    expect(s.rogue?.stage).toBe('making');
    expect(s.rogue?.station).toBe('steamer');
    expect(botOf(s).pos).toEqual({ x: 5, y: 2 });
  });

  it('a bot yields to a rogue on its waypoint and paths around it', () => {
    let s = botCafe();
    s.menu.coldBrew = false; // no prepping: the bot keeps the plan it is given
    const b = botOf(s);
    b.pos = { x: 6, y: 4 };
    b.bot!.plan = [{ kind: 'use', station: 'grinder', action: 'insert' }];
    b.bot!.path = [];
    const grinder = station(s, 'grinder');
    const waypoint = findPath(s, b.pos, targetNodes(s, grinder, b.pos)[0])![0];
    // A rogue frozen by p1 at the tap, standing on the bot's next waypoint.
    s.players.find((p) => p.id === 'p1')!.pos = { x: 8, y: 2 };
    s.rogue = { customerId: 77, drink: 'coldBrew', stage: 'waiting', pos: { ...waypoint }, path: [], station: 'coldBrewTap', ticksLeft: 0, waitTicks: 0 };
    const rogueTile = nodeOf(s, waypoint);
    const start = { ...b.pos };
    s = step(s, []);
    expect(botOf(s).bot!.yields).toBe(1);
    expect(botOf(s).bot!.yieldTicksLeft).toBeGreaterThan(0);
    expect(botOf(s).pos).toEqual(start);
    s = runUntil(s, (t) => botOf(t).bot!.path.length > 0, 120);
    expect(s.rogue?.stage).toBe('waiting');
    expect(s.rogue?.pos).toEqual(waypoint);
    expect(botOf(s).bot!.path.some((n) => sameTile(n, rogueTile))).toBe(false);
    // And it gets round: closer to the grinder, never through the rogue's tile.
    const before = dist(botOf(s).pos, grinder.pos);
    for (let i = 0; i < 60; i++) {
      s = step(s, []);
      expect(botOf(s).bot!.path.some((n) => sameTile(n, rogueTile))).toBe(false);
      expect(dist(botOf(s).pos, waypoint)).toBeGreaterThan(ECONOMY.bots.yieldRadius);
    }
    expect(dist(botOf(s).pos, grinder.pos)).toBeLessThan(before);
  });

  it('a bot treats an occupied station as busy and carries on after', () => {
    let s = botCafe();
    s.menu.coldBrew = false;
    const esp = station(s, 'espresso');
    esp.busyTicksLeft = 600;
    esp.occupiedBy = 77;
    s.rogue = { customerId: 77, drink: 'espresso', stage: 'making', pos: { x: 3, y: 2 }, path: [], station: 'espresso', ticksLeft: 600, waitTicks: 0 };
    s.customers = [fresh('espresso', { id: 900, ...huge })];
    const served = s.today.served;
    let waited = false;
    const limit = 600 + ECONOMY.bots.maxWaitTicks;
    for (let i = 0; i < limit && s.customers.some((c) => c.id === 900); i++) {
      const held = botOf(s).holding;
      const occupied = station(s, 'espresso').occupiedBy !== null;
      s = step(s, []);
      const e = station(s, 'espresso');
      if (occupied && e.occupiedBy !== null) {
        // No insert while the rogue is at the machine, and the grounds stay in hand.
        if (held === 'grounds') expect(botOf(s).holding).toBe('grounds');
        expect(e.output).toBeNull();
        if (botOf(s).bot!.waitTicks > 0) waited = true;
      }
      expect(botOf(s).bot!.waitTicks).toBeLessThanOrEqual(ECONOMY.bots.maxWaitTicks);
    }
    expect(waited).toBe(true);
    expect(s.log.some((e) => e.kind === 'trash')).toBe(false);
    expect(s.customers.some((c) => c.id === 900)).toBe(false);
    expect(s.today.served).toBe(served + 1);
    expect(station(s, 'espresso').occupiedBy).toBeNull();
  });

  // Review Focus 3
  it('the only free station, a bot walking to it: no deadlock', () => {
    let s = botCafe();
    for (const id of ['grinder', 'espresso', 'steamer']) station(s, id).busyTicksLeft = 5000;
    // The bot's cold brew order first, then the customer about to go rogue for a cold brew.
    s.customers = [fresh('coldBrew', { id: 900, ...huge }), fresh('coldBrew', { upset: { ticksLeft: 1 } })];
    s = step(s, []);
    expect(s.rogue).toMatchObject({ drink: 'coldBrew', station: 'coldBrewTap', stage: 'walking' });
    expect(botOf(s).bot!.claim).toBe(900);
    // A second's hesitation: the rogue reaches the tap first, with the bot a step away and still walking to it.
    botOf(s).bot!.reactionTicksLeft = 60;
    const served = s.today.served;
    let arrived = false;
    let done = false;
    for (let i = 0; i < 1500; i++) {
      const walking = s.rogue?.stage === 'walking';
      s = step(s, []);
      const tap = station(s, 'coldBrewTap');
      if (walking && s.rogue && s.rogue.stage !== 'walking') {
        arrived = true;
        expect(dist(botOf(s).pos, tap.pos)).toBeLessThanOrEqual(ECONOMY.interactRangeTiles);
        expect(botOf(s).bot!.plan[0]).toEqual({ kind: 'use', station: 'coldBrewTap', action: 'insert' });
      }
      expect(s.rogue?.stage).not.toBe('waiting'); // a bot never holds a rogue up
      if (tap.occupiedBy !== null) expect(s.rogue).not.toBeNull();
      expect(botOf(s).bot!.waitTicks).toBeLessThanOrEqual(ECONOMY.bots.maxWaitTicks);
      if (s.rogue === null || s.rogue.stage === 'leaving' || s.rogue.stage === 'stormingOut') {
        done = true;
        break;
      }
    }
    expect(arrived).toBe(true);
    expect(done).toBe(true);
    // The bot carries on with its order once the tap is free.
    s = runUntil(s, (t) => !t.customers.some((c) => c.id === 900), 900);
    expect(s.today.served).toBe(served + 1);
    expect(station(s, 'coldBrewTap').occupiedBy).toBeNull();
  });

  it('a day with a rogue is deterministic and JSON-safe', () => {
    const script = (): GameState => {
      let s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 1 } });
      s.scenario = 'normal';
      startDay(s);
      s.day = 2; // traffic on, rogues allowed
      for (let i = 0; i < 3000; i++) {
        if (s.tick === 300) {
          expect(s.customers.length).toBeGreaterThan(0);
          s.customers[0].upset = { ticksLeft: 60 };
        }
        s = step(s, []);
      }
      return s;
    };
    const a = script();
    expect(a.today.rogues).toBe(1);
    expect(a.log.some((e) => e.kind === 'rogue.made' || e.kind === 'rogue.stormed')).toBe(true);
    expect(script()).toEqual(a);
    const round = JSON.parse(JSON.stringify(a)) as GameState;
    let x = a;
    let y = round;
    for (let i = 0; i < 300; i++) {
      x = step(x, []);
      y = step(y, []);
    }
    expect(y).toEqual(x);
  });
});
