import { describe, it, expect } from 'vitest';
import { createRun, startDay } from '../run';
import { step, enterClosing } from '../step';
import { stationsFromSlots, type SlotContent } from '../slots';
import { BASE_DRINKS } from '../../data/drinks';
import { FRIDGE_ID } from '../../data/layout';
import type { GearId } from '../../data/gear';
import type { BotStep, Customer, DrinkId, GameState, Player, SimEvent, SupplyId } from '../types';
import { think } from './brain';
import { addStandIns } from './roster';
import { FRIDGE } from '../fridge';

/** A Gear café: grinder, E3, steamer, C2 tap, bin; `standIns` bots, no walk-ins, stocked but with no milk out. */
function shop(standIns = 1, slots: SlotContent[] = ['grinder', 'espresso', 'steamer', 'coldBrewTap', 'trash', null], gear: (GearId | null)[] = ['g2', 'e3', 's3', 'c2', 'b0', null]): GameState {
  let s = createRun({ seed: 2, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 600 }, gear: true });
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  s.slots = [...slots];
  s.slotGear = [...gear];
  s.stations = stationsFromSlots(undefined, s.slots, s.slotGear);
  s.unlocked = [...BASE_DRINKS];
  for (const d of s.unlocked) s.menu[d] = true;
  for (const k of Object.keys(s.supplies) as SupplyId[]) s.supplies[k] = 20;
  addStandIns(s, standIns);
  s = startDay(s);
  s.eventSchedule = [];
  s.condiments = { servings: 0 };
  s.players[0].pos = { x: 10, y: 5 };
  return s;
}

const sim = (s: GameState, n = 1): Player => s.players.find((p) => p.id === `sim-${n}`)!;
const rung = (id: number, drink: DrinkId): Customer => ({ id, drink, patienceLeft: 1e5, patienceMax: 1e5, stage: 'pickup', rungAt: 0 });
const ids = (plan: BotStep[]) => plan.map((x) => (x.kind === 'use' ? `${x.station}:${x.action}` : x.kind));

/** Step until `done`, collecting every log event seen on the way (the log is pruned as it goes). */
function run(state: GameState, done: (s: GameState) => boolean, max: number): { s: GameState; seen: SimEvent[] } {
  let s = state;
  const seen = new Map<number, SimEvent>();
  for (let i = 0; i < max && !done(s); i++) {
    s = step(s, []);
    for (const e of s.log) seen.set(e.seq, e);
  }
  return { s, seen: [...seen.values()] };
}

describe('FB2 A4: bots and the fridge', () => {
  it('with no milk out, a bot fetches a carton for a latte, puts it out, then makes the latte', () => {
    const s = shop();
    s.customers = [rung(1, 'latte')];
    expect(ids(think(s, sim(s)))).toEqual([`${FRIDGE_ID}:fetch`, 'steamer:stock']);
    const { s: t, seen } = run(s, (x) => x.today.served >= 1, 60 * 60);
    expect(t.today.served).toBe(1);
    expect(seen.some((e) => e.kind === 'fridge.take' && e.data.n === FRIDGE.carton)).toBe(true);
    expect(seen.some((e) => e.kind === 'milk.out')).toBe(true);
    expect(t.milkOut).toBe(FRIDGE.carton - 1);
    expect(t.supplies.milk).toBe(20 - FRIDGE.carton);
  });

  it('milk already out: no fetch; low milk out with a milk drink wanted: one bot of two fetches', () => {
    const s = shop(2);
    s.milkOut = 5;
    s.customers = [rung(1, 'latte')];
    expect(ids(think(s, sim(s))).includes(`${FRIDGE_ID}:fetch`)).toBe(false);
    const t = shop(2);
    t.milkOut = 1;
    t.customers = [rung(1, 'latte'), rung(2, 'cappuccino')];
    const first = think(t, sim(t, 1));
    sim(t, 1).bot!.plan = first;
    expect(ids(first)).toEqual([`${FRIDGE_ID}:fetch`, 'steamer:stock']);
    expect(ids(think(t, sim(t, 2))).includes(`${FRIDGE_ID}:fetch`)).toBe(false);
  });

  it('an empty fridge: no fetch, no latte claimed, the espresso still served, and nobody stalls', () => {
    const s = shop();
    s.supplies.milk = 0;
    s.customers = [rung(1, 'latte'), rung(2, 'espresso')];
    const { s: t } = run(s, (x) => x.today.served >= 1 && sim(x).bot!.plan.every((st) => st.kind === 'idle'), 60 * 60);
    expect(t.today.served).toBe(1);
    expect(t.customers.map((c) => c.drink)).toEqual(['latte']);
    expect([sim(t).tool, sim(t).holding]).toEqual([null, null]);
    // and it stays that way: no carton runs, no grabbing
    const { seen } = run(t, () => false, 60 * 10);
    expect(seen.some((e) => e.kind === 'fridge.take')).toBe(false);
  });

  it('closing soon: a bot lifts the milk and the bar and puts both in the fridge', () => {
    const s = shop();
    s.milkOut = 5;
    s.condiments = { servings: 12 };
    s.closingSoonAt = s.tick;
    const { s: t, seen } = run(s, (x) => (x.milkOut ?? 0) === 0 && x.condiments!.servings === 0 && sim(x).tool === null, 60 * 40);
    expect([t.supplies.milk, t.barAway]).toEqual([25, 12]);
    expect(seen.filter((e) => e.kind === 'fridge.put').map((e) => e.data.item).sort()).toEqual(['bar', 'milk']);
  });

  it('closing soon leaves the milk out while someone still wants a milk drink', () => {
    const s = shop();
    s.milkOut = 5;
    s.closingSoonAt = s.tick;
    s.customers = [rung(1, 'latte')];
    const plan = ids(think(s, sim(s)));
    expect(plan.some((x) => x.endsWith(':lift'))).toBe(false);
    expect(plan[0]).toBe('grinder:insert');
  });

  it('the day waits for the bots to put things away, so nothing goes bad', () => {
    let s = shop();
    s.milkOut = 5;
    s.condiments = { servings: 12 };
    enterClosing(s);
    const { s: t, seen } = run(s, (x) => x.phase !== 'closing', 60 * 40);
    expect(t.phase).toBe('night');
    expect(seen.some((e) => e.kind === 'supply.spoil')).toBe(false);
    expect(t.days.at(-1)!.spoiledBar).toBeUndefined();
    expect(t.barAway).toBe(12);
  });
});
