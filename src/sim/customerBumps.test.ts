import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { secondsToTicks } from './constants';
import { ECONOMY } from '../data/economy';
import { customerSpots } from './customerSpots';
import { customerSpots as renderSpots } from '../render/pickupModel';
import { layoutFor, LAYOUT } from '../data/layout';
import type { Customer, GameState, Player } from './types';

const B = ECONOMY.bump;

function cafe(gear = true, players = 1): GameState {
  const s = createRun({
    seed: 3,
    hostId: 'p1',
    players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'J' }].slice(0, players),
    settings: { bots: 0 },
    tier: 'cart',
    gear,
  });
  s.scenario = 'normal';
  const d = startDay(s);
  d.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  return d;
}

const pl = (s: GameState, id = 'p1'): Player => s.players.find((p) => p.id === id)!;

function addCustomer(s: GameState, extra: Partial<Customer> = {}): Customer {
  const c: Customer = { id: s.nextCustomerId++, drink: 'drip', patienceLeft: 400, patienceMax: 400, ...(s.gear === true ? { stage: 'order' as const } : {}), ...extra };
  s.customers.push(c);
  return c;
}

/** p1 half a tile left of customer `c`, walking right into them. */
function walkInto(s: GameState, c: Customer): void {
  const i = s.customers.findIndex((x) => x.id === c.id);
  if (i < 0) return; // they have left
  const at = customerSpots(s)[i];
  const p = pl(s);
  p.pos = { x: at.x - 0.4, y: at.y };
  p.tile = { x: Math.floor(p.pos.x), y: Math.floor(p.pos.y) };
  p.heldDir = { x: 1, y: 0 };
}

/** Put p1 back next to the customer, still walking into them (undoes the walk of the last tick). */
function again(s: GameState, c: Customer): void {
  walkInto(s, c);
}

const bumpsOf = (s: GameState) => s.log.filter((e) => e.kind === 'customer.bump');
const cd = secondsToTicks(B.customerCooldownSeconds);

describe('bumping into customers', () => {
  it('walking into a customer annoys them: an event, a slice of patience, a tally', () => {
    let s = cafe();
    const c = addCustomer(s);
    walkInto(s, c);
    s = step(s, []);
    const got = s.customers[0];
    expect(bumpsOf(s)).toHaveLength(1);
    expect(bumpsOf(s)[0].data).toMatchObject({ customer: c.id, by: 'p1' });
    // one tick of waiting plus the slice
    expect(got.patienceLeft).toBe(400 - 1 - Math.round(B.customerPatience * 400));
    expect(got.patienceLeft).toBeGreaterThan(0);
    expect(s.today.customerBumps).toBe(1);
  });

  it('works for a customer waiting at pickup, and in a classic run', () => {
    let s = cafe();
    addCustomer(s, { stage: 'order' });
    const c = addCustomer(s, { stage: 'pickup' });
    walkInto(s, c);
    s = step(s, []);
    expect(bumpsOf(s)).toHaveLength(1);
    expect(bumpsOf(s)[0].data).toMatchObject({ customer: c.id });
    let k = cafe(false);
    const kc = addCustomer(k);
    walkInto(k, kc);
    k = step(k, []);
    expect(bumpsOf(k)).toHaveLength(1);
  });

  it('no bump when merely standing, walking away, or far off', () => {
    let s = cafe();
    const c = addCustomer(s);
    walkInto(s, c);
    pl(s).heldDir = { x: 0, y: 0 };
    s = step(s, []);
    expect(bumpsOf(s)).toHaveLength(0);
    walkInto(s, c);
    pl(s).heldDir = { x: -1, y: 0 };
    s = step(s, []);
    expect(bumpsOf(s)).toHaveLength(0);
    walkInto(s, c);
    pl(s).pos.x -= 2;
    s = step(s, []);
    expect(bumpsOf(s)).toHaveLength(0);
  });

  it('the cooldown holds: a long push into one customer is one bump', () => {
    let s = cafe();
    const c = addCustomer(s);
    for (let i = 0; i < cd; i++) {
      again(s, c);
      s = step(s, []);
    }
    expect(bumpsOf(s)).toHaveLength(1);
    expect(s.customers).toHaveLength(1);
    // the cooldown is over: the next push counts
    again(s, c);
    s = step(s, []);
    expect(bumpsOf(s)).toHaveLength(2);
  });

  it('a third bump within the window makes them leave angry: reason bumped, lost like a walk-out', () => {
    let s = cafe();
    const c = addCustomer(s);
    for (let n = 1; n <= 3; n++) {
      for (let i = 0; i < cd; i++) {
        again(s, c);
        s = step(s, []);
      }
      if (n < 3) expect(s.customers).toHaveLength(1);
    }
    expect(s.today.customerBumps).toBe(3);
    expect(bumpsOf(s).every((e) => e.data.customer === c.id)).toBe(true);
    const out = s.log.filter((e) => e.kind === 'walkout');
    expect(out).toHaveLength(1);
    expect(out[0].data).toMatchObject({ customer: c.id, reason: 'bumped' });
    expect(s.customers).toHaveLength(0);
    expect(s.today.lost).toBe(1);
    expect(s.today.feedMoments?.bump).toBe(1); // FB2 C11: a bump walk-out is a feed moment
    expect(s.reputation).toBeDefined();
  });

  it('bumps spread past the window do not add up', () => {
    let s = cafe();
    const c = addCustomer(s, { patienceLeft: 4000, patienceMax: 4000 });
    for (let n = 0; n < 4; n++) {
      again(s, c);
      s = step(s, []);
      for (let i = 0; i < secondsToTicks(B.customerWindowSeconds) + 1; i++) s = step(s, []);
      pl(s).heldDir = { x: 1, y: 0 };
    }
    expect(s.today.customerBumps).toBe(4);
    expect(s.customers).toHaveLength(1);
    expect(s.log.some((e) => e.kind === 'walkout')).toBe(false);
  });

  it('bots do not bump customers', () => {
    let s = cafe();
    const c = addCustomer(s);
    walkInto(s, c);
    pl(s).bot = { } as never;
    s = step(s, []);
    expect(bumpsOf(s)).toHaveLength(0);
    expect(s.customers[0].bumpedAt).toBeUndefined();
  });

  it('three scripted bumps are deterministic', () => {
    const play = (): GameState => {
      let s = cafe();
      const c = addCustomer(s);
      for (let i = 0; i < 3 * cd; i++) {
        again(s, c);
        s = step(s, []);
      }
      return s;
    };
    expect(play()).toEqual(play());
  });

  it('sim spots agree with the render: classic slots, Gear order line and pickup crowd', () => {
    for (const gear of [false, true]) {
      const s = cafe(gear);
      for (const stage of ['order', 'pickup', 'order', 'order', 'pickup', 'order'] as const) addCustomer(s, { stage });
      const lay = layoutFor(s.tier);
      const till = LAYOUT.stations.find((x) => x.kind === 'counter')!.pos;
      expect(customerSpots(s)).toEqual(renderSpots(s.customers, gear, { width: lay.width, queueSlots: lay.queueSlots, till, pickup: lay.pickup }));
    }
  });
});
