import { describe, it, expect } from 'vitest';
import { createRun, startDay } from '../run';
import { step } from '../step';
import { think, uncoveredOrders } from './brain';
import { addStandIns } from './roster';
import { makeTicket } from '../orders';
import type { GearId } from '../../data/gear';
import type { Customer, DrinkId, GameState, Player } from '../types';

/** A stocked Gear stand (C1 tap + E1 pods) with `bots` stand-ins and no walk-ins. */
function gearStand(bots = 1): GameState {
  let s = createRun({ seed: 101, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 150 }, tier: 'stand', gear: true });
  addStandIns(s, bots);
  for (const g of ['c1', 'e1'] as GearId[]) s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: g }]);
  s.supplies.beans = 40;
  s.supplies.milk = 40;
  s.supplies.concentrate = 20;
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  s = startDay(s);
  s.eventSchedule = [];
  s.players[0].pos = { x: 10, y: 5 };
  s.players[0].connected = false; // nobody on the floor: the bots are the crew
  return s;
}
const sim = (s: GameState, n = 1): Player => s.players.find((p) => p.id === `sim-${n}`)!;
function combo(id: number, drinks: DrinkId[], more: Partial<Customer> = {}): Customer {
  const c: Customer = { id, drink: drinks[0], patienceLeft: 1e5, patienceMax: 1e5, stage: 'pickup', rungAt: 0, order: 'combo', ...more };
  makeTicket(c, drinks);
  return c;
}

describe('bots and multi-drink tickets (FB2 B6)', () => {
  it('each undone item is an order to cover; a done item is not', () => {
    const s = gearStand();
    const c = combo(1, ['espresso', 'espresso', 'coldBrew']);
    s.customers = [c];
    expect(uncoveredOrders(s, sim(s)).map((o) => [o.id, o.drink])).toEqual([[1, 'espresso'], [1, 'espresso'], [1, 'coldBrew']]);
    c.items![0].done = true;
    expect(uncoveredOrders(s, sim(s)).map((o) => o.drink)).toEqual(['espresso', 'coldBrew']);
    s.pass = [{ item: 'coldBrew', ticksLeft: 999 }];
    expect(uncoveredOrders(s, sim(s)).map((o) => o.drink)).toEqual(['espresso']);
  });

  it('one claim per item: a second bot takes the other item of the same ticket', () => {
    const s = gearStand(2);
    s.customers = [combo(1, ['espresso', 'espresso'])];
    const a = think(s, sim(s, 1));
    sim(s, 1).bot!.plan = a;
    expect([sim(s, 1).bot!.claim, sim(s, 1).bot!.claimDrink]).toEqual([1, 'espresso']);
    const b = think(s, sim(s, 2));
    expect(b.length).toBeGreaterThan(0);
    expect([sim(s, 2).bot!.claim, sim(s, 2).bot!.claimDrink]).toEqual([1, 'espresso']);
    // A third bot has nothing left to claim on that ticket.
    sim(s, 2).bot!.plan = b;
    const t = gearStand(3);
    t.customers = s.customers;
    for (const n of [1, 2]) Object.assign(sim(t, n).bot!, { plan: [...sim(s, n).bot!.plan], claim: 1, claimDrink: 'espresso' });
    think(t, sim(t, 3));
    expect(sim(t, 3).bot!.claim).toBeNull();
  });

  it('a claim on a ticket holds while an item of its drink is still to come', () => {
    const s = gearStand(1);
    const c = combo(1, ['espresso', 'coldBrew']);
    s.customers = [c];
    const p = sim(s);
    p.bot!.plan = think(s, p);
    expect(p.bot!.claimDrink).toBe('espresso');
    c.items![1].done = true; // the coldBrew landed: the espresso claim stands
    s.tick += 1;
    const after = step(s, []);
    expect(sim(after).bot!.claim).toBe(1);
    after.customers[0].items![0].done = true; // its drink is taken (by someone else's cup): the claim is lost
    const later = step(after, []);
    expect(sim(later).bot!.claim).toBeNull();
  });

  it('a one-bot crew rings up and finishes a combo', () => {
    let s = gearStand(1);
    const c = combo(1, ['espresso', 'coldBrew'], { stage: 'order', rungAt: undefined });
    s.customers = [c];
    s.nextCustomerId = 2;
    let done = false;
    for (let t = 0; t < 120 * 60 && !done; t++) {
      s = step(s, []);
      done = s.log.some((e) => e.kind === 'order.done' && e.data.customer === 1);
    }
    expect(done).toBe(true);
    expect(s.today.served).toBe(2);
  });

  it('a one-bot crew works through an office run cup by cup without stalling', () => {
    let s = gearStand(1);
    const drinks: DrinkId[] = ['espresso', 'coldBrew', 'espresso', 'espresso', 'coldBrew', 'espresso'];
    s.customers = [combo(1, drinks, { stage: 'order', rungAt: undefined, order: 'office' })];
    s.nextCustomerId = 2;
    let done = false;
    for (let t = 0; t < 140 * 60 && !done; t++) {
      s = step(s, []);
      done = s.log.some((e) => e.kind === 'order.done' && e.data.customer === 1);
    }
    expect(done).toBe(true);
    expect(s.today.served).toBe(6);
    expect(s.today.office).toBe('served');
  });
});
