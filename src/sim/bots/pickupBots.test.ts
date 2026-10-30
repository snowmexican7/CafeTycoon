import { describe, it, expect } from 'vitest';
import { createRun, startDay } from '../run';
import { step } from '../step';
import { TICK_RATE } from '../constants';
import { afterBotInteract, chainFor, dropPlan, think } from './brain';
import { addStandIns } from './roster';
import type { GearId } from '../../data/gear';
import type { BotStep, Customer, GameState, Player } from '../types';

/** A stocked Gear stand (C1 tap + E1 pods) with `bots` stand-ins and no walk-ins. */
function gearStand(bots = 1): GameState {
  let s = createRun({ seed: 101, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 150 }, tier: 'stand', gear: true });
  addStandIns(s, bots);
  for (const g of ['c1', 'e1'] as GearId[]) s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: g }]);
  s.supplies.beans = 40;
  s.supplies.milk = 40;
  s.supplies.concentrate = 20;
  return s;
}
const quiet = (s: GameState): GameState => {
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  s = startDay(s);
  s.eventSchedule = [];
  s.players[0].pos = { x: 10, y: 5 };
  return s;
};
const sim = (s: GameState, n = 1): Player => s.players.find((p) => p.id === `sim-${n}`)!;
const order = (id: number, more: Partial<Customer> = {}): Customer => ({ id, drink: 'espresso', patienceLeft: 1e5, patienceMax: 1e5, stage: 'order', ...more });
const last = (plan: BotStep[]) => plan[plan.length - 1];

