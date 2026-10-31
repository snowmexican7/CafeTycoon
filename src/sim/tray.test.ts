import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { ensureCounterSpots, stationsFromSlots } from './slots';
import { interact } from './stations';
import { resolveDrops } from './drop';
import { stepPickup } from './pickup';
import { stepBumps } from './bumps';
import { finishDay } from './closing';
import { makeTicket } from './orders';
import { blocked, nearestStation } from './movement';
import { findPath, targetNodes, walkableNodes } from './bots/path';
import { uncoveredOrders } from './bots/brain';
import { rngNext } from './rng';
import { COOLING_SECONDS } from './cooling';
import { TICK_RATE } from './constants';
import { ECONOMY } from '../data/economy';
import { GEAR, type GearId } from '../data/gear';
import { EQUIPMENT_KINDS } from '../data/equipment';
import { LAYOUT, TRAY_ID, layoutFor } from '../data/layout';
import { TRAY, trayCool, trayComplete } from './tray';
import type { Customer, DrinkId, GameState, Player, SupplyId, TierId } from './types';

type Kit = GearId | 'steamer';

function gearDay(tier: TierId = 'cart', gear: Kit[] = ['c1', 'e1', 'steamer', 'd1'], bots = 0): GameState {
  const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'L' }], settings: { bots }, tier, gear: true });
  const slots = [...s.slots!];
  const slotGear = [...s.slotGear!];
  gear.forEach((id, i) => {
    slots[i] = id === 'steamer' ? 'steamer' : GEAR[id].station;
    slotGear[i] = id === 'steamer' ? null : id;
  });
  s.slots = slots;
  s.slotGear = slotGear;
  s.stations = stationsFromSlots(s.tier, slots, slotGear);
  s.day = 2;
  const out = startDay(s);
  for (const k of ['beans', 'milk', 'concentrate'] as SupplyId[]) out.supplies[k] = 99;
  out.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  return out;
}

const p1 = (s: GameState): Player => s.players[0]!;
const p2 = (s: GameState): Player => s.players[1]!;
const events = (s: GameState, kind: string) => s.log.filter((e) => e.kind === kind).map((e) => e.data);
const at = (s: GameState, id: string) => s.stations.find((x) => x.id === id)!;

let nextId = 50;
/** A multi-drink ticket (rung up and at pickup unless `more` says otherwise). */
function ticket(s: GameState, drinks: DrinkId[], more: Partial<Customer> = {}): Customer {
  const c: Customer = { id: nextId++, drink: drinks[0], patienceLeft: 900, patienceMax: 1800, stage: 'pickup', rungAt: s.tick, order: 'combo', ...more };
  makeTicket(c, drinks);
  s.customers.push(c);
  return c;
}

/** `who` stands at the tray table (the tile to its right) holding `drink` (made at `madeAt`). */
function atTable(s: GameState, who: Player, drink: DrinkId | null, madeAt?: number): void {
  const t = layoutFor(s.tier).trayTable;
  who.pos = { x: t.x + 1, y: t.y };
  who.holding = drink;
  if (madeAt !== undefined) who.heldSince = madeAt;
  else delete who.heldSince;
}

/** `who` stands at the pickup counter (above it). */
function atPickup(s: GameState, who: Player): void {
  const pk = layoutFor(s.tier).pickup;
  who.pos = { x: pk.x, y: pk.y - 1 };
}

/** Set `drink` down on the table as p1 (E). */
function setDown(s: GameState, drink: DrinkId, who: Player = p1(s), madeAt?: number): void {
  atTable(s, who, drink, madeAt);
  interact(s, who.id);
}

