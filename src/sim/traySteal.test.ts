import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { stationsFromSlots } from './slots';
import { stepPickup } from './pickup';
import { stepCustomers } from './customers';
import { makeTicket } from './orders';
import { GEAR } from '../data/gear';
import type { Customer, DrinkId, GameState } from './types';

function gearDay(): GameState {
  const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'cart', gear: true });
  const gear = ['c1', 'e1', 'd1'] as const;
  const slots = [...s.slots!];
  const slotGear = [...s.slotGear!];
  gear.forEach((id, i) => {
    slots[i] = GEAR[id].station;
    slotGear[i] = id;
  });
  s.slots = slots;
  s.slotGear = slotGear;
  s.stations = stationsFromSlots(s.tier, slots, slotGear);
  s.day = 2;
  const out = startDay(s);
  out.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  return out;
}

const events = (s: GameState, kind: string) => s.log.filter((e) => e.kind === kind).map((e) => e.data);
let nextId = 70;
function multi(s: GameState, drinks: DrinkId[], more: Partial<Customer> = {}): Customer {
  const c: Customer = { id: nextId++, drink: drinks[0], patienceLeft: 900, patienceMax: 1800, stage: 'pickup', rungAt: s.tick - 500, order: 'combo', ...more };
  makeTicket(c, drinks);
  s.customers.push(c);
  return c;
}
function single(s: GameState, drink: DrinkId, more: Partial<Customer> = {}): Customer {
  const c: Customer = { id: nextId++, drink, patienceLeft: 900, patienceMax: 900, stage: 'pickup', rungAt: s.tick - 10, ...more };
  s.customers.push(c);
  return c;
}
const cup = (s: GameState, drink: DrinkId) => s.pass.push({ item: drink, ticksLeft: 9999, by: 'p1', madeAt: s.tick });

describe('Round 6 block 3: serving-tray pressure', () => {
  it('a single takes the cup a multi ticket needed: the single pays, the ticket stays open, no refill, tray.steal', () => {
    const s = gearDay();
    const g = multi(s, ['latte', 'drip'], { kind: 'group', patienceLeft: 600 });
    const one = single(s, 'latte');
    cup(s, 'latte');
    const cash = s.cash;
    stepPickup(s);
    expect(s.customers.map((c) => c.id)).toEqual([g.id]);
    expect(s.cash).toBeGreaterThan(cash);
    expect(g.items!.map((x) => x.done)).toEqual([false, false]);
    expect(g.patienceLeft).toBe(600);
    expect(events(s, 'tray.steal')).toEqual([{ customer: one.id, from: g.id, drink: 'latte' }]);
  });

  it('even a multi that waited longer loses the cup to a single', () => {
    const s = gearDay();
    const g = multi(s, ['latte', 'latte'], { rungAt: s.tick - 900 });
    single(s, 'latte');
    cup(s, 'latte');
    stepPickup(s);
    expect(g.items!.every((x) => !x.done)).toBe(true);
  });

  it('with no single wanting it, the ticket takes its own cup (no steal)', () => {
    const s = gearDay();
    const g = multi(s, ['latte', 'drip']);
    cup(s, 'latte');
    stepPickup(s);
    expect(g.items![0]!.done).toBe(true);
    expect(events(s, 'tray.steal')).toEqual([]);
  });

  it('a spare cup beyond what the ticket needs is no steal', () => {
    const s = gearDay();
    multi(s, ['latte', 'drip']);
    single(s, 'latte');
    cup(s, 'latte');
    cup(s, 'latte');
    stepPickup(s);
    expect(events(s, 'tray.steal')).toEqual([]);
  });

  it('a cup on a tray is safe', () => {
    const s = gearDay();
    const g = multi(s, ['latte']);
    single(s, 'latte');
    s.pass.push({ item: 'latte', ticksLeft: 9999, by: 'p1', tray: { customer: g.id, drinks: [{ drink: 'latte', by: 'p1', madeAt: s.tick }] } });
    stepPickup(s);
    expect(s.customers.some((c) => c.id === g.id)).toBe(false); // the tray went to its ticket
    expect(events(s, 'tray.steal')).toEqual([]);
  });

  it('an unfinished group walking out pays nothing and wastes the cups it took', () => {
    const s = gearDay();
    const g = multi(s, ['latte', 'drip'], { kind: 'group' });
    g.items![1]!.done = true; // the drip was taken earlier
    g.patienceLeft = 1;
    const cash = s.cash;
    const lost = s.today.lost;
    stepCustomers(s);
    stepCustomers(s);
    expect(s.customers.some((c) => c.id === g.id)).toBe(false);
    expect(s.cash).toBe(cash);
    expect(s.today.lost).toBe(lost + 2);
    expect(s.today.wasted).toBeGreaterThanOrEqual(1);
  });
});
