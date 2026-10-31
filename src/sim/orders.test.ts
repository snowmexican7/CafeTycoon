import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { stationsFromSlots } from './slots';
import { addCustomer, stepCustomers } from './customers';
import { stepPickup, wantsDrink } from './pickup';
import { finishDay } from './closing';
import { enterClosing } from './step';
import { ORDERS, isEspressoBar, makeTicket, officeMorning, stepOffice } from './orders';
import { secondsToTicks, TICK_RATE } from './constants';
import { ECONOMY } from '../data/economy';
import { GEAR, type GearId } from '../data/gear';
import { COOLING_SECONDS } from './cooling';
import type { Customer, DrinkId, GameState, SupplyId, TierId } from './types';

function gearDay(day = 2, tier: TierId = 'stand', gear: GearId[] = ['c1', 'e1', 's1', 'd1'], seed = 7): GameState {
  const s = createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier, gear: true });
  {
    const slots = [...s.slots!];
    const slotGear = [...s.slotGear!];
    gear.forEach((id, i) => {
      slots[i] = GEAR[id].station;
      slotGear[i] = id;
    });
    s.slots = slots;
    s.slotGear = slotGear;
    s.stations = stationsFromSlots(s.tier, slots, slotGear);
  }
  s.day = day;
  const out = startDay(s);
  for (const k of ['beans', 'milk', 'concentrate'] as SupplyId[]) out.supplies[k] = 99;
  return out;
}

const put = (s: GameState, drink: DrinkId, more: Partial<GameState['pass'][number]> = {}) =>
  s.pass.push({ item: drink, ticksLeft: ECONOMY.pass.staleSeconds[drink] * TICK_RATE, by: 'p1', ...more });

/** A rung-up multi-drink ticket at pickup. */
function ticket(s: GameState, drinks: DrinkId[], more: Partial<Customer> = {}): Customer {
  const c: Customer = { id: 50, drink: drinks[0], patienceLeft: 900, patienceMax: 1800, stage: 'pickup', rungAt: s.tick, ...more };
  makeTicket(c, drinks);
  s.customers.push(c);
  return c;
}

const events = (s: GameState, kind: string) => s.log.filter((e) => e.kind === kind).map((e) => e.data);