describe('FB2 B7: the tray table fixture', () => {
  it('every Gear tier has it at (1,4), a counter-kind spot reached from (2,4), sharing no tile with any other station', () => {
    const near = (n: { x: number; y: number }, p: { x: number; y: number }) => Math.hypot(n.x - p.x, n.y - p.y) <= ECONOMY.interactRangeTiles;
    const FULL: Record<TierId, Kit[]> = {
      stand: ['d1', 'e1', 'steamer', 'b0'],
      cart: ['g1', 'e1', 'steamer', 'd1', 'b0'],
      cafe: ['g1', 'e1', 'steamer', 'd1', 'c1', 'b0'],
    };
    expect(TRAY_ID).toBe('trayTable');
    for (const tier of ['stand', 'cart', 'cafe'] as const) {
      const s = createRun({ seed: 7, hostId: 'p1', players: [], settings: { bots: 0 }, tier, gear: true });
      s.slotGear = FULL[tier].map((id) => (id === 'steamer' ? null : id));
      s.slots = FULL[tier].map((id) => (id === 'steamer' ? 'steamer' : GEAR[id].station));
      s.stations = stationsFromSlots(s.tier, s.slots, s.slotGear);
      s.fridge = s.fridge ?? 'f1';
      ensureCounterSpots(s);
      const pos = layoutFor(tier).trayTable;
      expect(pos).toEqual({ x: 1, y: 4 });
      const table = at(s, TRAY_ID);
      expect(table).toEqual({ id: TRAY_ID, kind: 'counter', pos, busyTicksLeft: 0, output: null, occupiedBy: null });
      expect(targetNodes(s, table, LAYOUT.door)).toEqual([{ x: 2, y: 4 }]);
      for (const n of walkableNodes(s).filter((x) => near(x, pos))) {
        for (const o of s.stations) if (o !== table) expect(near(n, o.pos), `${tier} ${o.id} shares ${n.x},${n.y}`).toBe(false);
      }
      for (const o of s.stations) expect(targetNodes(s, o, LAYOUT.door).length, `${tier} ${o.id}`).toBeGreaterThan(0);
      expect(findPath(s, LAYOUT.rogueStart, LAYOUT.door)).not.toBeNull();
      expect(findPath(s, LAYOUT.door, { x: 1, y: 5 })).not.toBeNull();
      const l = layoutFor(tier);
      for (const spot of [...LAYOUT.spawnPoints, LAYOUT.door, l.mopHome, l.boxCorner]) {
        expect(blocked(spot, [table], l.width), `${tier} ${spot.x},${spot.y}`).toBe(false);
        expect(nearestStation(s, spot)?.id).not.toBe(TRAY_ID);
      }
      expect(Math.hypot(pos.x - 6, pos.y - 6)).toBeGreaterThan(2); // clear of the bots' idle tiles by the till
    }
  });

  it('classic runs have none; it is not gear, equipment or a slot; old saves get it once', () => {
    for (const tier of ['stand', 'cart', 'cafe'] as const) {
      expect(createRun({ seed: 7, hostId: 'p1', players: [], settings: { bots: 0 }, tier }).stations.some((x) => x.id === TRAY_ID)).toBe(false);
    }
    expect(Object.values(GEAR).some((g) => (g.station as string) === TRAY_ID)).toBe(false);
    expect((EQUIPMENT_KINDS as string[]).includes(TRAY_ID)).toBe(false);
    const s = gearDay();
    expect(s.slots).not.toContain(TRAY_ID);
    s.stations = s.stations.filter((x) => x.id !== TRAY_ID);
    ensureCounterSpots(s);
    ensureCounterSpots(s);
    expect(s.stations.filter((x) => x.id === TRAY_ID)).toHaveLength(1);
  });
});

