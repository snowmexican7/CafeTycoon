import { describe, it, expect } from 'vitest';
import { createRun, startDay } from '../run';
import { step } from '../step';
import { secondsToTicks } from '../constants';
import { stationsFromSlots } from '../slots';
import { ECONOMY } from '../../data/economy';
import type { GearId } from '../../data/gear';
import type { BotStep, Customer, GameState, Player, Station, SupplyId } from '../types';
import { think } from './brain';
import { addStandIns } from './roster';
import { helping, ticketFresh } from './helper';

/** FB2 A1: a stocked Gear stand (C1 tap + E1 pods) with one person (p1) and `bots` crew bots, no walk-ins, no events. */
function helperStand(bots = 1): GameState {
  let s = createRun({ seed: 101, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots, dayLengthSec: 150 }, tier: 'stand', gear: true });
  for (const g of ['c1', 'e1'] as GearId[]) s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: g }]);
  for (const k of Object.keys(s.supplies) as SupplyId[]) s.supplies[k] = 99;
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  s = startDay(s);
  s.eventSchedule = [];
  person(s).pos = { x: 2, y: 4 }; // free, and more than the guard distance from every station
  return s;
}
const person = (s: GameState): Player => s.players.find((p) => p.id === 'p1')!;
const bot = (s: GameState): Player => s.players.find((p) => p.id === 'bot-1')!;
const at = (s: GameState, kind: Station['kind']): Station => s.stations.find((x) => x.kind === kind && x.id !== 'pickup' && x.id !== 'condiments')!;
const huge = { patienceLeft: 100_000, patienceMax: 100_000 };
/** A rung-up espresso order, `ago` seconds since the till rang it. */
const rungOrder = (s: GameState, id: number, ago: number, more: Partial<Customer> = {}): Customer => ({
  id, drink: 'espresso', ...huge, stage: 'pickup', rungAt: s.tick - secondsToTicks(ago), ...more,
});
const usesStation = (plan: BotStep[], st: Station) => plan.some((x) => x.kind === 'use' && x.station === st.id);

