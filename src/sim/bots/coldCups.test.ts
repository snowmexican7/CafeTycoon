import { describe, it, expect } from 'vitest';
import { createRun, startDay } from '../run';
import { step } from '../step';
import { addStandIns } from './roster';
import { afterBotInteract, dropPlan, think } from './brain';
import { TICK_RATE } from '../constants';
import type { GearId } from '../../data/gear';
import type { BotStep, Customer, DrinkId, GameState, PassItem, SupplyId } from '../types';
import { stationsFromSlots } from '../slots';

// Feedback 2 A2: bots and cold cups (src/sim/cooling.ts).
const secs = (n: number) => Math.round(n * TICK_RATE);
const idle = [] as Parameters<typeof step>[1];
const atPickup = (id: number, drink: DrinkId, rungAt: number, more: Partial<Customer> = {}): Customer => ({
  id, drink, patienceLeft: 900, patienceMax: 1800, stage: 'pickup', rungAt, ...more,
});
const cup = (item: DrinkId, madeAt?: number): PassItem => ({ item, ticksLeft: 99999, by: 'p1', ...(madeAt !== undefined ? { madeAt } : {}) });
function quiet(s: GameState): GameState {
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  s.eventSchedule = [];
  s.events = [];
  s.customers = [];
  return s;
}