describe('combos (FB2 B6)', () => {
  it('about one walk-in in eight from day 2 orders two drinks: a pair, or an espresso drink and a drip, with ×1.3 patience', () => {
    const s = gearDay(2);
    let combos = 0;
    let singles = 0;
    for (let i = 0; i < 400; i++) {
      s.customers = [];
      s.log = [];
      const c = addCustomer(s, 'normal')!;
      if (c.order !== 'combo') {
        singles += 1;
        expect(c.items).toBeUndefined();
        continue;
      }
      combos += 1;
      expect(c.items!.map((x) => x.done)).toEqual([false, false]);
      const [a, b] = c.items!.map((x) => x.drink);
      expect(a === b || (isEspressoBar(a) && b === 'drip') || (a === 'drip' && isEspressoBar(b))).toBe(true);
      expect(events(s, 'order.combo')).toEqual([{ customer: c.id, items: `${a},${b}` }]);
    }
    expect(combos + singles).toBe(400);
    expect(combos / 400).toBeGreaterThan(0.07);
    expect(combos / 400).toBeLessThan(0.18);
  });

  it('the combo ticket waits 1.3× as long as the same drinks would alone', () => {
    const s = gearDay(2);
    let combo: Customer | null = null;
    for (let i = 0; i < 400 && !combo; i++) {
      s.customers = [];
      const c = addCustomer(s, 'normal')!;
      if (c.order === 'combo' && c.items![0].drink === c.items![1].drink) combo = c;
    }
    expect(combo).not.toBeNull();
    let single: Customer | null = null;
    for (let i = 0; i < 400 && !single; i++) {
      s.customers = [];
      const c = addCustomer(s, 'normal')!;
      if (!c.order && c.drink === combo!.drink && !c.sig) single = c;
    }
    expect(single).not.toBeNull();
    expect(combo!.patienceMax / single!.patienceMax).toBeCloseTo(ORDERS.combo.patience, 2);
  });

  it('none on day 1, none in classic runs', () => {
    const d1 = gearDay(1);
    const classic = startDay(createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } }));
    classic.day = 4;
    for (let i = 0; i < 300; i++) {
      for (const s of [d1, classic]) {
        s.customers = [];
        const c = addCustomer(s, 'normal')!;
        expect([c.items, c.order]).toEqual([undefined, undefined]);
      }
    }
  });

  it('taking one cup marks it done and pays nothing; the second pays both and logs order.done', () => {
    const s = gearDay(2);
    const c = ticket(s, ['latte', 'drip'], { order: 'combo' });
    const cash = s.cash;
    put(s, 'drip');
    stepPickup(s);
    expect(c.items!.map((x) => x.done)).toEqual([false, true]);
    expect([s.cash, s.today.served, s.today.sales, s.customers.length]).toEqual([cash, 0, 0, 1]);
    expect(c.drink).toBe('latte');
    expect(wantsDrink(c, 'drip')).toBe(false);
    expect(wantsDrink(c, 'latte')).toBe(true);
    put(s, 'latte');
    stepPickup(s);
    expect([s.today.served, s.customers.length, s.pass.length]).toEqual([2, 0, 0]);
    const done = events(s, 'order.done');
    expect(done).toHaveLength(1);
    expect(done[0].customer).toBe(50);
    expect(done[0].paid).toBeCloseTo(s.cash - cash, 2);
    expect(done[0].tip).toBeCloseTo(s.today.tips, 2);
    expect(s.today.drinks?.latte).toBe(1);
    expect(s.today.drinks?.drip).toBe(1);
  });

  it('a combo walking out half done pays nothing: the taken cup is wasted, both drinks lost', () => {
    const s = gearDay(2);
    const c = ticket(s, ['latte', 'drip'], { order: 'combo' });
    const cash = s.cash;
    put(s, 'drip');
    stepPickup(s);
    c.patienceLeft = 1;
    stepCustomers(s);
    expect([s.cash, s.today.served, s.today.lost, s.today.wasted, s.customers.length]).toEqual([cash, 0, 2, 1, 0]);
    expect(events(s, 'order.lost')).toEqual([]);
  });

  it('a cold cup for one item is taken but not paid; the rest of the order goes on and pays', () => {
    const s = gearDay(2);
    const c = ticket(s, ['latte', 'drip'], { order: 'combo' });
    put(s, 'latte', { madeAt: s.tick - Math.round(COOLING_SECONDS.latte! * TICK_RATE) });
    stepPickup(s);
    expect(c.items![0]).toMatchObject({ drink: 'latte', done: true, cold: true });
    expect(events(s, 'pickup.cold')).toEqual([{ customer: 50, drink: 'latte' }]);
    expect(events(s, 'review.bad')).toEqual([{ customer: 50, drink: 'latte', reason: 'cold' }]);
    expect(s.customers).toHaveLength(1);
    const cash = s.cash;
    put(s, 'drip');
    stepPickup(s);
    expect([s.today.served, s.today.lost, s.customers.length]).toEqual([1, 1, 0]);
    expect(s.today.drinks?.latte ?? 0).toBe(0);
    expect(events(s, 'order.done')[0].paid).toBeCloseTo(s.cash - cash, 2);
    expect(s.cash).toBeGreaterThan(cash);
  });

  it('a Gear group is one ticket too: it pays once every drink is taken', () => {
    const s = gearDay(4, 'cafe');
    s.customers = [];
    let g: Customer | null = null;
    for (let i = 0; i < 50 && !g; i++) {
      s.customers = [];
      const c = addCustomer(s, 'group')!;
      if (c.kind === 'group') g = c;
    }
    expect(g!.items!.length).toBeGreaterThanOrEqual(2);
    expect(g!.extra).toEqual(g!.items!.slice(1).map((x) => x.drink));
  });

  it('a Gear group takes cups as they land (each tops patience up) and pays only for the whole ticket', () => {
    const s = gearDay(4, 'cafe');
    const g = ticket(s, ['latte', 'drip'], { kind: 'group', patienceLeft: 100 });
    const cash = s.cash;
    put(s, 'drip');
    stepPickup(s);
    expect([s.cash, s.today.served, g.patienceLeft]).toEqual([cash, 0, 100 + Math.round(ECONOMY.customers.group.refill * 1800)]);
    expect([g.drink, g.extra]).toEqual(['latte', undefined]);
    put(s, 'latte');
    stepPickup(s);
    expect([s.today.served, s.customers.length]).toEqual([2, 0]);
    expect(s.cash).toBeGreaterThan(cash);
  });
});

