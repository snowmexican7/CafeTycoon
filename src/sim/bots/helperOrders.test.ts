import { describe, it, expect } from 'vitest';
import { createRun, startDay } from '../run';
import { step } from '../step';
import { secondsToTicks } from '../constants';
import { ECONOMY } from '../../data/economy';
import type { GearId } from '../../data/gear';
import type { Customer, DrinkId, GameState, Player, Station, SupplyId } from '../types';
import { uncoveredOrders } from './brain';
import { addStandIns } from './roster';
import { heldByPerson, heldForPeople } from './helper';
import { makeTicket } from '../orders';

/** FB2 B6 fix round 1: a stocked Gear stand (C1 tap + E1 pods) with one person (p1) and one crew bot. */
function helperStand(): GameState {
  let s = createRun({ seed: 101, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 1, dayLengthSec: 150 }, tier: 'stand', gear: true });
  for (const g of ['c1', 'e1'] as GearId[]) s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: g }]);
  for (const k of Object.keys(s.supplies) as SupplyId[]) s.supplies[k] = 99;
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  s = startDay(s);
  s.eventSchedule = [];
  person(s).pos = { x: 2, y: 4 };
  return s;
}
const person = (s: GameState): Player => s.players.find((p) => p.id === 'p1')!;
const bot = (s: GameState): Player => s.players.find((p) => p.id === 'bot-1')!;
const at = (s: GameState, kind: Station['kind']): Station => s.stations.find((x) => x.kind === kind && x.id !== 'pickup' && x.id !== 'condiments')!;
const huge = { patienceLeft: 100_000, patienceMax: 100_000 };
const rung = (s: GameState, id: number, ago: number, more: Partial<Customer> = {}): Customer => ({
  id, drink: 'espresso', ...huge, stage: 'pickup', rungAt: s.tick - secondsToTicks(ago), ...more,
});
function ticket(s: GameState, id: number, drinks: DrinkId[], ago: number, more: Partial<Customer> = {}): Customer {
  const c = rung(s, id, ago, { drink: drinks[0], ...more });
  makeTicket(c, drinks);
  return c;
}

describe('FB2 B6 fix round 1: tickets and the helper rules', () => {
  it('one fresh ticket uses up one free person, not one per drink (M3)', () => {
    const s = helperStand();
    addStandIns(s, 1); // a second free person (a stand-in counts as one)
    const sim = s.players.find((p) => p.id === 'sim-1')!;
    sim.pos = { x: 3, y: 4 };
    s.customers = [ticket(s, 1, ['espresso', 'espresso'], 0, { order: 'combo' }), rung(s, 2, 0)];
    const held = heldForPeople(s, bot(s), uncoveredOrders(s, bot(s)));
    expect([...held].sort()).toEqual([1, 2]);
  });

  it("a lost claim doesn't carry over onto a ticket held for a free person (M2)", () => {
    const s = helperStand();
    const machine = at(s, 'espresso');
    Object.assign(machine, { busyTicksLeft: 300, busyTotal: 300, making: 'espresso' });
    const b = bot(s);
    Object.assign(b.bot!, { plan: [{ kind: 'use', station: machine.id, action: 'take' }, { kind: 'use', station: 'pickup', action: 'put' }], claim: 9, claimDrink: 'espresso', reactionTicksLeft: 100 });
    s.customers = [rung(s, 2, 0)]; // customer 9 is gone; 2 is fresh and held for the free person
    const after = step(s, []);
    expect(bot(after).bot!.claim).toBeNull();
    // Once the ticket is no longer fresh, the carry-over takes it.
    const t = helperStand();
    const m2 = at(t, 'espresso');
    Object.assign(m2, { busyTicksLeft: 300, busyTotal: 300, making: 'espresso' });
    Object.assign(bot(t).bot!, { plan: [{ kind: 'use', station: m2.id, action: 'take' }, { kind: 'use', station: 'pickup', action: 'put' }], claim: 9, claimDrink: 'espresso', reactionTicksLeft: 100 });
    t.customers = [rung(t, 2, ECONOMY.bots.helperTicketSeconds + 1)];
    expect(bot(step(t, [])).bot!.claim).toBe(2);
  });

  it("a waiting office run doesn't lift the guard on a person's machine (M5)", () => {
    const s = helperStand();
    const machine = at(s, 'espresso');
    person(s).pos = { x: machine.pos.x, y: machine.pos.y + 1 };
    s.customers = [ticket(s, 1, ['espresso', 'espresso', 'espresso', 'espresso'], ECONOMY.bots.helperGuardSeconds + 5, { order: 'office' })];
    expect(heldByPerson(s, bot(s), machine)).toBe(true);
    // A walk-in's order that old still does.
    s.customers = [rung(s, 2, ECONOMY.bots.helperGuardSeconds + 5)];
    expect(heldByPerson(s, bot(s), machine)).toBe(false);
  });
});