describe('bots and cold cups', () => {
  function botStand(): GameState {
    let s = createRun({ seed: 101, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 150 }, tier: 'stand', gear: true });
    addStandIns(s, 1);
    for (const g of ['c1', 'e1'] as GearId[]) s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: g }]);
    s.supplies.beans = 40;
    s.supplies.milk = 40;
    s = quiet(startDay(s));
    s.players[0].pos = { x: 10, y: 5 };
    return s;
  }
  const bot = (s: GameState) => s.players.find((p) => p.id === 'sim-1')!;

  it('an idle bot takes a cold cup back off the counter and bins it', () => {
    let s = botStand();
    s.pass = [cup('latte', s.tick - secs(70)), cup('icedLatte', s.tick - secs(20))];
    // FB2 A3: on the stand the back sink (7,4) is nearer the counter than the bin (7,1), so the cup goes down the sink.
    expect(think(s, bot(s))).toEqual([{ kind: 'use', station: 'pickup', action: 'take' }, { kind: 'use', station: 'sink', action: 'dump' }]);
    for (let i = 0; i < secs(20) && s.pass.length > 1; i++) s = step(s, idle);
    expect(s.pass.map((i) => i.item)).toEqual(['icedLatte']);
    for (let i = 0; i < secs(20) && bot(s).holding !== null; i++) s = step(s, idle);
    expect(bot(s).holding).toBeNull();
    expect(s.today.wasted).toBeGreaterThanOrEqual(1);
  });

  it('an older iced cup does not hide a cold one from an idle bot (review M1)', () => {
    let s = botStand();
    s.pass = [cup('icedLatte', s.tick - secs(150)), cup('latte', s.tick - secs(70))];
    expect(think(s, bot(s))[0]).toEqual({ kind: 'use', station: 'pickup', action: 'take' });
    for (let i = 0; i < secs(20) && s.pass.length > 1; i++) s = step(s, idle);
    expect(s.pass.map((i) => i.item)).toEqual(['icedLatte']);
    expect(bot(s).holding).toBe('latte');
  });

  it('a cold cup on the counter is cleared before the bot rings up a customer for it (review I1)', () => {
    let s = botStand();
    s.pass = [cup('espresso', s.tick - secs(50))];
    s.customers = [{ id: 1, drink: 'espresso', patienceLeft: 1e5, patienceMax: 1e5, stage: 'order' }];
    expect(think(s, bot(s))).toEqual([{ kind: 'use', station: 'pickup', action: 'take' }, { kind: 'use', station: 'sink', action: 'dump' }]); // FB2 A3: the nearer sink
    const kinds: string[] = [];
    for (let i = 0; i < secs(40) && !kinds.includes('till.rung'); i++) {
      s = step(s, idle);
      for (const e of s.log) if (e.tick === s.tick) kinds.push(e.kind);
    }
    expect(kinds).toContain('till.rung');
    expect(kinds.indexOf('pickup.takeBack')).toBeLessThan(kinds.indexOf('till.rung'));
    expect(kinds).not.toContain('pickup.cold');
    expect(s.pass).toHaveLength(0);
  });

  it('a pickup take that came up warm (someone cleared the cold cup first) puts the cup back, not in the bin (review M5)', () => {
    const s = botStand();
    const p = bot(s);
    const counter = s.stations.find((x) => x.id === 'pickup')!;
    p.pos = { ...counter.pos };
    p.holding = 'latte';
    p.heldSince = s.tick - secs(10);
    p.bot!.plan = [{ kind: 'use', station: 'trash', action: 'trash' }];
    afterBotInteract(s, p, null);
    expect(p.bot!.plan).toEqual([{ kind: 'use', station: 'pickup', action: 'put' }]);
    // A cold one keeps its bin step.
    p.heldSince = s.tick - secs(70);
    p.bot!.plan = [{ kind: 'use', station: 'trash', action: 'trash' }];
    afterBotInteract(s, p, null);
    expect(p.bot!.plan).toEqual([{ kind: 'use', station: 'trash', action: 'trash' }]);
  });

  it('a bot leaves a counter alone when the oldest cup is still warm', () => {
    const s = botStand();
    s.pass = [cup('latte', s.tick - secs(20))];
    expect(think(s, bot(s)).some((x) => x.kind === 'use' && x.station === 'pickup')).toBe(false);
  });

  it('a bot never sets down a cold cup; a warm one goes on the counter', () => {
    const s = botStand();
    const p = bot(s);
    p.holding = 'latte';
    p.heldSince = s.tick - secs(61);
    s.customers = [atPickup(1, 'latte', s.tick)];
    const bin = s.stations.find((x) => x.kind === 'trash')!.pos;
    p.pos = { x: bin.x - 0.4, y: bin.y + 0.9 }; // FB2 A3: by the bin (a nearer back sink would take it instead)
    expect(think(s, p)).toEqual([{ kind: 'use', station: 'trash', action: 'trash' }]);
    expect(dropPlan(s, p)).toEqual([{ kind: 'use', station: 'trash', action: 'trash' }]);
    p.heldSince = s.tick;
    expect(think(s, p)).toEqual([{ kind: 'use', station: 'pickup', action: 'put' }]);
    expect(dropPlan(s, p)).toEqual([{ kind: 'use', station: 'pickup', action: 'put' }]);
  });

  it('a claiming bot whose cup went cold in hand bins it and remakes instead of putting it down', () => {
    let s = botStand();
    const p = bot(s);
    const counter = s.stations.find((x) => x.id === 'pickup')!;
    p.pos = { x: counter.pos.x, y: counter.pos.y + 1 };
    s.customers = [atPickup(1, 'espresso', s.tick)];
    p.holding = 'espresso';
    p.heldSince = s.tick - secs(50);
    p.bot!.claim = 1;
    p.bot!.claimDrink = 'espresso';
    p.bot!.plan = [{ kind: 'use', station: 'pickup', action: 'put' }];
    p.bot!.thinkTicksLeft = 99;
    // FB2 A3: the cold cup goes to the bin or the back sink, whichever is nearer (here the sink).
    const discards = [{ kind: 'use', station: 'trash', action: 'trash' }, { kind: 'use', station: 'sink', action: 'dump' }];
    const trashFirst = (x: GameState) => {
      const st = bot(x).bot!.plan[0];
      return st?.kind === 'use' && (st.station === 'trash' || st.station === 'sink');
    };
    for (let i = 0; i < secs(10) && s.pass.length === 0 && !trashFirst(s); i++) s = step(s, idle);
    expect(s.pass).toHaveLength(0);
    expect(discards).toContainEqual(bot(s).bot!.plan[0]);
    expect(bot(s).bot!.plan.length).toBeGreaterThan(1);
  });
});

