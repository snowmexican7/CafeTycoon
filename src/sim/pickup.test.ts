import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { stationsFromSlots } from './slots';
import { stepCustomers } from './customers';
import { stepPass } from './pass';
import { PICKUP, passSlots, pickupTarget, spotOf, stepPickup, wantsDrink } from './pickup';
import { ECONOMY } from '../data/economy';
import { TICK_RATE } from './constants';
import { GEAR, type GearId } from '../data/gear';
import type { Customer, GameState, PlayerInput, SupplyId } from './types';

function gearDay(gear: GearId[], supplies: Partial<Record<SupplyId, number>> = {}): GameState {
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

const classicDay = (): GameState =>
  startDay(createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } }));

/** Stand p1 on the station with this id (nearest station = that one). */
function stand(s: GameState, id: string): void {
  const st = s.stations.find((x) => x.id === id)!;
  s.players[0].pos = { ...st.pos };
}

const use: PlayerInput[] = [{ kind: 'move', playerId: 'p1', x: 0, y: 0, interact: true }];
const drop: PlayerInput[] = [{ kind: 'drop', playerId: 'p1' }];
const has = (s: GameState, id: number) => s.customers.some((c) => c.id === id);
const atPickup = (id: number, drink: Customer['drink'], rungAt: number, more: Partial<Customer> = {}): Customer => ({
  id, drink, patienceLeft: 900, patienceMax: 1800, stage: 'pickup', rungAt, ...more,
});
const put = (s: GameState, drink: Customer['drink'], by = 'p1') =>
  s.pass.push({ item: drink, ticksLeft: ECONOMY.pass.staleSeconds[drink] * TICK_RATE, by });

