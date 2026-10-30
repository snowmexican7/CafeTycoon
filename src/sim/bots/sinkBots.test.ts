import { describe, it, expect } from 'vitest';
import { createRun, startDay } from '../run';
import { step } from '../step';
import { stationsFromSlots, type SlotContent } from '../slots';
import { BASE_DRINKS } from '../../data/drinks';
import type { GearId } from '../../data/gear';
import type { BotStep, Customer, DrinkId, GameState, Player, Station, SupplyId } from '../types';
import { think } from './brain';
import { addStandIns } from './roster';

/** A café-tier Gear run with the bar set by hand, `standIns` stand-in bots, p1 parked, no walk-ins, drip on the menu. */
function gearShop(slots: SlotContent[], gear: (GearId | null)[], standIns = 1): GameState {
  let s = createRun({ seed: 2, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 600 }, gear: true });
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  s.slots = [...slots];
  s.slotGear = [...gear];
  s.stations = stationsFromSlots('cafe', s.slots, s.slotGear);
  s.unlocked = [...BASE_DRINKS, 'drip'];
  for (const d of s.unlocked) s.menu[d] = true;
  for (const k of Object.keys(s.supplies) as SupplyId[]) s.supplies[k] = 99;
  addStandIns(s, standIns);
  s = startDay(s);
  s.eventSchedule = [];
  s.players[0].pos = { x: 6, y: 5 };
  return s;
}

const POT = () => gearShop(['drip', 'espresso', 'trash', null, null, null], ['d2', 'e1', 'b0', null, null, null]);
const sim = (s: GameState, n = 1): Player => s.players.find((p) => p.id === `sim-${n}`)!;
const station = (s: GameState, id: string): Station => s.stations.find((x) => x.id === id)!;
const ids = (plan: BotStep[]) => plan.map((x) => (x.kind === 'use' ? `${x.station}:${x.action}` : x.kind));
const rung = (id: number, drink: DrinkId): Customer => ({ id, drink, patienceLeft: 100_000, patienceMax: 100_000, stage: 'pickup', rungAt: 0 });

/** Step until `done`, collecting every logged event of `kind` (the log is pruned as it goes). */
function runUntil(state: GameState, done: (s: GameState) => boolean, maxTicks: number, kind = 'sink.dump') {
  let s = state;
  const seen = new Map<number, Record<string, unknown>>();
  for (let i = 0; i < maxTicks && !done(s); i++) {
    s = step(s, []);
    for (const e of s.log) if (e.kind === kind) seen.set(e.seq, e.data);
  }
  if (!done(s)) throw new Error(`condition not met within ${maxTicks} ticks`);
  return { s, seen: [...seen.values()] };
}

