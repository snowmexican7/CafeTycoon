import { describe, it, expect } from 'vitest';
import { createRun, startDay } from '../run';
import { step } from '../step';
import { TICK_RATE } from '../constants';
import { BOX_LOW, afterBotInteract, boxNode, chainFor, dropPlan, think } from './brain';
import { layoutFor } from '../../data/layout';
import { ECONOMY } from '../../data/economy';
import { nearestStation } from '../movement';
import { addStandIns } from './roster';
import type { GearId } from '../../data/gear';
import { BASE_DRINKS } from '../../data/drinks';
import type { BotStep, Customer, DrinkId, GameState, Player, SupplyId } from '../types';

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

/** A Gear stand with a C1 tap, E1 pods and an S1 steamer, every tap drink on the menu, plenty of supplies, no walk-ins. */
function tapStand(bots = 1): GameState {
  let s = createRun({ seed: 101, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 600 }, tier: 'stand', gear: true });
  addStandIns(s, bots);
  for (const g of ['c1', 'e1', 's1'] as GearId[]) s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: g }]);
  s.unlocked = [...new Set([...BASE_DRINKS, ...s.unlocked, 'icedLatte', 'sweetCream', 'special'] as DrinkId[])];
  for (const d of s.unlocked) s.menu[d] = true;
  for (const k of Object.keys(s.supplies) as SupplyId[]) s.supplies[k] = 99;
  return quiet(s);
}
const tapOf = (s: GameState) => s.stations.find((x) => x.kind === 'coldBrewTap')!;
const ids = (plan: BotStep[]) => plan.map((x) => (x.kind === 'use' ? `${x.station}:${x.action}${x.makes ? `>${x.makes}` : ''}` : x.kind));

describe('bots at the steeped tap (Task 14)', () => {
  it('a Gear cold brew is one pour at the tap, then the pickup counter', () => {
    const s = tapStand();
    const tap = tapOf(s);
    expect(chainFor(s, sim(s), 'coldBrew', 'serve')).toEqual([
      { kind: 'use', station: tap.id, action: 'insert', makes: 'coldBrew' },
      { kind: 'use', station: 'pickup', action: 'put' },
    ]);
    // The tap drinks built on a pour: sweet cream at the tap, maple cold foam at the steamer; iced latte needs a shot first.
    expect(ids(chainFor(s, sim(s), 'sweetCream', 'serve'))).toEqual([
      `${tap.id}:insert>coldBrew`, `${tap.id}:insert>sweetCream`, `${tap.id}:take`, 'pickup:put',
    ]);
    expect(ids(chainFor(s, sim(s), 'special', 'serve'))).toEqual([`${tap.id}:insert>coldBrew`, 'steamer:insert>special', 'steamer:take', 'pickup:put']);
    expect(ids(chainFor(s, sim(s), 'icedLatte', 'serve')).slice(-3)).toEqual([`${tap.id}:insert>icedLatte`, `${tap.id}:take`, 'pickup:put']);
  });

  it('a bot pours with no concentrate while steeped cups are left', () => {
    let s = tapStand();
    const p = sim(s);
    const tap = tapOf(s);
    s.supplies.concentrate = 0;
    tap.batchLeft = 3;
    p.pos = { x: tap.pos.x, y: tap.pos.y + 1 };
    p.bot!.plan = chainFor(s, p, 'coldBrew', 'put');
    p.bot!.thinkTicksLeft = 999;
    for (let i = 0; i < 3 * TICK_RATE && sim(s).holding === null; i++) s = step(s, []);
    expect(sim(s).holding).toBe('coldBrew');
    expect(tapOf(s).batchLeft).toBe(2);
    expect(sim(s).bot!.plan).toEqual([{ kind: 'use', station: 'pickup', action: 'put' }]);
  });

  it('an empty tap still makes sweet cream from a cup in hand; it pours nothing and makes no iced latte', () => {
    const s = tapStand();
    tapOf(s).batchLeft = 0;
    const tap = tapOf(s);
    expect(ids(chainFor(s, sim(s), 'sweetCream', 'serve', 'coldBrew'))).toEqual([`${tap.id}:insert>sweetCream`, `${tap.id}:take`, 'pickup:put']);
    expect(chainFor(s, sim(s), 'coldBrew', 'serve')).toEqual([]);
    expect(chainFor(s, sim(s), 'icedLatte', 'serve', 'espresso')).toEqual([]);
  });

  it('a bot holding cold brew finishes sweet cream at an empty tap', () => {
    let s = tapStand();
    const p = sim(s);
    const tap = tapOf(s);
    tap.batchLeft = 0;
    s.customers = [order(1, { drink: 'sweetCream', stage: 'pickup', rungAt: s.tick })];
    p.holding = 'coldBrew';
    p.pos = { x: tap.pos.x, y: tap.pos.y + 1 };
    p.bot!.claim = 1;
    p.bot!.claimDrink = 'sweetCream';
    p.bot!.plan = chainFor(s, p, 'sweetCream', 'serve', 'coldBrew');
    for (let i = 0; i < 30 * TICK_RATE && s.today.served === 0; i++) s = step(s, []);
    expect(s.today.served).toBe(1);
    expect(s.log.find((e) => e.kind === 'pickup.take')?.data.drink).toBe('sweetCream');
  });

  it('Gear bots never prep cold brew', () => {
    const s = tapStand();
    s.customers = [];
    sim(s).bot!.personality = 'steady';
    expect(think(s, sim(s)).some((x) => x.kind === 'use' && x.action === 'insert')).toBe(false);
  });

  for (const drink of ['coldBrew', 'sweetCream', 'icedLatte', 'special'] as DrinkId[]) {
    it(`a bot takes a rung-up ${drink} order from the tap to the customer`, () => {
      let s = tapStand();
      s.customers = [order(1, { drink, stage: 'pickup', rungAt: s.tick })];
      const before = tapOf(s).batchLeft!;
      for (let i = 0; i < 40 * TICK_RATE && s.today.served === 0; i++) s = step(s, []);
      expect(s.today.served).toBe(1);
      expect(s.today.wasted ?? 0).toBe(0);
      expect(s.log.find((e) => e.kind === 'pickup.take')?.data.drink).toBe(drink);
      expect(tapOf(s).batchLeft).toBe(before - 1); // exactly one steeped cup per drink
      expect(s.pass).toEqual([]);
    });
  }
});

