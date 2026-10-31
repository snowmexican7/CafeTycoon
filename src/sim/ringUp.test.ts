import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { applyGearInput } from './gear';
import { applyCheckoutInput } from './checkout';
import { tillNext, ringProgress, ringSeconds, TILL } from './till';
import { secondsToTicks } from './constants';
import { addStandIns } from './bots/roster';
import type { CheckoutId, Customer, GameState, Player } from './types';

/** A quiet Gear stand day (no walk-ins), `checkout` installed, p1 standing at the till. */
function tillDay(checkout: CheckoutId = 'register', bots = 0): GameState {
  let s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'P1' }], settings: { bots: 0 }, tier: 'stand', gear: true });
  if (bots) addStandIns(s, bots);
  applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'c1' });
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  s.cash = 500;
  for (const id of ['kiosk', 'squarely'] as CheckoutId[]) {
    applyCheckoutInput(s, { kind: 'checkout', playerId: 'p1', checkout: id });
    if (id === checkout) break;
  }
  if (checkout === 'register') applyCheckoutInput(s, { kind: 'checkout', playerId: 'p1', checkout: 'register' });
  s = startDay(s);
  s.eventSchedule = [];
  s.customers = [];
  atTill(s, s.players[0]);
  return s;
}
const till = (s: GameState) => s.stations.find((x) => x.id === 'counter')!;
const atTill = (s: GameState, p: Player) => {
  const t = till(s);
  p.pos = { x: t.pos.x, y: t.pos.y - 1 };
};
const cust = (s: GameState, id: number, more: Partial<Customer> = {}): Customer => {
  const c: Customer = { id, drink: 'coldBrew', patienceLeft: 5000, patienceMax: 10000, stage: 'order', ...more };
  s.customers.push(c);
  return c;
};
const press = { kind: 'move', playerId: 'p1', x: 0, y: 0, interact: true } as const;
const idle = (s: GameState, ticks: number): GameState => {
  for (let i = 0; i < ticks; i++) s = step(s, []);
  return s;
};
const byId = (s: GameState, id: number) => s.customers.find((c) => c.id === id)!;
const events = (s: GameState, kind: string) => s.log.filter((e) => e.kind === kind);