describe('FB2 B7: claiming and filling a tray', () => {
  it('a drink set down on the empty table claims the oldest multi-drink ticket that needs it', () => {
    const s = gearDay();
    const a = ticket(s, ['drip', 'drip']); // older, but no latte on it
    const b = ticket(s, ['latte', 'drip']);
    const c = ticket(s, ['latte', 'latte']);
    setDown(s, 'latte', p1(s), s.tick - 20);
    expect(p1(s).holding).toBeNull();
    expect(p1(s).heldSince).toBeUndefined();
    expect(s.tray).toEqual({
      customer: b.id,
      items: [
        { drink: 'latte', done: true, by: 'p1', madeAt: s.tick - 20 },
        { drink: 'drip', done: false },
      ],
    });
    expect(events(s, 'tray.claim')).toEqual([{ customer: b.id, by: 'p1' }]);
    expect(events(s, 'tray.add')).toEqual([{ drink: 'latte', by: 'p1', customer: b.id }]);
    expect([a, c].every((x) => x.items!.every((i) => !i.done))).toBe(true);
    expect(b.items!.every((i) => !i.done)).toBe(true); // the ticket itself ticks only when the customer takes the cup
  });

  it('a single never gets a tray: a drink no multi-drink ticket needs is refused and stays in hand', () => {
    const s = gearDay();
    s.customers.push({ id: 9, drink: 'latte', patienceLeft: 900, patienceMax: 900, stage: 'pickup', rungAt: s.tick });
    setDown(s, 'latte');
    expect(s.tray).toBeUndefined();
    expect(p1(s).holding).toBe('latte');
    expect(events(s, 'tray.refuse')).toEqual([{ drink: 'latte', by: 'p1' }]);
  });

  it('later drinks join only while the ticket still needs them; others are refused and stay in hand', () => {
    const s = gearDay();
    const b = ticket(s, ['latte', 'drip']);
    ticket(s, ['espresso', 'espresso']); // another ticket's drink still can't join this tray
    setDown(s, 'latte');
    setDown(s, 'latte', p2(s)); // the ticket needs one latte, already on the tray
    expect(p2(s).holding).toBe('latte');
    setDown(s, 'espresso', p2(s));
    expect(p2(s).holding).toBe('espresso');
    expect(events(s, 'tray.refuse')).toEqual([
      { drink: 'latte', by: 'p2', customer: b.id },
      { drink: 'espresso', by: 'p2', customer: b.id },
    ]);
    p2(s).holding = null;
    setDown(s, 'drip', p2(s));
    expect(p2(s).holding).toBeNull();
    expect(s.tray!.items.map((x) => [x.drink, x.done, x.by])).toEqual([['latte', true, 'p1'], ['drip', true, 'p2']]);
    expect(trayComplete(s.tray!)).toBe(true);
    expect(events(s, 'tray.add')).toHaveLength(2);
  });

  it('R (drop) at the table sets the drink down the same way; grounds are never taken', () => {
    const s = gearDay();
    const b = ticket(s, ['latte', 'drip']);
    atTable(s, p1(s), null);
    p1(s).holding = 'grounds';
    p1(s).dropQueued = true;
    resolveDrops(s);
    expect(p1(s).holding).toBe('grounds');
    expect(s.tray).toBeUndefined();
    atTable(s, p1(s), 'latte');
    p1(s).dropQueued = true;
    resolveDrops(s);
    expect(p1(s).holding).toBeNull();
    expect(s.tray?.customer).toBe(b.id);
    expect(s.pass).toHaveLength(0); // never sent on to the pickup counter
  });

  it('a cup the customer takes off the pickup counter instead drops its line; they never take one the tray covers', () => {
    const s = gearDay();
    const b = ticket(s, ['latte', 'drip', 'latte']);
    setDown(s, 'latte');
    s.pass.push({ item: 'latte', ticksLeft: 999, by: 'p2', madeAt: s.tick });
    s.pass.push({ item: 'drip', ticksLeft: 999, by: 'p2', madeAt: s.tick });
    stepPickup(s);
    // The second latte and the drip came off the counter; the tray's latte covers the last item.
    expect(b.items!.filter((x) => x.done).map((x) => x.drink).sort()).toEqual(['drip', 'latte']);
    expect(s.tray!.items).toEqual([{ drink: 'latte', done: true, by: 'p1', madeAt: s.tick }]);
    expect(trayComplete(s.tray!)).toBe(true);
    s.pass.push({ item: 'latte', ticksLeft: 999, by: 'p2', madeAt: s.tick });
    stepPickup(s);
    expect(s.pass).toHaveLength(1); // left for someone else: the tray covers this ticket's last latte
    expect(s.customers).toContain(b);
  });
});

