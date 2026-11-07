import { describe, it, expect } from 'vitest';
import { createRun, startDay } from '../sim/run';
import { step } from '../sim/step';
import { addStandIns } from './crew';
import { makeTicket } from '../sim/orders';
import type { GearId } from '../data/gear';
import type { Customer, DrinkId, GameState } from '../sim/types';

/** A stocked Gear cart (tap + pods) with one stand-in, nobody else on the floor, no walk-ins. */
function cartDay(bots = 1): GameState {
  let s = createRun({ seed: 101, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { dayLengthSec: 300 }, tier: 'cart', gear: true });
  addStandIns(s, bots);
  for (const g of ['c1', 'e1'] as GearId[]) s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: g }]);
  s.supplies.beans = 40;
  s.supplies.milk = 40;
  s.supplies.concentrate = 20;
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  s = startDay(s);
  s.eventSchedule = [];
  s.players[0].connected = false;
  return s;
}
const events = (s: GameState, kind: string) => s.log.filter((e) => e.kind === kind).map((e) => e.data);
/** Step until nobody is left (or `max` ticks). */
function run(s: GameState, max: number): GameState {
  for (let i = 0; i < max && s.customers.length > 0; i++) s = step(s, []);
  return s;
}

function ticket(id: number, drinks: DrinkId[]): Customer {
  const c: Customer = { id, drink: drinks[0], patienceLeft: 1e5, patienceMax: 1e5, stage: 'pickup', rungAt: 0, order: 'combo' };
  makeTicket(c, drinks);
  return c;
}

describe('Round 6 block 3: bots and the tray table', () => {
  it('bots build a multi ticket on the tray table and carry it to the pickup counter', () => {
    let s = cartDay();
    s.customers = [ticket(1, ['espresso', 'espresso'])];
    s = run(s, 4000);
    expect(s.customers).toHaveLength(0);
    expect(events(s, 'order.done')).toHaveLength(1);
    expect(events(s, 'tray.add').length).toBeGreaterThanOrEqual(1);
    expect(events(s, 'tray.put')).toHaveLength(1);
    expect(events(s, 'tray.take')).toHaveLength(1);
  });

  it('two tickets of one drink: nobody stalls', () => {
    let s = cartDay(2);
    s.customers = [ticket(1, ['espresso', 'espresso']), ticket(2, ['espresso', 'espresso'])];
    s = run(s, 8000);
    expect(s.customers).toHaveLength(0);
    expect(s.today.lost).toBe(0); // both finished, neither walked out
  });
});