describe('office runs (FB2 B6)', () => {
  it('rings ~10 s ahead, walks in with the tier\'s order size; never two at once', () => {
    let s: GameState | null = null;
    for (let seed = 1; seed < 60 && !s; seed++) {
      const t = gearDay(3, 'cafe', undefined, seed);
      if (t.office?.day === 3) s = t;
    }
    expect(s).not.toBeNull();
    const at = s!.office!.at;
    s!.customers = [];
    const ticks = secondsToTicks(s!.settings.dayLengthSec);
    let called = -1;
    let came = -1;
    for (let t = 0; t < ticks && came < 0; t++) {
      s!.phaseTicksLeft = ticks - t;
      s!.tick += 1;
      stepOffice(s!);
      if (called < 0 && events(s!, 'office.call').length) called = t;
      if (events(s!, 'order.office').length) came = t;
    }
    expect(came).toBe(at);
    expect(came - called).toBe(secondsToTicks(ORDERS.office.callSeconds));
    expect(events(s!, 'office.call')[0].at).toBe(s!.tick);
    const c = s!.customers.find((x) => x.order === 'office')!;
    const [min, max] = ORDERS.office.size.cafe;
    expect(c.items!.length).toBeGreaterThanOrEqual(min);
    expect(c.items!.length).toBeLessThanOrEqual(max);
    expect(events(s!, 'order.office')).toEqual([{ customer: c.id, count: c.items!.length }]);
    expect(c.stage).toBe('order');
    // Stepping on never brings a second one.
    for (let t = 0; t < 200; t++) {
      s!.tick += 1;
      stepOffice(s!);
    }
    expect(s!.customers.filter((x) => x.order === 'office')).toHaveLength(1);
  });

  it('a smaller order on the cart than at the café', () => {
    expect(ORDERS.office.size.cart).toEqual([4, 6]);
    expect(ORDERS.office.size.cafe).toEqual([5, 8]);
    const sizes = { cart: new Set<number>(), cafe: new Set<number>() };
    for (let seed = 1; seed <= 120; seed++) {
      for (const tier of ['cart', 'cafe'] as const) {
        const s = gearDay(4, tier, undefined, seed);
        if (!s.office) continue;
        s.customers = [];
        s.phaseTicksLeft = secondsToTicks(s.settings.dayLengthSec) - s.office.at;
        stepOffice(s);
        sizes[tier].add(s.customers.find((c) => c.order === 'office')!.items!.length);
      }
    }
    expect([...sizes.cart].sort()).toEqual([4, 5, 6]);
    expect([...sizes.cafe].sort()).toEqual([5, 6, 7, 8]);
  });

  it('about every other day from day 3, on the cart and at the café; never on the stand, never before day 3', () => {
    let cafe = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const s = gearDay(3 + (seed % 5), seed % 2 ? 'cafe' : 'cart', undefined, seed);
      if (s.office?.day === s.day) cafe += 1;
      const d2 = gearDay(2, 'cafe', undefined, seed);
      expect(d2.office).toBeUndefined();
      const stand = gearDay(5, 'stand', ['c1', 'e1'], seed);
      expect(stand.office).toBeUndefined();
    }
    expect(cafe / 200).toBeGreaterThan(0.35);
    expect(cafe / 200).toBeLessThan(0.65);
  });

  it('completion pays every drink plus a 25% bonus tip', () => {
    const s = gearDay(4, 'cafe');
    const c = ticket(s, ['drip', 'drip', 'coldBrew'], { order: 'office' });
    const cash = s.cash;
    put(s, 'drip');
    put(s, 'drip');
    put(s, 'coldBrew');
    stepPickup(s);
    expect(s.customers).not.toContain(c);
    const served = s.log.filter((e) => e.kind === 'served').map((e) => e.data.amount as number);
    expect(served).toHaveLength(3);
    const done = events(s, 'order.done')[0];
    const bonus = Math.round(s.today.sales * ORDERS.office.bonus * 100) / 100;
    expect(done.paid).toBeCloseTo(served.reduce((a, b) => a + b, 0) + bonus, 2);
    expect(s.cash - cash).toBeCloseTo(done.paid as number, 2);
    expect(s.today.office).toBe('served');
  });

  it('takes a cup off the pickup counter only when no one else rung up wants it', () => {
    const s = gearDay(4, 'cafe');
    const office = ticket(s, ['drip', 'latte'], { order: 'office', rungAt: s.tick - 600 });
    s.customers.push({ id: 51, drink: 'drip', patienceLeft: 900, patienceMax: 1800, stage: 'pickup', rungAt: s.tick });
    put(s, 'drip');
    stepPickup(s);
    expect(s.customers.map((c) => c.id)).toEqual([50]);
    expect(office.items!.every((x) => !x.done)).toBe(true);
    put(s, 'drip');
    stepPickup(s);
    expect(office.items![0].done).toBe(true);
  });

  it('walks in 5-15% of the way through the day', () => {
    const ticks = secondsToTicks(ECONOMY.dayLengthSec);
    for (let seed = 1; seed <= 80; seed++) {
      const s = gearDay(4, 'cafe', undefined, seed);
      if (!s.office) continue;
      expect(s.office.at).toBeGreaterThanOrEqual(Math.floor(ticks * 0.05));
      expect(s.office.at).toBeLessThanOrEqual(Math.floor(ticks * 0.15));
    }
  });

  it('lost: order.lost, no lost customers, no wasted cups, no bad review, no reputation hit', () => {
    const s = gearDay(4, 'cafe');
    const c = ticket(s, ['drip', 'latte'], { order: 'office' });
    put(s, 'drip');
    stepPickup(s);
    c.patienceLeft = 1;
    stepCustomers(s);
    expect(events(s, 'order.lost')).toEqual([{ customer: 50 }]);
    expect(events(s, 'review.bad')).toEqual([]);
    // Fix round 1 (I3): the cups it took aren't waste (losing an office run costs nothing, the inspector included).
    expect([s.today.lost, s.today.wasted, s.today.office]).toEqual([0, 0, 'lost']);
    // Still in the shop at closing: lost the same way.
    const t = gearDay(4, 'cafe');
    ticket(t, ['drip', 'latte'], { order: 'office' });
    put(t, 'drip');
    stepPickup(t);
    t.today.served = 10;
    const rep = t.reputation;
    finishDay(t);
    expect([t.days.at(-1)!.lost, t.days.at(-1)!.wasted ?? 0]).toEqual([0, 0]);
    expect(t.reputation).toBeGreaterThanOrEqual(rep);
  });

  it('an office run still in when the doors lock leaves (order.lost); everyone else stays (fix round 1, M7)', () => {
    const s = gearDay(4, 'cafe');
    ticket(s, ['drip', 'latte'], { order: 'office' });
    s.customers.push({ id: 51, drink: 'drip', patienceLeft: 900, patienceMax: 1800, stage: 'pickup', rungAt: s.tick });
    enterClosing(s);
    expect(s.customers.map((c) => c.id)).toEqual([51]);
    expect(events(s, 'order.lost')).toEqual([{ customer: 50 }]);
    expect([s.today.office, s.today.lost]).toEqual(['lost', 0]);
  });

  it('a served office run counts as one customer for reputation', () => {
    const s = gearDay(4, 'cafe');
    ticket(s, ['drip', 'drip', 'drip'], { order: 'office' });
    put(s, 'drip');
    put(s, 'drip');
    put(s, 'drip');
    stepPickup(s);
    expect([s.today.served, s.today.officeExtra]).toEqual([3, 2]);
    // The reputation ratio sees 1 served against 1 lost (below the bar), not 3 against 1 (above it).
    s.today.lost = 1;
    const asThree = structuredClone(s);
    delete asThree.today.officeExtra;
    finishDay(s);
    finishDay(asThree);
    expect(asThree.reputation - s.reputation).toBeCloseTo(2 * ECONOMY.reputation.delta, 5);
  });

  it('officeMorning draws nothing outside its window (classic runs keep their rng stream)', () => {
    const classic = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
    classic.day = 5;
    const rng = classic.rng;
    officeMorning(classic);
    expect([classic.rng, classic.office]).toEqual([rng, undefined]);
  });
});