describe('FB2 A1: crew bots help a person instead of playing for them', () => {
  it('only crew bots in a Gear café with a person in it are helpers (never stand-ins, never classic)', () => {
    const s = helperStand();
    expect(helping(s, bot(s))).toBe(true);
    addStandIns(s, 1);
    expect(helping(s, s.players.find((p) => p.id === 'sim-1')!)).toBe(false);
    let c = createRun({ seed: 101, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 1 } });
    c = startDay(c);
    expect(helping(c, bot(c))).toBe(false);
  });

  it('never claims or works the machine a person stands at, while an order needing it waits', () => {
    let s = helperStand();
    const machine = at(s, 'espresso');
    person(s).pos = { x: machine.pos.x, y: machine.pos.y + 1 };
    s.customers = [rungOrder(s, 1, 30)];
    for (let i = 0; i < 600; i++) {
      s = step(s, []);
      expect(bot(s).bot!.claim).toBeNull();
      expect(usesStation(bot(s).bot!.plan, machine)).toBe(false);
      expect(machine.busyTicksLeft === 0 && s.stations.find((x) => x.id === machine.id)!.output === null).toBe(true);
    }
    expect(s.customers.map((c) => c.id)).toEqual([1]);
    // The person walks off: the bot takes the order and makes it.
    person(s).pos = { x: 2, y: 4 };
    let claimed = false;
    for (let i = 0; i < 600 && !claimed; i++) {
      s = step(s, []);
      claimed = bot(s).bot!.claim === 1;
    }
    expect(claimed).toBe(true);
  });

  it('leaves the till alone while a person stands at it', () => {
    const s = helperStand();
    const till = s.stations.find((x) => x.id === 'counter')!;
    s.customers = [{ id: 1, drink: 'espresso', ...huge, stage: 'order' }];
    expect(think(s, bot(s))).toEqual([{ kind: 'use', station: 'counter', action: 'ring' }]);
    person(s).pos = { x: till.pos.x, y: till.pos.y - 1 };
    expect(think(s, bot(s)).some((x) => x.kind === 'use' && x.action === 'ring')).toBe(false);
  });

  it('a new ticket is the free person’s for a few seconds; after that, or with nobody free, the bot takes it', () => {
    const s = helperStand();
    const w = ECONOMY.bots.helperTicketSeconds;
    s.customers = [rungOrder(s, 1, 0)];
    think(s, bot(s));
    expect(bot(s).bot!.claim).toBeNull();
    s.customers = [rungOrder(s, 1, w - 0.5)];
    think(s, bot(s));
    expect(bot(s).bot!.claim).toBeNull();
    // Past the window.
    s.customers = [rungOrder(s, 1, w)];
    think(s, bot(s));
    expect(bot(s).bot!.claim).toBe(1);
    // A fresh ticket, but the person's hands are full: nobody is free, so the bot takes it at once.
    s.customers = [rungOrder(s, 2, 0)];
    person(s).holding = 'coldBrew';
    think(s, bot(s));
    expect(bot(s).bot!.claim).toBe(2);
    // One free person holds one fresh ticket; a second fresh ticket is the bot's.
    person(s).holding = null;
    s.customers = [rungOrder(s, 3, 0), rungOrder(s, 4, 0)];
    think(s, bot(s));
    expect(bot(s).bot!.claim).toBe(4);
  });

  it('a person waiting on a brewing machine is not free', () => {
    const s = helperStand();
    const tap = at(s, 'coldBrewTap');
    person(s).pos = { x: tap.pos.x, y: tap.pos.y + 1 };
    s.customers = [rungOrder(s, 1, 0)];
    think(s, bot(s));
    expect(bot(s).bot!.claim).toBeNull();
    tap.busyTicksLeft = 300;
    think(s, bot(s));
    expect(bot(s).bot!.claim).toBe(1);
  });

  it('a ticket is fresh when it appears and again just after it is rung up', () => {
    const s = helperStand();
    const w = secondsToTicks(ECONOMY.bots.helperTicketSeconds);
    expect(ticketFresh(s, { id: 1, drink: 'espresso', patienceLeft: 1000, patienceMax: 1000 })).toBe(true);
    expect(ticketFresh(s, { id: 1, drink: 'espresso', patienceLeft: 1000 - w, patienceMax: 1000 })).toBe(false);
    expect(ticketFresh(s, { id: 1, drink: 'espresso', patienceLeft: 1000, patienceMax: 1000, rungAt: s.tick - w + 1 })).toBe(true);
    expect(ticketFresh(s, { id: 1, drink: 'espresso', patienceLeft: 1000, patienceMax: 1000, rungAt: s.tick - w })).toBe(false);
  });
});

describe('FB2 A1: a solo Gear run with no bots', () => {
  it('one stand-in and bots: 0 plays two whole days: no bots clock in, drinks get served', () => {
    let s = createRun({ seed: 7, hostId: 'tester', players: [], settings: { bots: 0, dayLengthSec: 60, nightLengthSec: 4 }, tier: 'stand', gear: true });
    s.slotGear = ['c1', 'e1', null, 'b0'];
    s.slots = ['coldBrewTap', 'espresso', null, 'trash'];
    s.stations = [...stationsFromSlots('stand', s.slots, s.slotGear), ...s.stations.filter((x) => x.kind === 'counter')];
    for (const k of Object.keys(s.supplies) as SupplyId[]) s.supplies[k] = 99;
    addStandIns(s, 1);
    for (let i = 0; i < 60 * 60 * 6 && s.days.length < 2 && s.phase !== 'ended'; i++) {
      s = step(s, []);
      expect(s.players.filter((p) => p.bot && p.bot.personality !== 'human')).toHaveLength(0);
    }
    expect(s.days.length).toBe(2);
    expect(s.bankrupt).toBeFalsy();
    expect(s.days.reduce((n, d) => n + d.served, 0)).toBeGreaterThan(0);
    expect(s.days.every((d) => !d.wages)).toBe(true);
  });
});
