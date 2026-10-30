import { describe, it, expect } from 'vitest';
import { createRun, startDay } from '../run';
import { step } from '../step';
import { addStandIns } from './roster';
import { dropPlan, think } from './brain';
import { TICK_RATE } from '../constants';
import type { GearId } from '../../data/gear';
import type { Customer, DrinkId, GameState, PassItem } from '../types';

// Feedback 2 A2: bots and cold cups (src/sim/cooling.ts).
const secs = (n: number) => Math.round(n * TICK_RATE);
const idle = [] as Parameters<typeof step>[1];
const atPickup = (id: number, drink: DrinkId, rungAt: number, more: Partial<Customer> = {}): Customer => ({
  id, drink, patienceLeft: 900, patienceMax: 1800, stage: 'pickup', rungAt, ...more,
});
const cup = (item: DrinkId, madeAt?: number): PassItem => ({ item, ticksLeft: 99999, by: 'p1', ...(madeAt !== undefined ? { madeAt } : {}) });
function quiet(s: GameState): GameState {
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  s.eventSchedule = [];
  s.events = [];
  s.customers = [];
  return s;
}

describe('bots and cold cups', () => {
  function botStand(): GameState {
    let s = createRun({ seed: 101, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 150 }, tier: 'stand', gear: true });
    addStandIns(s, 1);
    for (const g of ['c1', 'e1'] as GearId[]) s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: g }]);
    s.supplies.beans = 40;
    s.supplies.milk = 40;
    s = quiet(startDay(s));
    s.players[0].pos = { x: 10, y: 5 };
    return s;
  }
  const bot = (s: GameState) => s.players.find((p) => p.id === 'sim-1')!;

  it('an idle bot takes a cold cup back off the counter and bins it', () => {
    let s = botStand();
    s.pass = [cup('latte', s.tick - secs(70)), cup('icedLatte', s.tick - secs(20))];
    expect(think(s, bot(s))).toEqual([{ kind: 'use', station: 'pickup', action: 'take' }, { kind: 'use', station: 'trash', action: 'trash' }]);
    for (let i = 0; i < secs(20) && s.pass.length > 1; i++) s = step(s, idle);
    expect(s.pass.map((i) => i.item)).toEqual(['icedLatte']);
    for (let i = 0; i < secs(20) && bot(s).holding !== null; i++) s = step(s, idle);
    expect(bot(s).holding).toBeNull();
    expect(s.today.wasted).toBeGreaterThanOrEqual(1);
  });

  it('a bot leaves a counter alone when the oldest cup is still warm', () => {
    const s = botStand();
    s.pass = [cup('latte', s.tick - secs(20))];
    expect(think(s, bot(s)).some((x) => x.kind === 'use' && x.station === 'pickup')).toBe(false);
  });

  it('a bot never sets down a cold cup, nor one nobody is waiting for', () => {
    const s = botStand();
    const p = bot(s);
    p.holding = 'latte';
    p.heldSince = s.tick - secs(61);
    s.customers = [atPickup(1, 'latte', s.tick)];
    expect(think(s, p)).toEqual([{ kind: 'use', station: 'trash', action: 'trash' }]);
    p.heldSince = s.tick;
    expect(think(s, p)).toEqual([{ kind: 'use', station: 'pickup', action: 'put' }]);
    s.customers = [];
    expect(think(s, p)).toEqual([{ kind: 'use', station: 'trash', action: 'trash' }]);
    expect(dropPlan(s, p)).toEqual([{ kind: 'use', station: 'trash', action: 'trash' }]);
    // One customer, a fresh latte for them already on the counter: a second one is not wanted.
    s.customers = [atPickup(1, 'latte', s.tick, { stage: 'order', rungAt: undefined })];
    s.pass = [cup('latte', s.tick)];
    expect(think(s, p)).toEqual([{ kind: 'use', station: 'trash', action: 'trash' }]);
  });

  it('a claiming bot whose cup went cold in hand bins it and remakes instead of putting it down', () => {
    let s = botStand();
    const p = bot(s);
    const counter = s.stations.find((x) => x.id === 'pickup')!;
    p.pos = { x: counter.pos.x, y: counter.pos.y + 1 };
    s.customers = [atPickup(1, 'espresso', s.tick)];
    p.holding = 'espresso';
    p.heldSince = s.tick - secs(50);
    p.bot!.claim = 1;
    p.bot!.claimDrink = 'espresso';
    p.bot!.plan = [{ kind: 'use', station: 'pickup', action: 'put' }];
    p.bot!.thinkTicksLeft = 99;
    const trashFirst = (x: GameState) => {
      const st = bot(x).bot!.plan[0];
      return st?.kind === 'use' && st.station === 'trash';
    };
    for (let i = 0; i < secs(10) && s.pass.length === 0 && !trashFirst(s); i++) s = step(s, idle);
    expect(s.pass).toHaveLength(0);
    expect(bot(s).bot!.plan[0]).toEqual({ kind: 'use', station: 'trash', action: 'trash' });
    expect(bot(s).bot!.plan.length).toBeGreaterThan(1);
  });
});