describe('FB2 B7: carrying the tray', () => {
  function fullTray(s: GameState): Customer {
    const b = ticket(s, ['latte', 'drip']);
    setDown(s, 'latte');
    setDown(s, 'drip');
    return b;
  }

  it('empty hands pick it up only when it holds everything the ticket still needs', () => {
    const s = gearDay();
    const b = ticket(s, ['latte', 'drip']);
    setDown(s, 'latte');
    atTable(s, p1(s), null);
    interact(s, 'p1');
    expect(p1(s).tool).toBeNull();
    expect(s.tray?.customer).toBe(b.id);
    setDown(s, 'drip');
    atTable(s, p1(s), null);
    interact(s, 'p1');
    expect(p1(s).tool).toBe('tray');
    expect(p1(s).tray?.customer).toBe(b.id);
    expect(p1(s).tray?.items.map((x) => x.drink)).toEqual(['latte', 'drip']);
    expect(s.tray).toBeUndefined(); // the table is free for the next ticket
    expect(events(s, 'tray.pick')).toEqual([{ by: 'p1', customer: b.id }]);
    // Carry one tray: a second full tray stays on the table.
    const c = ticket(s, ['espresso', 'espresso']);
    setDown(s, 'espresso', p2(s));
    setDown(s, 'espresso', p2(s));
    p1(s).pos = { x: 2, y: 4 };
    interact(s, 'p1');
    expect(p1(s).tray?.customer).toBe(b.id);
    expect(s.tray?.customer).toBe(c.id);
  });

  it('E or R at the pickup counter puts it down as one slot tagged to that customer; elsewhere nothing happens', () => {
    const s = gearDay();
    const b = fullTray(s);
    atTable(s, p1(s), null);
    interact(s, 'p1');
    p1(s).pos = { x: 4, y: 3 }; // open floor: nothing happens
    interact(s, 'p1');
    p1(s).dropQueued = true;
    resolveDrops(s);
    expect(p1(s).tool).toBe('tray');
    atPickup(s, p1(s));
    interact(s, 'p1');
    expect(p1(s).tool).toBeNull();
    expect(p1(s).tray).toBeUndefined();
    expect(s.pass).toHaveLength(1);
    expect(s.pass[0]).toMatchObject({ item: 'latte', by: 'p1', tray: { customer: b.id, drinks: [{ drink: 'latte', by: 'p1' }, { drink: 'drip', by: 'p1' }] } });
    expect(events(s, 'tray.put')).toEqual([{ by: 'p1', customer: b.id }]);

    const r = gearDay();
    const rb = fullTray(r);
    atTable(r, p1(r), null);
    interact(r, 'p1');
    atPickup(r, p1(r));
    p1(r).dropQueued = true;
    resolveDrops(r);
    expect(r.pass.map((x) => x.tray?.customer)).toEqual([rb.id]);
  });

  it('a full pickup counter keeps the tray in hand', () => {
    const s = gearDay();
    fullTray(s);
    atTable(s, p1(s), null);
    interact(s, 'p1');
    for (let i = 0; i < 4; i++) s.pass.push({ item: 'coldBrew', ticksLeft: 999 });
    atPickup(s, p1(s));
    interact(s, 'p1');
    expect(p1(s).tool).toBe('tray');
    expect(s.pass).toHaveLength(4);
  });

  it('only that customer takes it, all at once, and the ticket pays; singles never take from it', () => {
    const s = gearDay();
    const b = fullTray(s);
    b.stage = 'order'; // not rung up yet: the tray waits for them
    const single: Customer = { id: 8, drink: 'latte', patienceLeft: 900, patienceMax: 900, stage: 'pickup', rungAt: s.tick - 100 };
    s.customers.unshift(single);
    atTable(s, p1(s), null);
    interact(s, 'p1');
    atPickup(s, p1(s));
    interact(s, 'p1');
    // Empty hands at pickup never take the tray back.
    p2(s).holding = null;
    atPickup(s, p2(s));
    interact(s, 'p2');
    expect(p2(s).holding).toBeNull();
    stepPickup(s);
    expect(s.pass).toHaveLength(1);
    expect(s.customers).toContain(single);
    b.stage = 'pickup';
    const cash = s.cash;
    stepPickup(s);
    expect(s.pass).toHaveLength(0);
    expect(s.customers).not.toContain(b);
    expect(s.customers).toContain(single);
    expect(events(s, 'tray.take')).toEqual([{ customer: b.id }]);
    expect(events(s, 'order.done').map((e) => e.customer)).toEqual([b.id]);
    expect(s.cash).toBeGreaterThan(cash);
  });

  it('a carried tray spills on a bump at 3× the normal chance: every cup wasted, the ticket still waits', () => {
    expect(TRAY.spillMul).toBe(3);
    const chance = ECONOMY.bump.spillChance;
    // An rng state whose next roll lands between the cup's chance and the tray's.
    let r = 1;
    const roll = (x: number) => rngNext({ rng: x });
    while (!(roll(r) >= chance && roll(r) < chance * TRAY.spillMul)) r += 1;
    let miss = 1;
    while (!(roll(miss) >= chance * TRAY.spillMul)) miss += 1;

    const bumped = (rng: number, carry: 'tray' | 'latte') => {
      const s = gearDay();
      const b = fullTray(s);
      if (carry === 'tray') {
        atTable(s, p1(s), null);
        interact(s, 'p1');
      } else p1(s).holding = 'latte';
      p1(s).pos = { x: 4, y: 3 };
      p2(s).pos = { x: 4.5, y: 3 };
      p1(s).moveDir = { x: 1, y: 0 };
      p2(s).moveDir = { x: -1, y: 0 };
      s.rng = rng;
      const wasted = s.today.wasted;
      stepBumps(s);
      return { s, b, wasted };
    };
    const hit = bumped(r, 'tray');
    expect(hit.s.players[0]!.tool).toBeNull();
    expect(hit.s.players[0]!.tray).toBeUndefined();
    expect(events(hit.s, 'tray.spill')).toEqual([{ by: 'p1', customer: hit.b.id, cups: 2 }]);
    expect((hit.s.today.wasted ?? 0) - (hit.wasted ?? 0)).toBe(2);
    expect(hit.s.messes.some((m) => m.kind === 'spill')).toBe(true);
    expect(hit.s.customers).toContain(hit.b);
    expect(hit.b.items!.every((x) => !x.done)).toBe(true);
    expect(hit.s.tray).toBeUndefined();
    // The same roll leaves a single cup in hand (the normal chance), and a higher roll leaves the tray alone.
    expect(bumped(r, 'latte').s.players[0]!.holding).toBe('latte');
    const safe = bumped(miss, 'tray');
    expect(safe.s.players[0]!.tool).toBe('tray');
    expect(events(safe.s, 'tray.spill')).toEqual([]);
  });
});