describe('bots carry the condiment box (Task 15)', () => {
  /** A quiet Gear stand with an empty bar and `boxes` boxes in the corner. */
  const boxStand = (bots = 1, servings = 0, boxes = 1): GameState => {
    const s = tapStand(bots);
    s.customers = [];
    s.condiments = { servings };
    s.condimentBoxes = boxes;
    return s;
  };
  const isBox = (x: BotStep) => (x.kind === 'floor' && x.action === 'takeBox') || (x.kind === 'use' && x.action === 'refill');

  it('an idle bot with an empty bar and a box plans takeBox + refill, and stepped, fills the bar from the corner', () => {
    let s = boxStand();
    const plan = think(s, sim(s));
    expect(plan).toEqual([
      { kind: 'floor', node: boxNode(s), action: 'takeBox' },
      { kind: 'use', station: 'condiments', action: 'refill' },
    ]);
    for (let i = 0; i < 40 * TICK_RATE && s.condiments!.servings === 0; i++) s = step(s, []);
    expect(s.condiments!.servings).toBe(20);
    expect(s.condimentBoxes).toBe(0);
    expect(sim(s).tool).toBeNull();
    expect(s.log.find((e) => e.kind === 'condiment.refill')?.data).toEqual({ by: 'sim-1' });
  });

  it('a low bar counts; a bar above the low mark, or no box in the corner, does not', () => {
    expect(think(boxStand(1, BOX_LOW), sim(boxStand(1, BOX_LOW))).some(isBox)).toBe(true);
    const ok = boxStand(1, BOX_LOW + 1);
    expect(think(ok, sim(ok)).some(isBox)).toBe(false);
    const none = boxStand(1, 0, 0);
    expect(think(none, sim(none)).some(isBox)).toBe(false);
  });

  it('two bots never both plan it', () => {
    const s = boxStand(2);
    const a = think(s, sim(s, 1));
    expect(a.some(isBox)).toBe(true);
    sim(s, 1).bot!.plan = a;
    expect(think(s, sim(s, 2)).some(isBox)).toBe(false);
    // Nor while one is already carrying a box.
    sim(s, 1).bot!.plan = [];
    sim(s, 1).tool = 'box';
    expect(think(s, sim(s, 2)).some(isBox)).toBe(false);
  });

  it('an order it can make comes first: no box run planned, and a carried box goes back to the corner', () => {
    let s = boxStand();
    s.customers = [order(1, { drink: 'coldBrew', stage: 'pickup', rungAt: s.tick })];
    expect(think(s, sim(s)).some(isBox)).toBe(false);
    s.customers = [];
    const p = sim(s);
    p.tool = 'box';
    s.condimentBoxes = 0;
    p.bot!.plan = [{ kind: 'use', station: 'condiments', action: 'refill' }];
    s.customers = [order(1, { drink: 'coldBrew', stage: 'pickup', rungAt: s.tick })];
    s = step(s, []);
    expect(sim(s).tool).toBeNull();
    expect(s.condimentBoxes).toBe(1);
    expect(sim(s).bot!.claim).toBe(1);
  });

  it('a box in hand at a bar that someone else filled goes back to the corner', () => {
    let s = boxStand(1, 20, 0);
    const p = sim(s);
    p.tool = 'box';
    expect(think(s, p)).toEqual([{ kind: 'floor', node: expect.anything(), action: 'drop' }]);
    p.bot!.plan = think(s, p);
    p.bot!.thinkTicksLeft = 999;
    for (let i = 0; i < 10 * TICK_RATE && sim(s).tool !== null; i++) s = step(s, []);
    expect([sim(s).tool, s.condimentBoxes, s.condiments!.servings]).toEqual([null, 1, 20]);
  });

  it('on every tier, "use" at the box node takes the box (not the mop, not a station)', () => {
    for (const tier of ['stand', 'cart', 'cafe'] as const) {
      const s = startDay(createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, gear: true, ...(tier !== 'cafe' ? { tier } : {}) }));
      const n = boxNode(s);
      const corner = layoutFor(s.tier).boxCorner;
      expect(Math.hypot(n.x - corner.x, n.y - corner.y)).toBeLessThanOrEqual(ECONOMY.interactRangeTiles);
      expect(nearestStation(s, n)).toBeNull();
      s.condimentBoxes = 1;
      s.players[0].pos = { ...n };
      const t = step(s, [{ kind: 'move', playerId: 'p1', x: 0, y: 0, interact: true }]);
      expect([t.players[0].tool, t.condimentBoxes]).toEqual(['box', 0]);
    }
  });
});