describe('FB2 A3: bots and the sink', () => {
  it('a stale pot and a drip order: lift, dump at the sink, brew, pour, set down', () => {
    const s0 = POT();
    station(s0, 'drip').stale = true;
    s0.customers = [rung(1, 'drip')];
    expect(ids(think(s0, sim(s0)))).toEqual(['drip:lift', 'sink:dump', 'drip:insert', 'drip:take', 'pickup:put']);
    const { s, seen } = runUntil(s0, (x) => x.customers.length === 0, 60 * 90);
    expect(seen).toEqual([{ by: 'sim-1', item: 'pot' }]);
    expect(s.today.drinks!.drip).toBe(1);
    expect([station(s, 'drip').stale, station(s, 'drip').potOut, sim(s).tool]).toEqual([undefined, undefined, null]);
  });

  it('two bots, one stale pot, two drip orders: one dumps, both are served, nobody stalls', () => {
    const s0 = gearShop(['drip', 'espresso', 'trash', null, null, null], ['d2', 'e1', 'b0', null, null, null], 2);
    station(s0, 'drip').stale = true;
    s0.customers = [rung(1, 'drip'), rung(2, 'drip')];
    const { s, seen } = runUntil(s0, (x) => x.customers.length === 0, 60 * 120);
    expect(seen.filter((d) => d.item === 'pot')).toHaveLength(1);
    expect(s.today.drinks!.drip).toBe(2);
  });

  it('the pot goes cold while the bot walks over: it lifts and dumps it there, then brews', () => {
    const s0 = POT();
    const d = station(s0, 'drip');
    d.output = 'drip';
    d.potLeft = 3;
    d.potColdAt = s0.tick + 30; // hot when planned, cold on arrival
    s0.customers = [rung(1, 'drip')];
    expect(ids(think(s0, sim(s0)))).toEqual(['drip:insert', 'drip:take', 'pickup:put']);
    const { s, seen } = runUntil(s0, (x) => x.customers.length === 0, 60 * 90);
    expect(seen.map((x) => x.item)).toEqual(['pot']);
    expect(s.today.drinks!.drip).toBe(1);
  });

  it('nothing to do: an idle bot pours a cold pot down the sink (not when a person stands at the machine)', () => {
    const s0 = POT();
    const d = station(s0, 'drip');
    d.output = 'drip';
    d.potLeft = 4;
    d.potColdAt = s0.tick - 1;
    const { s } = runUntil(s0, (x) => station(x, 'drip').potLeft === undefined && station(x, 'drip').potOut === undefined, 60 * 30);
    expect([station(s, 'drip').output, sim(s).tool]).toEqual([null, null]);

    const t = POT();
    t.stations.find((x) => x.id === 'drip')!.stale = true;
    t.players[0].pos = { x: 1, y: 2 }; // p1 at the drip machine
    let u = t;
    for (let i = 0; i < 60 * 10; i++) u = step(u, []);
    expect(station(u, 'drip').stale).toBe(true);
    expect(sim(u).tool).toBeNull();
  });

  it('a bot carrying a pot takes it to the sink', () => {
    const s = POT();
    station(s, 'drip').potOut = 'sim-1';
    sim(s).tool = 'pot';
    expect(ids(think(s, sim(s)))).toEqual(['sink:dump']);
  });

  it('a drink with nowhere to go: down the sink when it is as close as the bin, else the bin', () => {
    const s = POT();
    for (let i = 0; i < 4; i++) s.pass.push({ item: 'espresso', ticksLeft: 99_999 });
    s.customers = [rung(1, 'latte')];
    const p = sim(s);
    p.holding = 'drip';
    p.pos = { x: 10, y: 3 }; // beside the sink (11, 3)
    expect(ids(think(s, p))).toEqual(['sink:dump']);
    p.holding = 'drip';
    p.pos = { x: 5, y: 2 }; // beside the bin (5, 1)
    expect(ids(think(s, p))).toEqual(['trash:trash']);
    p.holding = 'grounds';
    p.pos = { x: 10, y: 3 };
    expect(ids(think(s, p))).toEqual(['trash:trash']); // grounds never go down the sink
  });

  it('Gear: a bot with nothing to make mops even a single mess (classic waits for a dirtier floor)', () => {
    const s = POT();
    s.messes = [{ id: s.nextMessId++, kind: 'spill', x: 6, y: 4, amount: 1 }];
    expect(ids(think(s, sim(s)))[0]).toBe('floor');
    expect(think(s, sim(s))[0]).toMatchObject({ kind: 'floor', action: 'takeMop' });
    const c = startDay(createRun({ seed: 2, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } }));
    addStandIns(c, 1);
    c.messes = [{ id: c.nextMessId++, kind: 'spill', x: 6, y: 4, amount: 1 }];
    expect(think(c, sim(c)).some((x) => x.kind === 'floor')).toBe(false);
  });

  it('Gear: orders come first, a mop trip included (fix round 1, I2)', () => {
    let s = POT();
    s.messes = [{ id: s.nextMessId++, kind: 'spill', x: 6, y: 4, amount: 1 }];
    let guard = 0;
    while (sim(s).tool !== 'mop' && guard++ < 60 * 20) s = step(s, []);
    expect(sim(s).tool).toBe('mop');
    s.customers = [rung(1, 'espresso')];
    s = step(s, []);
    expect([sim(s).tool, sim(s).bot!.claim]).toEqual([null, 1]);
    expect(s.mop.heldBy).toBeNull();
  });
});