describe('Round 3 ring-up: it takes time at the till, by checkout tier', () => {
  it('seconds per tier: register 1.5, kiosk 1.0, Squarely is self-order', () => {
    expect(ringSeconds('register')).toBe(1.5);
    expect(ringSeconds('kiosk')).toBe(1.0);
    expect(ringSeconds('squarely')).toBe('self');
    expect(TILL.selfBoost).toBe(0.1);
  });

  it('register: E starts the ring, progress runs 0..1 while the person stays, then the customer moves to pickup', () => {
    let s = tillDay('register');
    cust(s, 901);
    expect(ringProgress(s)).toBeNull();
    s = step(s, [press]);
    expect(s.ringUp).toMatchObject({ customer: 901, by: 'p1' });
    expect(byId(s, 901).stage).toBe('order'); // not rung yet
    expect(byId(s, 901).rungAt).toBeUndefined();
    expect(events(s, 'till.start')).toHaveLength(1);
    expect(events(s, 'till.rung')).toHaveLength(0);
    expect(ringProgress(s)).toBeGreaterThanOrEqual(0);
    expect(ringProgress(s)!).toBeLessThan(0.1);
    s = idle(s, 40);
    expect(ringProgress(s)!).toBeGreaterThan(0.3);
    expect(ringProgress(s)!).toBeLessThan(0.7);
    expect(byId(s, 901).stage).toBe('order');
    s = idle(s, secondsToTicks(1.5)); // well past 1.5 s from the press
    expect(ringProgress(s)).toBeNull();
    expect(s.ringUp).toBeUndefined();
    const c = byId(s, 901);
    expect(c.stage).toBe('pickup');
    expect(c.rungAt).toBeDefined();
    expect(c.patienceLeft).toBeGreaterThan(5000 + 4500); // +50% of max (less the ticks the wait took)
    expect(events(s, 'till.rung')).toHaveLength(1);
    expect(events(s, 'till.rung')[0].data).toMatchObject({ customer: 901, by: 'p1' });
  });

  it('the ring lands on the right tick: register 1.5 s, kiosk 1.0 s', () => {
    for (const [checkout, seconds] of [['register', 1.5], ['kiosk', 1.0]] as const) {
      let s = tillDay(checkout);
      cust(s, 901);
      s = step(s, [press]);
      const started = s.ringUp!.startedAt;
      const need = secondsToTicks(seconds);
      expect(s.ringUp!.ticks).toBe(need);
      let done = -1;
      for (let i = 0; i < need + 20 && done < 0; i++) {
        s = step(s, []);
        if (s.ringUp === undefined) done = s.tick - started;
      }
      expect(done).toBe(need);
      expect(byId(s, 901).stage).toBe('pickup');
    }
  });

  it('walking away cancels: nothing is rung, the customer stays in the order stage, the till is free again', () => {
    let s = tillDay('register');
    cust(s, 901);
    s = step(s, [press]);
    s = idle(s, 20);
    expect(s.ringUp).toBeDefined();
    s.players[0].pos = { x: 10, y: 8 }; // far from the counter
    s = step(s, []);
    expect(s.ringUp).toBeUndefined();
    expect(ringProgress(s)).toBeNull();
    expect(byId(s, 901).stage).toBe('order');
    expect(byId(s, 901).rungAt).toBeUndefined();
    expect(events(s, 'till.cancel')).toHaveLength(1);
    expect(events(s, 'till.cancel')[0].data).toMatchObject({ customer: 901, by: 'p1' });
    expect(events(s, 'till.rung')).toHaveLength(0);
    expect(tillNext(s)?.id).toBe(901);
    // Back at the till, a fresh press starts over from zero.
    atTill(s, s.players[0]);
    s = step(s, [press]);
    expect(ringProgress(s)!).toBeLessThan(0.1);
  });

  it('picking something up, or the customer leaving, cancels too', () => {
    let s = tillDay('register');
    cust(s, 901);
    s = step(s, [press]);
    s.players[0].holding = 'espresso';
    s = step(s, []);
    expect(s.ringUp).toBeUndefined();
    expect(events(s, 'till.cancel')).toHaveLength(1);
    s.players[0].holding = null;
    s = step(s, [press]);
    expect(s.ringUp).toBeDefined();
    s.customers = [];
    s = step(s, []);
    expect(s.ringUp).toBeUndefined();
    expect(events(s, 'till.cancel')).toHaveLength(2);
  });

  it('only one ring at a time: a second press (same person or another) does not restart or double up', () => {
    let s = tillDay('register');
    cust(s, 901);
    cust(s, 902);
    s = step(s, [press]);
    const first = s.ringUp!;
    s = idle(s, 10);
    s = step(s, [press]);
    expect(s.ringUp).toEqual(first);
    expect(tillNext(s)).toBeUndefined(); // the till is busy
    s = idle(s, secondsToTicks(1.5));
    expect(byId(s, 901).stage).toBe('pickup');
    expect(byId(s, 902).stage).toBe('order');
    expect(tillNext(s)?.id).toBe(902);
  });

  it('Squarely is self-order: nobody presses, customers move to pickup by themselves one at a time, +10% patience', () => {
    let s = tillDay('squarely');
    s.players[0].pos = { x: 10, y: 8 }; // nobody at the till
    cust(s, 901);
    cust(s, 902);
    expect(tillNext(s)).toBeUndefined(); // no one rings in this tier
    s = step(s, []);
    expect(s.ringUp).toMatchObject({ customer: 901, by: '' });
    expect(ringProgress(s)).not.toBeNull();
    s = idle(s, secondsToTicks(TILL.selfBeat) + 2);
    const a = byId(s, 901);
    expect(a.stage).toBe('pickup');
    expect(a.rungAt).toBeDefined();
    expect(a.patienceLeft).toBeGreaterThanOrEqual(5000 + 1000 - 100); // +10% of max (less the ticks the beat took)
    expect(a.patienceLeft).toBeLessThan(5000 + 2000); // not the +50% a person's ring gives
    expect(events(s, 'till.rung')[0].data).toMatchObject({ customer: 901, by: '' });
    expect(byId(s, 902).stage).toBe('order'); // one at a time
    s = idle(s, secondsToTicks(TILL.selfBeat) + 2);
    expect(byId(s, 902).stage).toBe('pickup');
    expect(s.ringUp).toBeUndefined();
    expect(events(s, 'till.cancel')).toHaveLength(0);
  });

  it('self-order skips campers and upset customers; E at the till does nothing there', () => {
    let s = tillDay('squarely');
    cust(s, 901, { egg: 'camper' });
    cust(s, 902, { upset: { ticksLeft: 999 } });
    s = idle(s, 200);
    expect(s.ringUp).toBeUndefined();
    expect(byId(s, 901).stage).toBe('order');
    expect(byId(s, 902).stage).toBe('order');
    cust(s, 903);
    s.ringUp = undefined;
    s = step(s, [press]);
    expect(s.ringUp).toMatchObject({ by: '' }); // the screen took it, not the person
  });

  it('a stale ring-up does not survive into the next day', () => {
    let s = tillDay('register');
    cust(s, 901);
    s = step(s, [press]);
    expect(s.ringUp).toBeDefined();
    s = startDay(s);
    expect(s.ringUp).toBeUndefined();
  });

  it('bots ring with the same time, and stay at the till until it is done', () => {
    let s = tillDay('register', 1);
    s.players[0].pos = { x: 10, y: 8 }; // the human is elsewhere: the bot runs the till
    cust(s, 901, { patienceLeft: 1e5, patienceMax: 1e5 });
    let started = -1;
    let rungTick = -1;
    for (let i = 0; i < 40 * 60 && rungTick < 0; i++) {
      s = step(s, []);
      if (started < 0 && s.ringUp) started = s.ringUp.startedAt;
      const r = events(s, 'till.rung')[0];
      if (r) rungTick = r.tick;
    }
    expect(started).toBeGreaterThan(0);
    expect(rungTick).toBeGreaterThan(0);
    expect(rungTick - started).toBe(secondsToTicks(1.5));
    expect(events(s, 'till.cancel')).toHaveLength(0);
    expect(events(s, 'till.rung')[0].data.by).toBe('sim-1');
    expect(byId(s, 901).stage).toBe('pickup');
  });

  it('bots never plan a ring in the self-order tier, and the screen still feeds them orders', () => {
    let s = tillDay('squarely', 1);
    s.players[0].pos = { x: 10, y: 8 };
    cust(s, 901, { patienceLeft: 1e5, patienceMax: 1e5 });
    let bot = s.players.find((p) => p.bot)!;
    s = step(s, []);
    bot = s.players.find((p) => p.bot)!;
    expect(bot.bot!.plan.some((x) => x.kind === 'use' && x.action === 'ring')).toBe(false);
    s = idle(s, secondsToTicks(TILL.selfBeat) + 5);
    expect(byId(s, 901).stage).toBe('pickup');
  });
});