describe('the pickup counter (Task 7)', () => {
  it('names the spots and sizes the counter', () => {
    expect(PICKUP.slots).toBe(4);
    expect(spotOf()).toBe('till');
    const s = gearDay(['c1', 'e1']);
    expect(s.stations.filter((x) => x.kind === 'counter').map((x) => spotOf(x))).toEqual(['till', 'pickup', 'condiments']);
    expect(passSlots(s)).toBe(4);
    expect(passSlots(classicDay())).toBe(ECONOMY.pass.slots);
    const g: Customer = { id: 1, drink: 'latte', extra: ['coldBrew'], patienceLeft: 1, patienceMax: 1 };
    expect([wantsDrink(g, 'latte'), wantsDrink(g, 'coldBrew'), wantsDrink(g, 'drip')]).toEqual([true, true, false]);
  });

  it('a drink set on the pickup counter waits for its customer to be rung (Review Focus 2)', () => {
    let s = gearDay(['c1', 'e1'], { beans: 9, milk: 9 });
    s.customers = [{ id: 1, drink: 'espresso', patienceLeft: 900, patienceMax: 1800, stage: 'order' }];
    stand(s, 'pickup');
    s.players[0].holding = 'espresso';
    s = step(s, use);
    expect([s.pass.length, s.today.served, s.pass[0].by]).toEqual([1, 0, 'p1']);
    expect(s.players[0].holding).toBeNull();
    expect(s.log.some((e) => e.kind === 'pass.put')).toBe(true);
    stand(s, 'counter');
    s = step(s, use);
    expect([s.pass.length, s.today.served, has(s, 1)]).toEqual([0, 1, false]);
    const kinds = s.log.map((e) => e.kind);
    expect(kinds.indexOf('till.rung')).toBeLessThan(kinds.indexOf('pickup.take'));
    expect(s.log.find((e) => e.kind === 'pickup.take')?.data).toEqual({ drink: 'espresso', customer: 1, by: 'p1' });
    expect(s.log.find((e) => e.kind === 'served')?.data.by).toBe('p1');
    expect(s.log.some((e) => e.kind === 'pass.serve')).toBe(false);
  });

  it('the till and the bar also set a drink down; the counter holds 4 in Gear, 3 in classic', () => {
    let s = gearDay(['c1', 'e1']);
    s.customers = [];
    for (const [i, spot] of ['counter', 'condiments', 'pickup', 'counter', 'pickup'].entries()) {
      stand(s, spot);
      s.players[0].holding = 'coldBrew';
      s = step(s, use);
      expect(s.pass.length).toBe(Math.min(i + 1, 4));
    }
    expect(s.players[0].holding).toBe('coldBrew'); // the 5th stays in hand
    expect(s.pass.every((i) => i.by === 'p1')).toBe(true);
    // Classic: the old pass, 3 slots.
    let c = classicDay();
    c.customers = [];
    for (let i = 0; i < 4; i++) {
      stand(c, 'counter');
      c.players[0].holding = 'coldBrew';
      c = step(c, use);
    }
    expect([c.pass.length, c.players[0].holding]).toEqual([3, 'coldBrew']);
  });

  it('grounds do nothing at any counter spot', () => {
    let s = gearDay(['c1', 'e1']);
    for (const spot of ['counter', 'pickup', 'condiments']) {
      stand(s, spot);
      s.players[0].holding = 'grounds';
      s = step(s, use);
      expect([s.pass.length, s.players[0].holding]).toEqual([0, 'grounds']);
    }
  });

  it('the customer who has waited longest at pickup takes it; an upset one first', () => {
    const s = gearDay(['c1', 'e1']);
    s.customers = [atPickup(1, 'latte', 20), atPickup(2, 'latte', 10), atPickup(3, 'latte', 5, { stage: 'order', rungAt: undefined })];
    expect(pickupTarget(s, 'latte')?.id).toBe(2);
    expect(pickupTarget(s, 'drip')).toBeNull();
    s.customers.push(atPickup(4, 'latte', 30, { upset: { ticksLeft: 100 } }));
    expect(pickupTarget(s, 'latte')?.id).toBe(4);
    s.customers.push(atPickup(5, 'latte', 1, { egg: 'camper' }));
    expect(pickupTarget(s, 'latte')?.id).toBe(4);
    put(s, 'latte');
    stepPickup(s);
    expect(s.customers.map((c) => c.id)).toEqual([1, 2, 3, 5]);
    put(s, 'latte');
    stepPickup(s);
    expect(s.customers.map((c) => c.id)).toEqual([1, 3, 5]);
    // Same ring time: the lower id.
    const t = gearDay(['c1', 'e1']);
    t.customers = [atPickup(8, 'drip', 10), atPickup(7, 'drip', 10)];
    expect(pickupTarget(t, 'drip')?.id).toBe(7);
  });

  it('takes stalest first and keeps going while drinks have takers', () => {
    const s = gearDay(['c1', 'e1']);
    s.customers = [atPickup(1, 'drip', 10), atPickup(2, 'drip', 12)];
    s.pass = [
      { item: 'drip', ticksLeft: 500, by: 'p1' },
      { item: 'latte', ticksLeft: 10, by: 'p1' },
      { item: 'drip', ticksLeft: 100, by: 'p2' },
      { item: 'drip', ticksLeft: 300, by: 'p1' },
    ];
    stepPickup(s);
    expect(s.customers).toHaveLength(0);
    expect(s.pass.map((i) => [i.item, i.ticksLeft])).toEqual([['drip', 500], ['latte', 10]]);
    const takes = s.log.filter((e) => e.kind === 'pickup.take').map((e) => e.data);
    expect(takes).toEqual([{ drink: 'drip', customer: 1, by: 'p2' }, { drink: 'drip', customer: 2, by: 'p1' }]);
  });

  it('a group takes each drink as it lands and leaves when all are taken (Review Focus 4)', () => {
    const s = gearDay(['c1', 'e1']);
    s.customers = [atPickup(1, 'latte', s.tick, { kind: 'group', extra: ['coldBrew'] })];
    put(s, 'coldBrew');
    stepPickup(s);
    expect(s.today.served).toBe(1);
    expect(s.customers).toHaveLength(1);
    expect([s.customers[0].drink, s.customers[0].extra]).toEqual(['latte', []]);
    expect(s.today.sales).toBeGreaterThan(0);
    put(s, 'latte');
    stepPickup(s);
    expect([s.today.served, s.customers.length, s.pass.length]).toEqual([2, 0, 0]);
  });

  it('a stage-order customer never takes from the counter (no serve, no pay)', () => {
    const s = gearDay(['c1', 'e1']);
    s.customers = [{ id: 1, drink: 'drip', patienceLeft: 900, patienceMax: 1800, stage: 'order' }];
    const cash = s.cash;
    put(s, 'drip');
    stepPickup(s);
    expect([s.pass.length, s.today.served, s.cash]).toEqual([1, 0, cash]);
  });

  it('the speed tip runs from ring-up to pickup', () => {
    const s = gearDay(['c1', 'e1']);
    s.customers = [atPickup(1, 'drip', s.tick - 20 * TICK_RATE)];
    put(s, 'drip');
    stepPickup(s);
    expect(s.log.find((e) => e.kind === 'served')?.data.till).toBe(0.5);
    s.customers = [atPickup(2, 'drip', s.tick - 50 * TICK_RATE)];
    put(s, 'drip');
    stepPickup(s);
    expect(s.log.filter((e) => e.kind === 'served')[1].data.till).toBe(0.25);
  });

  it('giving up at pickup is a lost customer', () => {
    const s = gearDay(['c1', 'e1']);
    s.customers = [atPickup(1, 'drip', 0, { patienceLeft: 1 })];
    stepCustomers(s);
    expect([s.today.lost, s.customers.length]).toEqual([1, 0]);
  });

  it('empty hands at pickup take a drink back; at the till with nobody to ring, nothing happens', () => {
    let s = gearDay(['c1', 'e1']);
    s.customers = [];
    s.pass = [
      { item: 'drip', ticksLeft: 500, by: 'p1' },
      { item: 'latte', ticksLeft: 200, by: 'p1', slips: 1, temp: true },
    ];
    stand(s, 'counter');
    s = step(s, use);
    expect([s.pass.length, s.players[0].holding]).toEqual([2, null]);
    stand(s, 'condiments');
    s = step(s, use);
    expect([s.pass.length, s.players[0].holding]).toEqual([2, null]);
    stand(s, 'pickup');
    s = step(s, use);
    expect([s.pass.length, s.players[0].holding, s.players[0].cupSlips, s.players[0].cupTemp]).toEqual([1, 'latte', 1, true]);
    expect(s.log.some((e) => e.kind === 'pass.take')).toBe(true);
  });

  it('the name mix-up fires at pickup and is fixed there', () => {
    let s = gearDay(['c1', 'e1']);
    s.customers = [atPickup(1, 'drip', s.tick, { kind: 'regular', name: 'Ana', egg: 'nameMix', wrongName: 'Anna' })];
    const cash = s.cash;
    put(s, 'drip');
    stepPickup(s);
    expect(s.customers[0].upset).toBeDefined();
    expect([s.today.served, s.cash, s.pass.length]).toEqual([0, cash, 0]);
    // Fixing the name: empty hands at the pickup counter (the till is out of range).
    s.customers[0].upset = undefined;
    stand(s, 'pickup');
    s = step(s, use);
    expect(s.customers[0].egg).toBeUndefined();
    expect(s.log.some((e) => e.kind === 'egg.nameMix' && e.data.fixed === 1)).toBe(true);
  });

  it('R at pickup or the till sets the drink down; R at the bar does not', () => {
    let s = gearDay(['c1', 'e1']);
    s.customers = [];
    stand(s, 'condiments');
    s.players[0].holding = 'drip';
    s = step(s, drop);
    expect([s.pass.length, s.players[0].holding]).toEqual([0, 'drip']);
    stand(s, 'pickup');
    s = step(s, drop);
    expect([s.pass.length, s.players[0].holding, s.pass[0].by]).toEqual([1, null, 'p1']);
    stand(s, 'counter');
    s.players[0].holding = 'latte';
    s = step(s, drop);
    expect([s.pass.length, s.players[0].holding]).toEqual([2, null]);
    s.pass.push({ item: 'drip', ticksLeft: 999 }, { item: 'drip', ticksLeft: 999 });
    s.players[0].holding = 'latte';
    s = step(s, drop);
    expect([s.pass.length, s.players[0].holding]).toEqual([4, 'latte']);
  });

  it('an untaken drink still goes stale', () => {
    const s = gearDay(['c1', 'e1']);
    s.customers = [];
    s.pass = [{ item: 'drip', ticksLeft: 1, by: 'p1' }];
    stepPass(s);
    expect([s.pass.length, s.today.wasted]).toEqual([0, 1]);
  });

  it('classic still hand-serves and never steps the pickup', () => {
    let c = classicDay();
    c.customers = [{ id: 1, drink: 'coldBrew', patienceLeft: 900, patienceMax: 1800 }];
    stand(c, 'counter');
    c.players[0].holding = 'coldBrew';
    c = step(c, use);
    expect([c.today.served, has(c, 1)]).toEqual([1, false]);
    const d = classicDay();
    d.customers = [atPickup(1, 'drip', 0)];
    put(d, 'drip');
    stepPickup(d);
    expect(d.pass.length).toBe(1);
  });
});
