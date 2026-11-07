import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../data/economy';
import { createRun, startDay } from './run';
import { enterClosing, step } from './step';
import { applyGearInput } from './gear';
import { applyCheckoutInput } from './checkout';
import { finishDay } from './closing';
import { billsForDay, wagesForDay } from './staff';
import { humanCount } from './bots/roster';
import { ringSeconds } from './till';
import { findPath } from './path';
import { TICK_RATE, secondsToTicks } from './constants';
import { assignSeat } from '../net/seats';
import { CASHIER, CASHIER_ID, cashierHome, syncCashier } from './cashier';
import type { CheckoutId, Customer, GameState, Player, PlayerInput, Settings, Vec2 } from './types';

/** A quiet Gear stand day (no walk-ins) with `checkout` installed; p1 stands far from the till. */
function cashierDay(settings: Partial<Settings> = { bots: 0, cashier: true }, checkout: CheckoutId = 'register', seed = 7): GameState {
  let s = createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings, tier: 'stand', gear: true });
  applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'c1' });
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  s.cash = 500;
  for (const id of ['kiosk', 'squarely'] as CheckoutId[]) {
    if (checkout === 'register') break;
    applyCheckoutInput(s, { kind: 'checkout', playerId: 'p1', checkout: id });
    if (id === checkout) break;
  }
  s = startDay(s);
  s.eventSchedule = [];
  s.customers = [];
  me(s).pos = { ...FAR };
  seen = new Map();
  return s;
}
const FAR: Vec2 = { x: 1, y: 3 }; // the stand's back-left corner: well over 1.5 tiles from the till spot
const me = (s: GameState): Player => s.players.find((p) => p.id === 'p1')!;
const bot = (s: GameState): Player | undefined => s.players.find((p) => p.id === CASHIER_ID);
const cashier = (s: GameState): Player => bot(s)!;
const cust = (s: GameState, id: number, more: Partial<Customer> = {}): Customer => {
  const c: Customer = { id, drink: 'coldBrew', patienceLeft: 5000, patienceMax: 10000, stage: 'order', ...more };
  s.customers.push(c);
  return c;
};
const byId = (s: GameState, id: number) => s.customers.find((c) => c.id === id)!;
/** Every event since the last `cashierDay()` (the state's own log is pruned to the last few seconds). */
let seen = new Map<number, GameState['log'][number]>();
const tick = (s: GameState, inputs: PlayerInput[] = []): GameState => {
  const next = step(s, inputs);
  for (const e of next.log) seen.set(e.seq, e);
  return next;
};
const run = (s: GameState, ticks: number, inputs: PlayerInput[] = []): GameState => {
  for (let i = 0; i < ticks; i++) s = tick(s, i === 0 ? inputs : []);
  return s;
};
const events = (kind: string, by: string) => [...seen.values()].filter((e) => e.kind === kind && e.data.by === by);
const starts = (_s: GameState, by: string) => events('till.start', by);
const rungBy = (_s: GameState, by: string) => events('till.rung', by);
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

