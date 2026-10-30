import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { stationsFromSlots } from './slots';
import { stepPass } from './pass';
import { stepPickup } from './pickup';
import { COOLING_SECONDS, LUKEWARM, coolFraction, stationCool, stepCooling, takeBackCold, takeBackIndex } from './cooling';
import { finishDay } from './closing';
import { TICK_RATE } from './constants';
import { GEAR, type GearId } from '../data/gear';
import { DRINK_IDS, DRINK_TEMP } from '../data/drinks';
import type { Customer, DrinkId, GameState, PassItem, PlayerInput, SupplyId } from './types';

function gearDay(gear: GearId[] = ['c1', 'e1'], supplies: Partial<Record<SupplyId, number>> = {}): GameState {
  const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear: true });
  const slots = [...s.slots!];
  const slotGear = [...s.slotGear!];
  gear.forEach((id, i) => {
    slots[i] = GEAR[id].station;
    slotGear[i] = id;
  });
  s.slots = slots;
  s.slotGear = slotGear;
  s.stations = stationsFromSlots(s.tier, slots, slotGear);
  const out = startDay(s);
  for (const [k, v] of Object.entries(supplies)) out.supplies[k as SupplyId] = v;
  return out;
}

/** No walk-ins and no events: only what the test sets up happens. */
function quiet(s: GameState): GameState {
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  s.eventSchedule = [];
  s.events = [];
  s.customers = [];
  return s;
}

const secs = (n: number) => Math.round(n * TICK_RATE);
const use: PlayerInput[] = [{ kind: 'move', playerId: 'p1', x: 0, y: 0, interact: true }];
const drop: PlayerInput[] = [{ kind: 'drop', playerId: 'p1' }];
const idle: PlayerInput[] = [];
function stand(s: GameState, id: string): void {
  const st = s.stations.find((x) => x.id === id)!;
  s.players[0].pos = { ...st.pos };
}
const atPickup = (id: number, drink: DrinkId, rungAt: number, more: Partial<Customer> = {}): Customer => ({
  id, drink, patienceLeft: 900, patienceMax: 1800, stage: 'pickup', rungAt, ...more,
});
const cup = (item: DrinkId, madeAt?: number, more: Partial<PassItem> = {}): PassItem => ({
  item, ticksLeft: 99999, by: 'p1', ...(madeAt !== undefined ? { madeAt } : {}), ...more,
});
const logOf = (s: GameState, kind: string) => s.log.filter((e) => e.kind === kind).map((e) => e.data);

describe('coolFraction (A2: cups go cold)', () => {
  it('runs 0 at the made tick, 0.5 halfway, 1 at the end and stays 1', () => {
    const s = gearDay();
    const t = s.tick;
    expect(COOLING_SECONDS.latte).toBe(60);
    expect(coolFraction(s, t, 'latte')).toBe(0);
    expect(coolFraction(s, t - secs(30), 'latte')).toBe(0.5);
    expect(coolFraction(s, t - secs(60), 'latte')).toBe(1);
    expect(coolFraction(s, t - secs(600), 'latte')).toBe(1);
    expect(coolFraction(s, t - secs(45), 'espresso')).toBe(1);
    expect(coolFraction(s, t - secs(22.5), 'doppio')).toBe(0.5);
    expect(LUKEWARM).toBe(0.5);
  });

  it('iced drinks never cool; hot ones all do', () => {
    const s = gearDay();
    for (const d of DRINK_IDS) {
      const f = coolFraction(s, s.tick - secs(1000), d);
      expect(f).toBe(DRINK_TEMP[d] === 'iced' ? 0 : 1);
    }
    expect(coolFraction(s, s.tick - secs(1000), 'icedLatte')).toBe(0);
    expect(coolFraction(s, s.tick - secs(1000), 'grounds')).toBe(0);
  });

  it('an unknown made tick is fresh, and classic runs never cool', () => {
    const s = gearDay();
    expect(coolFraction(s, undefined, 'latte')).toBe(0);
    const c = startDay(createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } }));
    expect(coolFraction(c, c.tick - secs(600), 'latte')).toBe(0);
  });
});

