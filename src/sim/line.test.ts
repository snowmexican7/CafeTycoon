import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step, shopEmpty } from './step';
import { finishDay } from './closing';
import { queueCapacity, spawnCustomers } from './customers';
import { computeModifiers } from './effects';
import { tierInfo } from './growth';
import { secondsToTicks } from './constants';
import { ECONOMY } from '../data/economy';
import { stepWaiting, waitingRoom } from './line';
import { applyGearInput } from './gear';
import type { Customer, GameState, SimEvent, TierId } from './types';

const L = ECONOMY.line;

function shop(tier: TierId = 'cart', traffic = 0): GameState {
  const s = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier, gear: true });
  s.scenario = 'normal';
  s.cash = 1000;
  applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'd1' }); // drip on the board
  const d = startDay(s);
  d.supplies = { beans: 500, milk: 500, concentrate: 500, flavour: 500, pastry: 0 };
  d.owned.push({ itemId: 'test-traffic', effects: [{ kind: 'traffic', mul: traffic }] });
  return d;
}

function queue(s: GameState, extra: Partial<Customer> = {}): Customer {
  const c: Customer = { id: s.nextCustomerId++, drink: 'drip', patienceLeft: 1e6, patienceMax: 1e6, stage: 'order', ...extra };
  s.customers.push(c);
  return c;
}

const cap = (s: GameState) => queueCapacity(computeModifiers(s), tierInfo(s).queue);
const fill = (s: GameState) => {
  while (s.customers.length < cap(s)) queue(s);
};
/** Swap the fixture's traffic for a crowd: an arrival every tick. */
const rush = (s: GameState) => {
  s.owned = s.owned.filter((o) => o.itemId !== 'test-traffic');
  s.owned.push({ itemId: 'test-traffic', effects: [{ kind: 'traffic', mul: 1e6 }] });
};
const events = (s: GameState, kind: string) => s.log.filter((e) => e.kind === kind);

describe('Round 3 item 4: the waiting area', () => {
  it('sizes stand at 0 for the stand, 2 for the cart and 4 for the café', () => {
    expect(waitingRoom(shop('stand'))).toBe(0);
    expect(waitingRoom(shop('cart'))).toBe(2);
    expect(waitingRoom(shop('cafe'))).toBe(4);
  });

  for (const tier of ['stand', 'cart', 'cafe'] as const) {
    it(`a full line sends arrivals to browse (${tier}), and only once that is full are they turned away`, () => {
      let s = shop(tier, 1000);
      fill(s);
      const line = s.customers.length;
      for (let i = 0; i < 600; i++) s = spawnCustomers(s);
      expect(s.customers).toHaveLength(line);
      expect(s.waiting ?? []).toHaveLength(L.waiting[tier]);
      expect(s.today.turnedAway).toBeGreaterThan(0);
    });
  }

  it('browsers join the line in arrival order as space frees', () => {
    let s = shop('cart', 1000);
    fill(s);
    for (let i = 0; i < 600 && (s.waiting?.length ?? 0) < 2; i++) s = spawnCustomers(s);
    const [a, b] = s.waiting!;
    expect(a.id).toBeLessThan(b.id);
    s.customers.shift(); // the front is served
    stepWaiting(s);
    expect(s.customers[s.customers.length - 1]).toBe(a);
    expect(s.waiting).toEqual([b]);
    s.customers.shift();
    s.customers.shift();
    stepWaiting(s);
    expect(s.customers.slice(-2)).toEqual([a, b]);
    expect(s.waiting ?? []).toEqual([]);
  });

  it('a new arrival never jumps ahead of the browsers', () => {
    let s = shop('cart', 1000);
    fill(s);
    for (let i = 0; i < 600 && (s.waiting?.length ?? 0) < 2; i++) s = spawnCustomers(s);
    const [a] = s.waiting!;
    s.customers.shift(); // a cup was handed off this tick, before the arrivals
    s = spawnCustomers(s);
    expect(s.customers[s.customers.length - 1]).toBe(a);
  });

  it('browsing patience drains at half speed; at zero the browser leaves as a turn-away, not lost', () => {
    const s = shop('cart');
    fill(s);
    const c: Customer = { id: s.nextCustomerId++, drink: 'drip', patienceLeft: 100, patienceMax: 100, stage: 'order' };
    s.waiting = [c];
    for (let i = 0; i < 60; i++) {
      s.tick += 1;
      stepWaiting(s);
    }
    expect(c.patienceLeft).toBe(100 - 60 * L.browsePatience);
    for (let i = 0; i < 200; i++) {
      s.tick += 1;
      stepWaiting(s);
    }
    expect(s.waiting ?? []).toEqual([]);
    expect(s.today.lost).toBe(0);
    expect(s.today.turnedAway).toBe(1);
  });

  it('browsers keep the shop open through closing, and are lost when the day ends; the next day starts empty', () => {
    const s = shop('cart');
    s.waiting = [{ id: s.nextCustomerId++, drink: 'drip', patienceLeft: 1e6, patienceMax: 1e6, stage: 'order' }];
    expect(shopEmpty(s)).toBe(false);
    finishDay(s);
    expect(s.waiting ?? []).toEqual([]);
    expect(s.today.lost).toBe(1);
  });
});

