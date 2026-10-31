import { describe, it, expect } from 'vitest';
import { createRun, startDay } from '../run';
import { step, enterClosing } from '../step';
import { stationsFromSlots, type SlotContent } from '../slots';
import { BASE_DRINKS } from '../../data/drinks';
import { FRIDGE_ID } from '../../data/layout';
import type { GearId } from '../../data/gear';
import type { BotStep, Customer, DrinkId, GameState, Player, SimEvent, SupplyId } from '../types';
import { MILK_LOW, think } from './brain';
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
    s.milkOut = MILK_LOW; // low enough with a latte waiting: go now, ahead of running dry
    expect(ids(think(s, sim(s)))[0]).toBe(`${FRIDGE_ID}:fetch`);
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

  it('closing soon: once the doors lock, a bot lifts the milk and the bar and puts both in the fridge', () => {
    const s = shop();
    s.milkOut = 5;
    s.condiments = { servings: 12 };
    s.closingSoonAt = s.tick;
    expect(ids(think(s, sim(s)))).toEqual(['idle']); // doors still open: more walk-ins may want them
    s.phase = 'closing';
    s.phaseTicksLeft = 60 * 30;
    const { s: t, seen } = run(s, (x) => (x.milkOut ?? 0) === 0 && x.condiments!.servings === 0 && sim(x).tool === null, 60 * 40);
    expect(t.barAway).toBe(12);
    expect(seen.filter((e) => e.kind === 'fridge.put').map((e) => `${e.data.item}:${e.data.n}`).sort()).toEqual(['bar:12', 'milk:5']);
    expect(seen.some((e) => e.kind === 'supply.spoil')).toBe(false);
  });

  it('closing soon leaves the milk out while someone still wants a milk drink', () => {
    const s = shop();
    s.milkOut = 5;
    enterClosing(s);
    s.customers = [rung(1, 'latte')];
    const plan = ids(think(s, sim(s)));
    expect(plan.some((x) => x.endsWith(':stow'))).toBe(false);
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

  it('I2: an idle bot puts a carton out ahead of time while milk drinks are on the board (day only, not closing soon)', () => {
    const s = shop();
    expect(s.customers).toHaveLength(0);
    expect(ids(think(s, sim(s)))).toEqual([`${FRIDGE_ID}:fetch`, 'steamer:stock']);
    s.milkOut = 4; // enough out
    expect(ids(think(s, sim(s)))).toEqual(['idle']);
    s.milkOut = 0;
    s.closingSoonAt = s.tick;
    expect(ids(think(s, sim(s)))).toEqual(['idle']);
    const dry = shop();
    dry.supplies.milk = 0;
    expect(ids(think(dry, sim(dry)))).toEqual(['idle']);
  });

  it('I2: a carton on its way counts as milk out, so a latte is claimed and its shot started meanwhile', () => {
    const s = shop(2);
    s.customers = [rung(1, 'latte')];
    const first = think(s, sim(s, 1));
    expect(ids(first)).toEqual([`${FRIDGE_ID}:fetch`, 'steamer:stock']);
    sim(s, 1).bot!.plan = first;
    expect(ids(think(s, sim(s, 2)))[0]).toBe('grinder:insert');
    const t = shop(2);
    t.customers = [rung(1, 'latte')];
    sim(t, 1).tool = 'milk';
    sim(t, 1).carry = 3;
    expect(ids(think(t, sim(t, 2)))[0]).toBe('grinder:insert');
  });

  it('I3: the milk is put away once nothing is left to steam, even with a latte still waiting on the counter', () => {
    const s = shop();
    s.milkOut = 5;
    enterClosing(s);
    s.customers = [rung(1, 'latte')];
    s.pass.push({ item: 'latte', ticksLeft: 9999 }); // made, not yet collected
    expect(ids(think(s, sim(s)))).toEqual(['steamer:stow', `${FRIDGE_ID}:store`]);
  });

  it('I3: in the last 8 s of closing the milk and the bar go away whatever is still wanted', () => {
    const s = shop();
    s.milkOut = 5;
    s.condiments = { servings: 4 };
    enterClosing(s);
    s.customers = [rung(1, 'latte'), rung(2, 'drip')];
    expect(ids(think(s, sim(s))).some((x) => x.endsWith(':stow'))).toBe(false);
    s.phaseTicksLeft = 60 * 8;
    expect(ids(think(s, sim(s)))).toEqual(['steamer:stow', `${FRIDGE_ID}:store`]);
    s.milkOut = 0;
    expect(ids(think(s, sim(s)))).toEqual(['condiments:stow', `${FRIDGE_ID}:store`]);
  });

  it('balance: after the doors lock, a drink still to make comes before putting away (the closing waits for it); last call does not wait', () => {
    const s = shop();
    s.milkOut = 5;
    s.condiments = { servings: 4 };
    enterClosing(s);
    s.customers = [rung(1, 'espresso')];
    expect(ids(think(s, sim(s)))[0]).toBe('grinder:insert');
    // nothing left to make: now it goes away
    const t = shop();
    t.milkOut = 5;
    enterClosing(t);
    expect(ids(think(t, sim(t)))).toEqual(['steamer:stow', `${FRIDGE_ID}:store`]);
    // last call: away first, whatever is still to make
    s.phaseTicksLeft = 60 * 8;
    expect(ids(think(s, sim(s)))).toEqual(['steamer:stow', `${FRIDGE_ID}:store`]);
  });

  it('M2: no box is carried to the bar during closing soon (it would only be lifted back into the fridge)', () => {
    const s = shop();
    s.condiments = { servings: 0 };
    s.condimentBoxes = 3;
    s.milkOut = 6;
    expect(ids(think(s, sim(s)))).toContain('condiments:refill');
    s.closingSoonAt = s.tick;
    expect(ids(think(s, sim(s)))).not.toContain('condiments:refill');
  });

  it('re-review I-1: once the milk is put away at closing, no bot fetches it again for a latte already made', () => {
    const s = shop();
    s.milkOut = 0;
    enterClosing(s);
    s.customers = [rung(1, 'latte')];
    s.pass.push({ item: 'latte', ticksLeft: 9999 });
    expect(ids(think(s, sim(s)))).toEqual(['idle']);
  });

  it('re-review I-1: a carton already in hand at closing goes into the fridge once there is nothing left to steam', () => {
    const s = shop();
    enterClosing(s);
    const p = sim(s);
    p.tool = 'milk';
    p.carry = 6;
    p.bot!.plan = [{ kind: 'use', station: 'steamer', action: 'stock' }];
    const { s: t, seen } = run(s, (x) => sim(x).tool === null, 60 * 20);
    expect(seen.some((e) => e.kind === 'milk.out')).toBe(false);
    expect(seen.find((e) => e.kind === 'fridge.put')?.data).toMatchObject({ item: 'milk', n: 6 });
    expect(t.milkOut ?? 0).toBe(0);
  });

  it('re-review I-1: a latte that can\'t be made through closing causes no milk shuttle, and no carton goes out at last call', () => {
    const s = shop(2);
    s.milkOut = 5;
    s.supplies.beans = 0; // the latte can't be made: it stays on the queue to the end
    s.customers = [rung(1, 'latte')];
    enterClosing(s);
    const { seen } = run(s, (x) => x.phase !== 'closing', 60 * 40);
    expect(seen.filter((e) => e.kind === 'fridge.take').length).toBeLessThanOrEqual(1);
    expect(seen.filter((e) => e.kind === 'milk.out')).toHaveLength(0);
    const spoil = seen.find((e) => e.kind === 'supply.spoil' && e.data.item === 'milk');
    expect(spoil).toBeUndefined();
  });
});