describe('cold and lukewarm cups at pickup', () => {
  it('a latte that sat 61 s on the counter: taken, not paid, a bad review, customer gone', () => {
    let s = quiet(gearDay());
    s.pass = [cup('latte', s.tick)];
    for (let i = 0; i < secs(61); i++) s = step(s, idle);
    expect(s.pass).toHaveLength(1); // a hot cup on the counter cools; it no longer goes stale and vanishes
    s.customers = [atPickup(1, 'latte', s.tick - secs(5))];
    const cash = s.cash;
    const lost = s.today.lost;
    stepPickup(s);
    expect(s.cash).toBe(cash);
    expect(s.customers).toHaveLength(0);
    expect(s.pass).toHaveLength(0);
    expect([s.today.served, s.today.lost]).toEqual([0, lost + 1]);
    expect(logOf(s, 'pickup.cold')).toEqual([{ customer: 1, drink: 'latte' }]);
    expect(logOf(s, 'review.bad')).toEqual([{ customer: 1, drink: 'latte', reason: 'cold' }]);
    expect(logOf(s, 'pickup.take')).toEqual([]);
    expect(logOf(s, 'served')).toEqual([]);
  });

  it('a cold cup for a group: the whole party walks out (every drink owed is lost)', () => {
    const s = quiet(gearDay());
    s.customers = [atPickup(1, 'latte', s.tick, { kind: 'group', extra: ['drip'] })];
    s.pass = [cup('latte', s.tick - secs(70))];
    stepPickup(s);
    expect([s.customers.length, s.today.lost, s.today.served]).toEqual([0, 2, 0]);
  });

  it('a lukewarm cup is paid, with the tip halved (same seed); an off cup is not halved twice', () => {
    const run = (madeAgo: number, temp = false): GameState => {
      const s = quiet(gearDay());
      s.customers = [atPickup(1, 'latte', s.tick - secs(200))];
      s.pass = [cup('latte', s.tick - secs(madeAgo), temp ? { temp: true } : {})];
      stepPickup(s);
      return s;
    };
    const fresh = run(0);
    const luke = run(35);
    const offLuke = run(35, true);
    const off = run(0, true);
    expect(fresh.today.tips).toBeGreaterThan(0);
    expect([luke.today.served, luke.today.sales]).toEqual([1, fresh.today.sales]);
    expect(luke.today.tips).toBe(Math.round((fresh.today.tips / 2) * 100) / 100);
    expect(offLuke.today.tips).toBe(luke.today.tips);
    expect(off.today.tips).toBe(luke.today.tips);
    // Just under halfway is still full tip.
    expect(run(29).today.tips).toBe(fresh.today.tips);
  });

  it('with two matching cups the customer takes the fresher', () => {
    const s = quiet(gearDay());
    const t = s.tick;
    s.customers = [atPickup(1, 'latte', t)];
    s.pass = [cup('latte', t - secs(40)), cup('drip', t - secs(2)), cup('latte', t - secs(5))];
    stepPickup(s);
    expect(s.today.served).toBe(1);
    expect(s.pass.map((i) => [i.item, i.madeAt])).toEqual([['latte', t - secs(40)], ['drip', t - secs(2)]]);
  });

  it('an iced latte never cools: an hour on the counter and still paid in full', () => {
    const s = quiet(gearDay());
    s.customers = [atPickup(1, 'icedLatte', s.tick - secs(200))];
    s.pass = [cup('icedLatte', s.tick - secs(3600))];
    stepPickup(s);
    expect([s.today.served, s.today.lost]).toEqual([1, 0]);
    expect(logOf(s, 'pickup.cold')).toEqual([]);
  });
});