describe('bot cut step 3: the solo robot cashier', () => {
  it('no cashier without the setting; exactly one with it once the day starts; a bot, never a person', () => {
    const off = cashierDay({ bots: 0 });
    expect(bot(off)).toBeUndefined();
    const on = cashierDay();
    expect(on.players.filter((p) => p.id === CASHIER_ID)).toHaveLength(1);
    const c = cashier(on);
    expect(c.bot).toBeDefined();
    expect(c.connected).toBe(true);
    expect(c.name).toBe(ECONOMY.cashier.name);
    expect(humanCount(on)).toBe(1);
    // syncing again never adds a second one; switching it off takes it away
    syncCashier(on);
    expect(on.players.filter((p) => p.id === CASHIER_ID)).toHaveLength(1);
    on.settings.cashier = false;
    syncCashier(on);
    expect(bot(on)).toBeUndefined();
  });

  it('it is on shift every day of a cashier run, not just the first', () => {
    let s = cashierDay();
    s = finishDay(s);
    expect(s.phase).toBe('night');
    s = startDay(s);
    expect(s.players.filter((p) => p.id === CASHIER_ID)).toHaveLength(1);
  });

  it('never takes a network seat', () => {
    const s = cashierDay();
    const live = new Set<string>();
    for (const t of ['a', 'b', 'c']) {
      const seat = assignSeat({ token: t, name: t, hostToken: 'p1', state: s, live });
      expect(seat).toEqual({ seat: t });
      live.add(t);
    }
  });

  it('with a customer waiting and the person far away, it walks to the till and the order is rung up in time', () => {
    let s = cashierDay();
    cashier(s).pos = { x: 2, y: 5 };
    const home = cashierHome(s)!;
    expect(dist(me(s).pos, home)).toBeGreaterThan(ECONOMY.cashier.deferTiles);
    cust(s, 901);
    const path = findPath(s, cashier(s).pos, home)!;
    const perTick = (ECONOMY.moveSpeedTilesPerSecond * ECONOMY.bots.personalities.steady.speed * ECONOMY.bots.skill.speed[s.settings.botSkill - 1]) / TICK_RATE;
    const walkTicks = Math.ceil((path.length + 1) / perTick);
    const bound = walkTicks + secondsToTicks(ringSeconds('register') as number) + secondsToTicks(1);
    let done = -1;
    for (let i = 0; i < bound && done < 0; i++) {
      s = tick(s, []);
      if (byId(s, 901).stage === 'pickup') done = i;
    }
    expect(done).toBeGreaterThan(0);
    expect(byId(s, 901).rungAt).toBeDefined();
    expect(rungBy(s, CASHIER_ID)).toHaveLength(1);
    expect(dist(cashier(s).pos, home)).toBeLessThanOrEqual(CASHIER.arriveRadius + 0.05);
  });

  it('rings a queue one after another', () => {
    let s = cashierDay();
    cust(s, 901);
    cust(s, 902);
    s = run(s, secondsToTicks(8));
    expect(byId(s, 901).stage).toBe('pickup');
    expect(byId(s, 902).stage).toBe('pickup');
    expect(rungBy(s, CASHIER_ID)).toHaveLength(2);
  });

  it('a person at the till: it never rings while they stay, steps off the till spot, and comes back when they leave', () => {
    let s = cashierDay();
    const home = cashierHome(s)!;
    cashier(s).pos = { ...home };
    me(s).pos = { x: home.x - 1, y: home.y }; // a tile beside the till spot
    cust(s, 901);
    for (let i = 0; i < secondsToTicks(3); i++) {
      s = tick(s, []);
      me(s).pos = { x: home.x - 1, y: home.y }; // the person stays put (bumps may nudge them)
    }
    expect(starts(s, CASHIER_ID)).toHaveLength(0);
    expect(byId(s, 901).stage).toBe('order');
    expect(dist(cashier(s).pos, home)).toBeGreaterThan(0.5);
    // the person walks off: the cashier comes back and rings
    me(s).pos = { ...FAR };
    s = run(s, secondsToTicks(5));
    expect(rungBy(s, CASHIER_ID)).toHaveLength(1);
    expect(byId(s, 901).stage).toBe('pickup');
  });

  it('a person ringing up: it does not press over them', () => {
    let s = cashierDay();
    const home = cashierHome(s)!;
    me(s).pos = { ...home };
    cust(s, 901);
    cust(s, 902);
    s = tick(s, [{ kind: 'move', playerId: 'p1', x: 0, y: 0, interact: true }]);
    expect(s.ringUp?.by).toBe('p1');
    for (let i = 0; i < secondsToTicks(4); i++) {
      s = tick(s, []);
      me(s).pos = { ...home };
    }
    expect(starts(s, CASHIER_ID)).toHaveLength(0);
  });

  it('self-order tier: customers ring themselves and the cashier never presses', () => {
    let s = cashierDay({ bots: 0, cashier: true }, 'squarely');
    expect(s.checkout?.active ?? 'register').toBe('squarely');
    cust(s, 901);
    cust(s, 902);
    s = run(s, secondsToTicks(6));
    expect(starts(s, CASHIER_ID)).toHaveLength(0);
    expect(rungBy(s, '').length).toBeGreaterThan(0);
  });

  it('only an empty-handed person near the till holds it: one carrying a drink does not stop the cashier ringing', () => {
    const near = (holding: Player['holding']) => {
      let s = cashierDay();
      const home = cashierHome(s)!;
      cashier(s).pos = { ...home };
      const spot = { x: home.x - 1, y: home.y }; // within deferTiles of the till spot
      expect(dist(spot, home)).toBeLessThanOrEqual(ECONOMY.cashier.deferTiles);
      me(s).pos = { ...spot };
      me(s).holding = holding;
      cust(s, 901);
      for (let i = 0; i < secondsToTicks(3); i++) {
        s = tick(s, []);
        me(s).pos = { ...spot };
        me(s).holding = holding;
      }
      return s;
    };
    const carrying = near('coldBrew');
    expect(rungBy(carrying, CASHIER_ID)).toHaveLength(1);
    expect(byId(carrying, 901).stage).toBe('pickup');
    const empty = near(null);
    expect(starts(empty, CASHIER_ID)).toHaveLength(0);
    expect(byId(empty, 901).stage).toBe('order');
  });

  it('closing: it keeps ringing the customers still in line, with the same deferral', () => {
    let s = cashierDay();
    cust(s, 901);
    cust(s, 902);
    enterClosing(s);
    expect(s.phase).toBe('closing');
    s = run(s, secondsToTicks(6));
    expect(s.phase).toBe('closing');
    expect(rungBy(s, CASHIER_ID)).toHaveLength(2);
    expect(byId(s, 901).stage).toBe('pickup');
    expect(byId(s, 902).stage).toBe('pickup');

    // an empty-handed person by the till during closing: the cashier leaves the ringing to them
    let t = cashierDay();
    const home = cashierHome(t)!;
    cust(t, 903);
    enterClosing(t);
    me(t).pos = { x: home.x - 1, y: home.y };
    for (let i = 0; i < secondsToTicks(3); i++) {
      t = tick(t, []);
      me(t).pos = { x: home.x - 1, y: home.y };
    }
    expect(starts(t, CASHIER_ID)).toHaveLength(0);
  });

  it('night: it stands still', () => {
    let s = cashierDay();
    s = finishDay(s);
    const c = cashier(s);
    expect(c.moveDir).toEqual({ x: 0, y: 0 });
    const pos = { ...c.pos };
    s = run(s, 30);
    expect(cashier(s).pos).toEqual(pos);
  });

  it('the day’s wages include exactly the daily charge with the cashier, and none without', () => {
    const on = cashierDay();
    expect(wagesForDay(on)).toBe(ECONOMY.cashier.dailyCost);
    const off = cashierDay({ bots: 0 });
    expect(wagesForDay(off)).toBe(0);
    expect(billsForDay(on)).toBeCloseTo(billsForDay(off) + ECONOMY.cashier.dailyCost, 5);
    const after = finishDay(on);
    expect(after.days.at(-1)!.wages).toBe(ECONOMY.cashier.dailyCost);
    expect(after.days.at(-1)!.hireWages).toBeUndefined();
    // the night planner's budget counts it for tomorrow too
    expect(after.phase).toBe('night');
    expect(wagesForDay(after)).toBe(ECONOMY.cashier.dailyCost);
    const offAfter = finishDay(off);
    expect(offAfter.days.at(-1)!.wages ?? 0).toBe(0);
    expect(offAfter.cash - after.cash).toBeCloseTo(ECONOMY.cashier.dailyCost, 5); // the same day otherwise
  });

  it('an input as the cashier is refused (no movement, no effect)', () => {
    const s = cashierDay();
    const moved = step(s, [{ kind: 'move', playerId: CASHIER_ID, x: 1, y: 0, interact: true }]);
    const still = step(s, []);
    expect(moved).toEqual(still);
    // nobody can join as the cashier either, in a run without one
    const off = cashierDay({ bots: 0 });
    const joined = step(off, [{ kind: 'join', playerId: CASHIER_ID, name: 'imposter' }]);
    expect(joined.players.some((p) => p.id === CASHIER_ID)).toBe(false);
  });

  it('deterministic: same seed and inputs, same state', () => {
    const play = () => {
      let s = cashierDay();
      cashier(s).pos = { x: 2, y: 5 };
      cust(s, 901);
      cust(s, 902, { drink: 'espresso' });
      for (let i = 0; i < secondsToTicks(6); i++) s = tick(s, i === 30 ? [{ kind: 'move', playerId: 'p1', x: 1, y: 1, interact: false }] : []);
      return s;
    };
    expect(play()).toEqual(play());
  });

  it('the harness brain leaves the cashier alone: a bot and the cashier share a short day', () => {
    let s = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 1, cashier: true }, tier: 'stand', gear: true });
    s.cash = 500;
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'c1' });
    s = startDay(s);
    me(s).pos = { ...FAR };
    expect(s.players.filter((p) => p.bot)).toHaveLength(2);
    for (let i = 0; i < secondsToTicks(30); i++) {
      s = tick(s, []);
      expect(cashier(s).bot!.plan).toEqual([]);
      expect(cashier(s).bot!.claim).toBeNull();
    }
    expect(s.phase === 'day' || s.phase === 'closing').toBe(true);
  });
});