describe('bots ring up and set drinks on the pickup counter (Task 13)', () => {
  it('a Gear chain ends on the pickup counter; a classic one at the counter', () => {
    const s = quiet(gearStand());
    expect(last(chainFor(s, sim(s), 'espresso', 'serve'))).toEqual({ kind: 'use', station: 'pickup', action: 'put' });
    expect(last(chainFor(s, sim(s), 'coldBrew', 'put'))).toEqual({ kind: 'use', station: 'pickup', action: 'put' });
    let c = createRun({ seed: 101, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
    addStandIns(c, 1);
    c = startDay(c);
    expect(last(chainFor(c, sim(c), 'espresso', 'serve'))).toEqual({ kind: 'use', station: 'counter', action: 'serve' });
  });

  it('a free bot rings up an unrung customer; a second bot leaves the till to it and makes the drink', () => {
    const s = quiet(gearStand(2));
    s.customers = [order(1)];
    const a = think(s, sim(s, 1));
    expect(a).toEqual([{ kind: 'use', station: 'counter', action: 'ring' }]);
    sim(s, 1).bot!.plan = a;
    const b = think(s, sim(s, 2));
    expect(b.some((x) => x.kind === 'use' && x.action === 'ring')).toBe(false);
    expect(last(b)).toEqual({ kind: 'use', station: 'pickup', action: 'put' });
    expect(sim(s, 2).bot!.claim).toBe(1);
    // Nobody left to ring (rung, a camper, upset): no ring step.
    const t = quiet(gearStand());
    t.customers = [order(2, { stage: 'pickup', rungAt: 0 }), order(3, { egg: 'camper' }), order(4, { upset: { ticksLeft: 99 } })];
    expect(think(t, sim(t)).some((x) => x.kind === 'use' && x.action === 'ring')).toBe(false);
  });

  it('a drink in hand goes on the pickup counter, or in the bin when the counter is full', () => {
    const s = quiet(gearStand());
    s.customers = [order(1, { stage: 'pickup', rungAt: 0 })];
    const p = sim(s);
    p.holding = 'espresso';
    expect(think(s, p)).toEqual([{ kind: 'use', station: 'pickup', action: 'put' }]);
    expect(dropPlan(s, p)).toEqual([{ kind: 'use', station: 'pickup', action: 'put' }]);
    s.pass = Array.from({ length: 4 }, () => ({ item: 'coldBrew' as const, ticksLeft: 999 }));
    expect(think(s, p)).toEqual([{ kind: 'use', station: 'trash', action: 'trash' }]);
  });

  it('the ring step drops itself when there is nobody left to ring', () => {
    let s = quiet(gearStand());
    s.customers = [order(1)];
    const p = sim(s);
    const till = s.stations.find((x) => x.id === 'counter')!;
    p.pos = { x: till.pos.x, y: till.pos.y - 1 };
    p.bot!.plan = [{ kind: 'use', station: 'counter', action: 'ring' }];
    p.bot!.thinkTicksLeft = 99;
    s.customers[0].stage = 'pickup';
    s.customers[0].rungAt = 0;
    s = step(s, []);
    expect(s.log.some((e) => e.kind === 'till.rung')).toBe(false);
    expect(sim(s).bot!.plan.some((x) => x.kind === 'use' && x.action === 'ring')).toBe(false);
  });

  it('a cup poured straight into the hands at the insert completes the planned take', () => {
    const s = quiet(gearStand());
    const p = sim(s);
    const tap = s.stations.find((x) => x.kind === 'coldBrewTap')!;
    p.pos = { x: tap.pos.x, y: tap.pos.y - 1 };
    p.bot!.plan = [{ kind: 'use', station: tap.id, action: 'take' }, { kind: 'use', station: 'pickup', action: 'put' }];
    p.holding = 'coldBrew'; // what an instant pour leaves: the cup in hand, the tap idle and empty
    afterBotInteract(s, p, null);
    expect(p.bot!.plan).toEqual([{ kind: 'use', station: 'pickup', action: 'put' }]);
    // A machine still brewing keeps its take.
    p.bot!.plan = [{ kind: 'use', station: tap.id, action: 'take' }];
    tap.busyTicksLeft = 50;
    afterBotInteract(s, p, null);
    expect(p.bot!.plan).toHaveLength(1);
  });

  it('one stand-in works a Gear stand day: rings everyone up before they take a drink, never hands one over', () => {
    let s = startDay(gearStand());
    s.eventSchedule = [];
    s.players[0].pos = { x: 10, y: 5 };
    const rungAt = new Map<number, number>();
    const takes: { cid: number; tick: number }[] = [];
    let handed = 0;
    for (let i = 0; i < 60 * TICK_RATE && s.phase === 'day'; i++) {
      s = step(s, []);
      for (const e of s.log) {
        if (e.tick !== s.tick) continue;
        if (e.kind === 'till.rung') rungAt.set(Number(e.data.customer), e.tick);
        if (e.kind === 'pickup.take') takes.push({ cid: Number(e.data.customer), tick: e.tick });
        if (e.kind === 'pass.serve') handed += 1;
      }
    }
    expect(s.today.served).toBeGreaterThan(0);
    expect(handed).toBe(0);
    for (const t of takes) expect(rungAt.get(t.cid)).toBeLessThanOrEqual(t.tick);
    expect(takes.length).toBe(s.today.served); // every serve was a customer taking a drink off the pickup counter
  });
});

describe('pickup review fixes (M1, M3)', () => {
  it('M3: a Wi-Fi camper is never an order a bot claims', () => {
    const s = quiet(gearStand());
    s.customers = [order(1, { drink: 'coldBrew', egg: 'camper' })];
    const plan = think(s, sim(s));
    expect(sim(s).bot!.claim).toBeNull();
    expect(plan.some((x) => x.kind === 'use' && x.station === 'pickup' && x.action === 'put')).toBe(false);
  });

  it('M1: an idle bot does not park on a counter spot a carrier needs', async () => {
    const { targetNodes, idleNode } = await import('./path');
    const s = quiet(gearStand());
    sim(s).pos = { x: 5, y: 5 }; // standing right where a carrier sets drinks down
    const spots = s.stations.filter((st) => st.kind === 'counter');
    const blocked = spots.flatMap((st) => targetNodes(s, st, sim(s).pos)).map((n) => `${n.x},${n.y}`);
    const node = idleNode(s, sim(s));
    expect(blocked).not.toContain(`${node.x},${node.y}`);
  });
});