describe('the counter: take-back, staleness and the clock following the cup', () => {
  it('empty hands at pickup take back the coldest cup (an older iced one waits), carrying its clock', () => {
    let s = quiet(gearDay());
    const t = s.tick;
    s.pass = [cup('icedLatte', t - secs(150)), cup('drip', t - secs(10)), cup('latte', t - secs(70)), cup('mocha', t - secs(70))];
    stand(s, 'pickup');
    s = step(s, use);
    expect(s.players[0].holding).toBe('latte');
    expect(s.players[0].heldSince).toBe(t - secs(70));
    expect(s.pass.map((i) => i.item)).toEqual(['icedLatte', 'drip', 'mocha']);
    expect(logOf(s, 'pickup.takeBack')).toEqual([{ drink: 'latte', by: 'p1', cold: true }]);
    // Set it back down: same clock.
    s = step(s, use);
    expect(s.pass.find((i) => i.item === 'latte')?.madeAt).toBe(t - secs(70));
    expect(s.players[0].heldSince).toBeUndefined();
  });

  it('a hot cup without a made tick (old saves) and iced cups still go stale; a cooling cup does not', () => {
    const s = quiet(gearDay());
    s.pass = [
      { item: 'drip', ticksLeft: 1, by: 'p1' },
      { item: 'coldBrew', ticksLeft: 1, by: 'p1', madeAt: s.tick },
      { item: 'latte', ticksLeft: 1, by: 'p1', madeAt: s.tick },
    ];
    stepPass(s);
    expect(s.pass.map((i) => i.item)).toEqual(['latte']);
    expect(s.today.wasted).toBe(2);
  });

  it('the clock follows the cup: a shot made at T, carried, set down has madeAt T', () => {
    let s = quiet(gearDay());
    const machine = s.stations.find((x) => x.kind === 'espresso')!;
    const t = s.tick - secs(3);
    machine.output = 'espresso';
    machine.outputSince = t;
    machine.doneAt = t;
    stand(s, machine.id);
    s = step(s, use);
    expect([s.players[0].holding, s.players[0].heldSince]).toEqual(['espresso', t]);
    for (let i = 0; i < 10; i++) s = step(s, idle);
    expect(s.players[0].heldSince).toBe(t);
    stand(s, 'pickup');
    s = step(s, use);
    expect(s.pass[0].madeAt).toBe(t);
    // An R-drop on the counter carries it too; a cup with no known clock starts it on the counter.
    s.players[0].holding = 'latte';
    s.players[0].heldSince = t - secs(20);
    s = step(s, drop);
    expect(s.pass[1].madeAt).toBe(t - secs(20));
    s.players[0].holding = 'drip';
    s = step(s, drop);
    expect(s.pass[2].madeAt).toBe(s.tick);
  });

  it('a finished machine starts the clock; empty hands drop the held clock', () => {
    let s = quiet(gearDay(['c1', 'e1'], { beans: 9, milk: 9 }));
    const machine = s.stations.find((x) => x.kind === 'espresso')!;
    stand(s, machine.id);
    s = step(s, use); // the pod machine starts a shot from empty hands
    let guard = 0;
    while (s.stations.find((x) => x.id === machine.id)!.output === null && guard++ < secs(30)) s = step(s, idle);
    const done = s.stations.find((x) => x.id === machine.id)!;
    expect(done.output).toBe('espresso');
    expect(stationCool(s, done)).toBe(0);
    const made = done.outputSince!;
    s = step(s, use);
    expect(s.players[0].heldSince).toBe(made);
    s.players[0].holding = null;
    s = step(s, idle);
    expect(s.players[0].heldSince).toBeUndefined();
  });

  it('takeBackIndex: cooling cups first, coldest first, then smallest madeAt, then the stalest timer, then slot', () => {
    const s = quiet(gearDay());
    const t = s.tick;
    // An older iced cup never hides a cold one (review M1).
    s.pass = [cup('icedLatte', t - secs(200)), cup('drip', t - secs(40)), cup('latte', t - secs(70)), cup('mocha', t - secs(70))];
    expect([takeBackIndex(s), takeBackCold(s)]).toEqual([2, true]);
    // Two cold cups: the one made first.
    s.pass = [cup('latte', t - secs(70)), cup('espresso', t - secs(100))];
    expect(takeBackIndex(s)).toBe(1);
    // Warm cups: the coolest, ahead of an older iced cup; nothing cold yet.
    s.pass = [cup('icedLatte', t - secs(200)), cup('drip', t - secs(10)), cup('latte', t - secs(40))];
    expect([takeBackIndex(s), takeBackCold(s)]).toEqual([2, false]);
    // No cooling cups: smallest madeAt, unknown = fresh, then the stalest timer, then slot.
    s.pass = [cup('drip'), cup('coldBrew', 50), cup('icedLatte', 50), cup('coldBrew', 80)];
    expect(takeBackIndex(s)).toBe(1);
    s.pass = [cup('drip'), cup('latte', undefined, { ticksLeft: 10 })];
    expect(takeBackIndex(s)).toBe(1);
    s.pass = [cup('drip'), cup('latte')];
    expect(takeBackIndex(s)).toBe(0);
    s.pass = [];
    expect([takeBackIndex(s), takeBackCold(s)]).toEqual([-1, false]);
  });

  it('the clock starts now on a pot pour, a tap pour and an early pull', () => {
    let s = quiet(gearDay(['c1', 'e1', 'd2'], { beans: 9, milk: 9 }));
    const pot = s.stations.find((x) => x.kind === 'drip')!;
    pot.output = 'drip';
    pot.outputSince = s.tick - secs(30);
    pot.potLeft = 4;
    stand(s, pot.id);
    s = step(s, use);
    expect([s.players[0].holding, s.players[0].heldSince]).toEqual(['drip', s.tick]);
    s.players[0].holding = null;
    const tap = s.stations.find((x) => x.kind === 'coldBrewTap')!;
    tap.batchLeft = 5;
    stand(s, tap.id);
    s = step(s, use);
    expect([s.players[0].holding, s.players[0].heldSince]).toEqual(['coldBrew', s.tick]);
    s.players[0].holding = null;
    const shot = s.stations.find((x) => x.kind === 'espresso')!;
    Object.assign(shot, { making: 'espresso', busyTicksLeft: 5, busyTotal: 300 });
    stand(s, shot.id);
    s.players[0].heldSince = 1; // a leftover clock must not carry over
    s = step(s, use);
    expect([s.players[0].holding, s.players[0].heldSince]).toEqual(['espresso', s.tick]);
  });

  it('an R-drop onto an idle machine carries the cup clock', () => {
    let s = quiet(gearDay(['c1', 'e1', 's1'], { beans: 9, milk: 9 }));
    const steamer = s.stations.find((x) => x.kind === 'steamer')!;
    stand(s, steamer.id);
    s.players[0].holding = 'latte';
    s.players[0].heldSince = s.tick - secs(25);
    const t = s.players[0].heldSince;
    s = step(s, drop);
    const after = s.stations.find((x) => x.id === steamer.id)!;
    expect([after.output, after.outputSince]).toEqual(['latte', t]);
  });

  it('closing clears the held clock with the hands', () => {
    const s = quiet(gearDay());
    s.players[0].holding = 'latte';
    s.players[0].heldSince = s.tick - 5;
    finishDay(s);
    expect([s.players[0].holding, s.players[0].heldSince]).toEqual([null, undefined]);
  });
});