describe('cold cups with FB2 A1 helper bots', () => {
  /** A Gear stand with one person (p1) at the till and one crew bot (a helper). */
  function helperStand(): GameState {
    let s = createRun({ seed: 101, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 1, dayLengthSec: 150 }, tier: 'stand', gear: true });
    for (const g of ['c1', 'e1'] as GearId[]) s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: g }]);
    s.supplies.beans = 40;
    s.supplies.milk = 40;
    s = quiet(startDay(s));
    const till = s.stations.find((x) => x.id === 'counter')!;
    s.players[0].pos = { x: till.pos.x, y: till.pos.y - 1 };
    return s;
  }
  const helper = (s: GameState) => s.players.find((p) => p.id === 'bot-1')!;

  it('a helper still clears a cold counter cup first while the person holds the till, and the person rings no one into it', () => {
    let s = helperStand();
    s.pass = [cup('espresso', s.tick - secs(50))];
    s.customers = [{ id: 1, drink: 'espresso', patienceLeft: 1e5, patienceMax: 1e5, stage: 'order' }];
    expect(think(s, helper(s))).toEqual([{ kind: 'use', station: 'pickup', action: 'take' }, { kind: 'use', station: 'sink', action: 'dump' }]); // FB2 A3: the nearer sink
    const kinds: string[] = [];
    for (let i = 0; i < secs(20) && !kinds.includes('pickup.takeBack'); i++) {
      s = step(s, idle);
      for (const e of s.log) if (e.tick === s.tick) kinds.push(e.kind);
    }
    expect(kinds).toContain('pickup.takeBack');
    expect(kinds).not.toContain('till.rung'); // the helper leaves the till to the person
    s = step(s, [{ kind: 'move', playerId: 'p1', x: 0, y: 0, interact: true }]); // the person rings the espresso order
    expect(s.log.some((e) => e.kind === 'till.rung')).toBe(true);
    expect(s.log.some((e) => e.kind === 'pickup.cold')).toBe(false);
  });
});