describe('FB2 B7: cups on a tray cool like any cup', () => {
  it('each cup keeps its made tick from hand to table, hand and counter; a cold one is taken unpaid', () => {
    const s = gearDay();
    const b = ticket(s, ['latte', 'drip']);
    const coldAt = s.tick - Math.round(COOLING_SECONDS.latte! * TICK_RATE) - 5;
    setDown(s, 'latte', p1(s), coldAt);
    setDown(s, 'drip', p1(s), s.tick - 3);
    expect(s.tray!.items.map((x) => x.madeAt)).toEqual([coldAt, s.tick - 3]);
    expect(trayCool(s, s.tray!.items[0]!)).toBe(1);
    expect(trayCool(s, s.tray!.items[1]!)).toBeLessThan(0.5);
    atTable(s, p1(s), null);
    interact(s, 'p1');
    expect(p1(s).tray!.items.map((x) => x.madeAt)).toEqual([coldAt, s.tick - 3]);
    atPickup(s, p1(s));
    interact(s, 'p1');
    expect(s.pass[0]!.tray!.drinks.map((x) => x.madeAt)).toEqual([coldAt, s.tick - 3]);
    expect(s.pass[0]!.madeAt).toBeUndefined(); // the slot itself has no clock: the cups do
    stepPickup(s);
    expect(events(s, 'pickup.cold')).toEqual([{ customer: b.id, drink: 'latte' }]);
    expect(events(s, 'order.done')).toHaveLength(1);
    expect(s.customers).not.toContain(b);
  });

  it('the tray slot never goes stale on the pass timer', () => {
    const s = gearDay();
    // Espresso without a clock would go stale on the pass in 45 s; the tray slot stays.
    const b = ticket(s, ['espresso', 'espresso'], { stage: 'order', patienceLeft: 99_999, patienceMax: 99_999 });
    setDown(s, 'espresso');
    setDown(s, 'espresso');
    atTable(s, p1(s), null);
    interact(s, 'p1');
    atPickup(s, p1(s));
    interact(s, 'p1');
    let t = s;
    for (let i = 0; i < (ECONOMY.pass.staleSeconds.espresso + 5) * TICK_RATE; i++) t = step(t, []);
    expect(t.pass.map((x) => x.tray?.customer)).toEqual([b.id]);
  });
});