describe('cup.cold', () => {
  it('fires once per counter cup and once per machine output, when it crosses to cold', () => {
    let s = quiet(gearDay());
    const machine = s.stations.find((x) => x.kind === 'espresso')!;
    machine.output = 'espresso';
    machine.outputSince = s.tick - secs(45) + 5;
    s.pass = [cup('latte', s.tick - secs(60) + 3), cup('icedLatte', s.tick - secs(600)), cup('drip', s.tick - secs(600))];
    const seen: Record<string, string | number | boolean>[] = [];
    for (let i = 0; i < 40; i++) {
      s = step(s, idle);
      for (const e of s.log) if (e.kind === 'cup.cold' && e.tick === s.tick) seen.push(e.data);
    }
    expect(seen).toEqual([{ slot: 0, drink: 'latte' }, { station: machine.id, drink: 'espresso' }]);
    expect(stationCool(s, s.stations.find((x) => x.id === machine.id)!)).toBe(1);
  });

  it('fires once for a drip pot when it goes cold on the hot plate', () => {
    let s = quiet(gearDay(['c1', 'e1', 'd2']));
    const pot = s.stations.find((x) => x.kind === 'drip')!;
    Object.assign(pot, { output: 'drip', outputSince: s.tick - secs(50), potLeft: 6, potColdAt: s.tick + 5 });
    const seen: Record<string, string | number | boolean>[] = [];
    for (let i = 0; i < 20; i++) {
      s = step(s, idle);
      for (const e of s.log) if (e.kind === 'cup.cold' && e.tick === s.tick) seen.push(e.data);
    }
    expect(seen).toEqual([{ station: pot.id, drink: 'drip' }]);
    expect(stationCool(s, s.stations.find((x) => x.id === pot.id)!)).toBe(1);
  });

  it('stepCooling does nothing in a classic run', () => {
    const c = startDay(createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } }));
    c.pass = [{ item: 'latte', ticksLeft: 999, madeAt: c.tick - secs(60) }];
    c.players[0].heldSince = 5;
    const before = structuredClone(c);
    stepCooling(c);
    expect(c).toEqual(before);
  });
});