describe('A2 fix round 2: a cold or orphaned machine output never makes a bot wait', () => {
  /** A café bar set by hand (grinder, Brevelle E2, steamer, bin), `n` stand-ins, no walk-ins, p1 parked out of the way. */
  function bar(n = 1): GameState {
    let s = createRun({ seed: 2, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 600 }, gear: true });
    s.slots = ['grinder', 'espresso', 'steamer', 'trash', null, null];
    s.slotGear = ['g2', 'e2', 's3', 'b0', null, null];
    s.stations = stationsFromSlots('cafe', s.slots, s.slotGear);
    for (const k of Object.keys(s.supplies) as SupplyId[]) s.supplies[k] = 99;
    addStandIns(s, n);
    s = quiet(startDay(s));
    s.players[0].pos = { x: 10, y: 5 };
    s.milkOut = 99; // FB2 A4: plenty of milk out at the bar
    return s;
  }
  const sim = (s: GameState, n = 1) => s.players.find((p) => p.id === `sim-${n}`)!;
  const station = (s: GameState, kind: string) => s.stations.find((x) => x.kind === kind)!;
  const order = (id: number, drink: DrinkId): Customer => ({ id, drink, patienceLeft: 1e5, patienceMax: 1e5, stage: 'pickup', rungAt: 0 });
  const steps = (plan: BotStep[]) => plan.map((x) => (x.kind === 'use' ? `${x.station}:${x.action}` : x.kind));

  it('a bot that comes for its own cup and finds it cold bins it and remakes', () => {
    let s = bar();
    const e = station(s, 'espresso');
    e.output = 'espresso';
    e.outputSince = s.tick - secs(50);
    s.customers = [order(1, 'espresso')];
    const q = sim(s);
    q.bot!.claim = 1;
    q.bot!.claimDrink = 'espresso';
    q.bot!.plan = [{ kind: 'use', station: e.id, action: 'take' }, { kind: 'use', station: 'pickup', action: 'put' }];
    q.bot!.thinkTicksLeft = 999;
    for (let i = 0; i < secs(15) && sim(s).holding === null; i++) s = step(s, idle);
    expect(sim(s).holding).toBe('espresso');
    expect(steps(sim(s).bot!.plan)[0]).toBe('trash:trash');
    expect(sim(s).bot!.claim).toBe(1);
    const kinds: string[] = [];
    for (let i = 0; i < secs(60) && s.customers.length > 0; i++) {
      s = step(s, idle);
      for (const x of s.log) if (x.tick === s.tick) kinds.push(x.kind);
    }
    expect(s.customers).toHaveLength(0);
    expect(kinds).not.toContain('pickup.cold');
    expect(kinds.indexOf('trash')).toBeLessThan(kinds.indexOf('pickup.take'));
  });

  it('a bot with grounds at a machine blocked by a cold shot does not wait it out', () => {
    let s = bar();
    const e = station(s, 'espresso');
    e.output = 'espresso';
    e.outputSince = s.tick - secs(50);
    s.customers = [order(1, 'latte')];
    const p = sim(s);
    p.bot!.claim = 1;
    p.bot!.claimDrink = 'latte';
    p.holding = 'grounds';
    p.bot!.plan = [{ kind: 'use', station: e.id, action: 'insert', makes: 'espresso' }, { kind: 'use', station: e.id, action: 'take' }, { kind: 'use', station: 'pickup', action: 'put' }];
    p.bot!.thinkTicksLeft = 0;
    let cleared = -1;
    for (let i = 0; i < secs(60) && s.customers.length > 0; i++) {
      s = step(s, idle);
      if (cleared < 0 && s.stations.find((x) => x.id === e.id)!.output !== 'espresso') cleared = i;
    }
    // Well under the 15 s wait cap (walk there, give the grounds up, take the cold shot).
    expect(cleared).toBeGreaterThanOrEqual(0);
    expect(cleared).toBeLessThan(secs(10));
    expect(s.customers).toHaveLength(0);
    expect(s.log.some((x) => x.kind === 'pickup.cold')).toBe(false);
  });

  it('empty hands at a machine blocked by a stray warm cup nobody is coming for take it, park it and carry on', () => {
    let s = bar();
    const st = station(s, 'steamer');
    st.output = 'latte';
    st.outputSince = s.tick;
    s.customers = [order(1, 'mocha')];
    const p = sim(s);
    p.holding = null;
    p.bot!.plan = [{ kind: 'use', station: st.id, action: 'insert', makes: 'matcha' }];
    p.bot!.thinkTicksLeft = 999;
    for (let i = 0; i < secs(15) && sim(s).holding === null; i++) s = step(s, idle);
    expect(sim(s).holding).toBe('latte');
    expect(steps(sim(s).bot!.plan)).toEqual(['pickup:put', `${st.id}:insert`]);
  });

  it('a free bot clears a stray output that blocks another bot at once (no 15 s grace)', () => {
    const s = bar(2);
    const e = station(s, 'espresso');
    e.output = 'espresso';
    e.outputSince = s.tick - secs(2);
    const a = sim(s, 1);
    a.holding = 'grounds';
    a.bot!.plan = [{ kind: 'use', station: e.id, action: 'insert', makes: 'espresso' }, { kind: 'use', station: e.id, action: 'take' }];
    expect(think(s, sim(s, 2))).toEqual([{ kind: 'use', station: e.id, action: 'take' }]);
    // Nobody waiting on it: the stray shot gets its grace.
    a.bot!.plan = [];
    expect(think(s, sim(s, 2))).not.toEqual([{ kind: 'use', station: e.id, action: 'take' }]);
  });

  it('a bot holding a cold cup at a blocked machine bins it and remakes instead of waiting', () => {
    let s = bar();
    const st = station(s, 'steamer');
    st.output = 'latte';
    st.outputSince = s.tick;
    st.occupiedBy = null;
    s.customers = [order(1, 'latte')];
    const p = sim(s);
    p.holding = 'espresso';
    p.heldSince = s.tick - secs(60);
    p.bot!.claim = 1;
    p.bot!.claimDrink = 'latte';
    p.bot!.plan = [{ kind: 'use', station: st.id, action: 'insert', makes: 'latte' }, { kind: 'use', station: st.id, action: 'take' }, { kind: 'use', station: 'pickup', action: 'put' }];
    p.bot!.thinkTicksLeft = 999;
    let binFirst = false;
    for (let i = 0; i < secs(8) && !binFirst; i++) {
      s = step(s, idle);
      const first = sim(s).bot!.plan[0];
      binFirst = first?.kind === 'use' && first.station === 'trash';
    }
    expect(binFirst).toBe(true);
    expect(sim(s).bot!.claim).toBe(1);
    expect(sim(s).bot!.plan.length).toBeGreaterThan(1);
  });
});