describe('Round 3 item 4: line complaints', () => {
  it('a line that has not moved for the stall time: the back of the line complains once, then cools down', () => {
    let s = shop('cart');
    queue(s);
    queue(s);
    const back = queue(s);
    const stall = secondsToTicks(L.stallSeconds);
    for (let i = 0; i < stall - 2; i++) s = step(s, []);
    expect(events(s, 'line.complain')).toHaveLength(0);
    for (let i = 0; i < 4; i++) s = step(s, []);
    const first = events(s, 'line.complain');
    expect(first).toHaveLength(1);
    expect(first[0].data).toEqual({ customer: back.id });
    const at = first[0].tick;
    const later: number[] = [];
    while (s.tick < at + secondsToTicks(L.cooldownSeconds) + 2) {
      s = step(s, []);
      for (const e of s.log) if (e.kind === 'line.complain' && e.tick > at && !later.includes(e.tick)) later.push(e.tick);
    }
    expect(later).toEqual([at + secondsToTicks(L.cooldownSeconds)]);
  });

  it('a line whose front moves does not complain', () => {
    let s = shop('cart');
    for (let i = 0; i < 4; i++) queue(s);
    for (let t = 0; t < secondsToTicks(40); t++) {
      if (t % secondsToTicks(L.stallSeconds - 2) === 0) s.customers.find((c) => c.stage === 'order')!.stage = 'pickup'; // rung up
      s = step(s, []);
    }
    expect(events(s, 'line.complain')).toHaveLength(0);
  });

  it('one person waiting alone does not complain', () => {
    let s = shop('cart');
    queue(s);
    for (let t = 0; t < secondsToTicks(L.stallSeconds + 5); t++) s = step(s, []);
    expect(events(s, 'line.complain')).toHaveLength(0);
  });

  it('while a complaint is fresh, some arrivals leave quietly: no reputation, no lost customer, a stat', () => {
    let s = shop('cart');
    queue(s);
    queue(s);
    for (let t = 0; t < secondsToTicks(L.stallSeconds) + 1; t++) s = step(s, []);
    expect(events(s, 'line.complain')).toHaveLength(1);
    rush(s); // everybody walks up now
    const lost = s.today.lost;
    const rep = s.reputation;
    const leaves = new Map<number, SimEvent>(); // the log only keeps the last two seconds
    for (let t = 0; t < secondsToTicks(L.freshSeconds) + 60; t++) {
      s = step(s, []);
      for (const e of events(s, 'line.leave')) leaves.set(e.seq, e);
    }
    expect(s.tick - s.line!.complainedAt!).toBeGreaterThan(secondsToTicks(L.freshSeconds)); // and past it: none after
    expect(leaves.size).toBeGreaterThan(0);
    const fresh = secondsToTicks(L.freshSeconds);
    for (const e of leaves.values()) {
      expect(e.data).toEqual({ customer: expect.any(Number), quiet: true });
      expect(e.tick - s.line!.complainedAt!).toBeLessThan(fresh);
    }
    expect(s.today.lineLeft).toBe(leaves.size);
    expect(s.today.lost).toBe(lost);
    expect(s.reputation).toBe(rep);
    // a few still came in (the chance is not 1)
    expect(s.customers.length + (s.waiting?.length ?? 0) + s.today.turnedAway).toBeGreaterThan(2);
  });

  it('once the complaint is stale, nobody leaves quietly', () => {
    let s = shop('cart');
    queue(s);
    queue(s);
    for (let t = 0; t < secondsToTicks(L.stallSeconds + L.freshSeconds) + 1; t++) s = step(s, []);
    rush(s);
    for (let t = 0; t < secondsToTicks(5); t++) s = step(s, []);
    expect(s.customers.length).toBeGreaterThan(2);
    expect(s.today.lineLeft ?? 0).toBe(0);
  });
});