describe('FB2 B7: a ticket that leaves', () => {
  it('voids its tray wherever it is (table, hand, counter): the cups are wasted, the table is free', () => {
    for (const where of ['table', 'hand', 'counter'] as const) {
      const s = gearDay();
      const b = ticket(s, ['latte', 'drip']);
      setDown(s, 'latte');
      setDown(s, 'drip');
      if (where !== 'table') {
        atTable(s, p1(s), null);
        interact(s, 'p1');
      }
      if (where === 'counter') {
        atPickup(s, p1(s));
        interact(s, 'p1');
        b.stage = 'order'; // not at pickup, so the tray waits on the counter
      }
      const wasted = s.today.wasted;
      b.patienceLeft = 1;
      const t = step(s, []);
      expect(t.customers.some((c) => c.id === b.id), where).toBe(false);
      expect(t.tray, where).toBeUndefined();
      expect(t.players[0]!.tool, where).toBeNull();
      expect(t.players[0]!.tray, where).toBeUndefined();
      expect(t.pass, where).toHaveLength(0);
      expect(events(t, 'tray.void'), where).toEqual([{ customer: b.id, cups: 2 }]);
      expect((t.today.wasted ?? 0) - (wasted ?? 0), where).toBe(2);
    }
  });

  it('an office run that leaves wastes nothing; closing clears every tray', () => {
    const s = gearDay();
    const o = ticket(s, ['latte', 'drip'], { order: 'office' });
    setDown(s, 'latte');
    const wasted = s.today.wasted;
    o.patienceLeft = 1;
    const t = step(s, []);
    expect(t.tray).toBeUndefined();
    expect(t.today.wasted).toBe(wasted);

    const c = gearDay();
    ticket(c, ['latte', 'drip']);
    setDown(c, 'latte');
    setDown(c, 'drip');
    atTable(c, p1(c), null);
    interact(c, 'p1');
    ticket(c, ['espresso', 'drip']);
    setDown(c, 'espresso', p2(c));
    finishDay(c);
    expect(c.tray).toBeUndefined();
    expect(c.players.every((p) => p.tool === null && p.tray === undefined)).toBe(true);
  });
});

describe('FB2 B7: bots', () => {
  it('count cups on a tray as covering their ticket, and never use the table', () => {
    const s = gearDay('cart', ['c1', 'e1', 'steamer', 'd1'], 1);
    const bot = s.players.find((p) => p.bot)!;
    s.unlocked = [...(s.unlocked ?? []), 'drip', 'latte'];
    s.menu.drip = true;
    s.menu.latte = true;
    const b = ticket(s, ['latte', 'drip', 'latte']);
    setDown(s, 'latte');
    const mine = uncoveredOrders(s, bot).filter((o) => o.id === b.id).map((o) => o.drink);
    expect(mine.sort()).toEqual(['drip', 'latte']);
    setDown(s, 'drip');
    setDown(s, 'latte', p2(s));
    expect(uncoveredOrders(s, bot).filter((o) => o.id === b.id)).toEqual([]);
  });

  it('a bot-only Gear day never touches a tray and keeps serving', () => {
    const s0 = createRun({ seed: 11, hostId: 'p1', players: [], settings: { bots: 2 }, tier: 'cart', gear: true });
    s0.day = 3;
    let s = startDay(s0);
    for (const k of ['beans', 'milk', 'concentrate'] as SupplyId[]) s.supplies[k] = 99;
    let trays = 0;
    for (let i = 0; i < 60 * TICK_RATE && s.phase === 'day'; i++) {
      s = step(s, []);
      trays += s.log.filter((e) => e.kind.startsWith('tray.')).length;
      expect(s.tray).toBeUndefined();
    }
    expect(trays).toBe(0);
    expect(s.players.every((p) => p.tool !== 'tray')).toBe(true);
  });
});
