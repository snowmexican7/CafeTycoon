import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { finishDay } from './closing';
import { interact, recipeAt } from './stations';
import { ensureCounterSpots, stationsFromSlots } from './slots';
import { stationLeft } from './counts';
import { FRIDGE, closingChecklist, startClosingSoon, stockOf, supplyWants } from './fridge';
import { ECONOMY } from '../data/economy';
import { recipeChain, TAP_DRINKS } from '../data/drinks';
import { FRIDGE_ID, SUPPLY_ID } from '../data/layout';
import { GEAR, type GearId } from '../data/gear';
import { addStandIns } from '../harness/crew';
import { TICK_RATE } from './constants';
import type { DrinkId, GameState, SimEvent, TierId } from './types';

/** Round 6 block 4: the milk counter (SUPPLY_ID) is stocked from the fridge, and the cold milk drinks finish there. */

type Kit = GearId | 'steamer';

function gearNight(gear: Kit[], tier: TierId = 'stand'): GameState {
  const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], tier, gear: true });
  const slots = [...s.slots!];
  const slotGear = [...s.slotGear!];
  gear.forEach((id, i) => {
    slots[i] = id === 'steamer' ? 'steamer' : GEAR[id].station;
    slotGear[i] = id === 'steamer' ? null : id;
  });
  s.slots = slots;
  s.slotGear = slotGear;
  s.stations = stationsFromSlots(s.tier, slots, slotGear);
  if (tier === 'stand') s.fridge = 'f1';
  ensureCounterSpots(s);
  return s;
}

/** A Gear day with iced latte and sweet cream known and on the menu; 20 milk in the fridge, nothing out. */
function gearDay(gear: Kit[] = ['c1', 'steamer']): GameState {
  const s = gearNight(gear);
  s.supplies.milk = 20;
  s.supplies.concentrate = 20;
  s.supplies.beans = 20;
  s.unlocked = [...new Set([...(s.unlocked ?? []), 'icedLatte', 'sweetCream'] as DrinkId[])];
  s.menu.icedLatte = true;
  s.menu.sweetCream = true;
  const d = startDay(s);
  d.milkOut = 0;
  d.supplyMilk = 0;
  return d;
}

const me = (s: GameState) => s.players[0]!;
const at = (s: GameState, id: string) => s.stations.find((x) => x.id === id)!;
const logs = (s: GameState, kind: string): SimEvent[] => s.log.filter((e) => e.kind === kind);
const standAt = (s: GameState, id: string) => {
  const st = at(s, id);
  // the shelf stands against the right wall (from the left), the fridge against the left wall (from the right)
  const pos = id === SUPPLY_ID ? { x: st.pos.x - 1, y: st.pos.y } : id === FRIDGE_ID ? { x: st.pos.x + 1, y: st.pos.y } : { x: st.pos.x, y: st.pos.y + 1 };
  me(s).pos = pos;
  me(s).tile = { ...pos };
};
const tapOf = (s: GameState) => s.stations.find((x) => x.kind === 'coldBrewTap')!;

describe('Round 6 block 4: the milk counter', () => {
  it('empty hands at the milk counter take nothing (cartons come from the fridge only)', () => {
    const s = gearDay();
    standAt(s, SUPPLY_ID);
    interact(s, 'p1');
    expect(me(s).tool).toBeNull();
    expect(me(s).holding).toBeNull();
    expect(s.supplies.milk).toBe(20);
    expect(logs(s, 'fridge.take')).toHaveLength(0);
  });

  it('a carton from the fridge stocks the milk counter (its own cold pool, not the milk out at the steamer)', () => {
    const s = gearDay();
    standAt(s, FRIDGE_ID);
    interact(s, 'p1');
    expect(me(s).tool).toBe('milk');
    standAt(s, SUPPLY_ID);
    interact(s, 'p1');
    expect(me(s).tool).toBeNull();
    expect(me(s).carry).toBeUndefined();
    expect(s.supplyMilk).toBe(FRIDGE.carton);
    expect(s.milkOut ?? 0).toBe(0);
    expect(logs(s, 'milk.out').at(-1)!.data).toEqual({ by: 'p1', n: FRIDGE.carton, station: SUPPLY_ID });
    expect(stationLeft(s, SUPPLY_ID)).toBe(FRIDGE.carton);
    expect(stockOf(s, 'milk')).toBe(20); // the board still counts every drop
  });

  it('a shot in hand at a stocked counter becomes an iced latte at once; a cold brew becomes a sweet cream', () => {
    const s = gearDay();
    s.supplyMilk = 3;
    standAt(s, SUPPLY_ID);
    me(s).holding = 'espresso';
    me(s).cupSlips = 1;
    interact(s, 'p1');
    expect(me(s).holding).toBe('icedLatte');
    expect(me(s).cupSlips).toBe(1); // the shot's marks stay with the cup
    expect(s.supplyMilk).toBe(2);
    expect(logs(s, 'supply.fill').at(-1)!.data).toEqual({ by: 'p1', drink: 'icedLatte' });
    me(s).holding = 'coldBrew';
    delete me(s).cupSlips;
    interact(s, 'p1');
    expect(me(s).holding).toBe('sweetCream');
    expect(s.supplyMilk).toBe(1);
  });

  it('an empty counter is a no-op that says so; a drink the counter has no step for stays as it is', () => {
    const s = gearDay();
    s.milkOut = 8; // milk out at the steamer never feeds the counter
    standAt(s, SUPPLY_ID);
    me(s).holding = 'espresso';
    expect(supplyWants(s, me(s))).toEqual({ kind: 'empty', gives: 'icedLatte' });
    interact(s, 'p1');
    expect(me(s).holding).toBe('espresso');
    expect(me(s).cupSlips).toBeUndefined();
    expect(s.milkOut).toBe(8);
    me(s).holding = 'latte';
    s.supplyMilk = 4;
    expect(supplyWants(s, me(s))).toEqual({ kind: 'idle', milk: 4 });
    interact(s, 'p1');
    expect(me(s).holding).toBe('latte');
    expect(s.supplyMilk).toBe(4);
  });

  it('supplyWants reads the press for hints', () => {
    const s = gearDay();
    expect(supplyWants(s, me(s))).toEqual({ kind: 'idle', milk: 0 });
    me(s).tool = 'milk';
    me(s).carry = 5;
    expect(supplyWants(s, me(s))).toEqual({ kind: 'stock', n: 5 });
    me(s).tool = null;
    delete me(s).carry;
    me(s).holding = 'coldBrew';
    s.supplyMilk = 2;
    expect(supplyWants(s, me(s))).toEqual({ kind: 'fill', gives: 'sweetCream', milk: 2 });
    s.menu.sweetCream = false; // off tonight: the counter won't make it
    expect(supplyWants(s, me(s))).toEqual({ kind: 'idle', milk: 2 });
    expect(supplyWants({ ...s, gear: undefined }, me(s))).toBeNull();
  });

  it('the cold brew tap no longer finishes iced lattes or sweet cream; it still pours plain cold brew', () => {
    const s = gearDay();
    s.milkOut = 8;
    const tap = tapOf(s);
    expect(recipeAt(s, tap, 'espresso')).toBeNull();
    expect(recipeAt(s, tap, 'coldBrew')).toBeNull();
    expect(recipeAt(s, tap, null)?.gives).toBe('coldBrew');
    expect(recipeChain('icedLatte').map((x) => x.station)).toEqual(['grinder', 'espresso', SUPPLY_ID]);
    expect(recipeChain('sweetCream').map((x) => x.station)).toEqual(['coldBrewTap', SUPPLY_ID]);
    // the iced latte no longer draws a steeped cup; sweet cream still starts with one
    expect(TAP_DRINKS).not.toContain('icedLatte');
    expect(TAP_DRINKS).toContain('sweetCream');
  });

  it('a steamer latte still works from the milk out at the bar (the counter milk never feeds it)', () => {
    const s = gearDay(['steamer', 'e2']);
    me(s).bot = undefined;
    const steamer = s.stations.find((x) => x.kind === 'steamer')!;
    s.supplyMilk = 8;
    standAt(s, steamer.id);
    me(s).holding = 'espresso';
    interact(s, 'p1');
    // no milk out: nothing starts (a person's jug doesn't start either)
    expect(me(s).holding).toBe('espresso');
    expect(me(s).jug).toBeUndefined();
    // a carton put out at the steamer: the latte (a person's jug first) goes ahead
    s.milkOut = 0;
    me(s).holding = null;
    me(s).tool = 'milk';
    me(s).carry = 4;
    interact(s, 'p1');
    expect(s.milkOut).toBe(4);
    expect(s.supplyMilk).toBe(8);
    me(s).holding = 'espresso';
    interact(s, 'p1');
    expect(me(s).steam).toBeDefined();
    expect(me(s).jug).toBeUndefined();
  });

  it('the cold brew tap is no longer a place to put milk out', () => {
    const s = gearDay();
    standAt(s, tapOf(s).id);
    me(s).tool = 'milk';
    me(s).carry = 4;
    interact(s, 'p1');
    expect(me(s).tool).toBe('milk');
    expect(s.milkOut ?? 0).toBe(0);
  });

  it('the Udder-Matic tops up the counter too (while a cold milk drink is on the menu), and takes both back at close', () => {
    let s = gearDay(['c1', 'steamer']);
    s.fridge = 'f4';
    s.supplies.milk = 40;
    s = step(s, []);
    expect(s.milkOut).toBe(FRIDGE.carton);
    expect(s.supplyMilk).toBe(FRIDGE.carton);
    expect(s.supplies.milk).toBe(40 - 2 * FRIDGE.carton);
    s.supplyMilk = 1;
    s = step(s, []);
    expect(s.supplyMilk).toBe(1 + FRIDGE.carton);
    s.supplyMilk = 0;
    s.menu.icedLatte = false;
    s.menu.sweetCream = false;
    s = step(s, []);
    expect(s.supplyMilk).toBe(0);
    s.supplyMilk = 5;
    const fridgeBefore = s.supplies.milk + s.milkOut! + 5;
    finishDay(s);
    expect(s.supplyMilk ?? 0).toBe(0);
    expect(logs(s, 'supply.spoil').some((e) => e.data.item === 'milk')).toBe(false);
    expect(s.days.at(-1)!.spoiled?.milk ?? 0).toBe(Math.floor(fridgeBefore * 0.3 * 0.25));
  });

  it('milk left on the counter at close goes bad; the checklist waits for it; the morning starts empty', () => {
    const s = gearDay();
    s.supplyMilk = 3;
    s.milkOut = 2;
    expect(closingChecklist(s).milkAway).toBe(false);
    s.milkOut = 0;
    expect(closingChecklist(s).milkAway).toBe(false);
    finishDay(s);
    expect(logs(s, 'supply.spoil').find((e) => e.data.item === 'milk')!.data.count).toBe(3);
    expect(s.days.at(-1)!.spoiled?.milk ?? 0).toBeGreaterThanOrEqual(3);
    expect(s.supplyMilk).toBeUndefined();
  });

  it('closing soon: empty hands lift the counter milk to put away (not while someone waits on a cold milk drink)', () => {
    const s = gearDay();
    s.supplyMilk = 5;
    standAt(s, SUPPLY_ID);
    startClosingSoon(s);
    s.customers.push({ id: 991, drink: 'icedLatte', patienceLeft: 500, patienceMax: 1000 });
    interact(s, 'p1');
    expect(me(s).tool).toBeNull();
    expect(s.supplyMilk).toBe(5);
    s.customers = s.customers.filter((c) => c.id !== 991);
    interact(s, 'p1');
    expect(me(s).tool).toBe('milk');
    expect(me(s).carry).toBe(5);
    expect(s.supplyMilk).toBe(0);
    expect(logs(s, 'milk.lift').at(-1)!.data).toEqual({ by: 'p1', n: 5, station: SUPPLY_ID });
    standAt(s, FRIDGE_ID);
    interact(s, 'p1');
    expect(me(s).tool).toBeNull();
    expect(s.supplies.milk).toBe(25);
    expect(closingChecklist(s).milkAway).toBe(true);
  });
});

describe('Round 6 block 4: bots and the milk counter', () => {
  it('a bots-only stand day with iced lattes: bots stock the counter, finish there, never go negative or sit on a carton', () => {
    let s = gearNight(['e1', 'c1'], 'stand');
    s.settings.dayLengthSec = 150;
    s.players[0].connected = false;
    addStandIns(s, 2);
    s.supplies.milk = 30;
    s.supplies.beans = 40;
    s.supplies.concentrate = 20;
    s.unlocked = [...new Set([...(s.unlocked ?? []), 'icedLatte', 'espresso', 'coldBrew', 'sweetCream'] as DrinkId[])];
    for (const d of Object.keys(s.menu) as DrinkId[]) s.menu[d] = d === 'icedLatte' || d === 'sweetCream';
    s = startDay(s);
    const since = new Map<string, number>();
    let longest = 0;
    let stocked = 0;
    let fills = 0;
    // Day plus the wrap-up cap (closing grace), with a little spare.
    for (let i = 0; i < (s.settings.dayLengthSec + ECONOMY.closingGraceSeconds + 15) * TICK_RATE && s.phase !== 'night'; i++) {
      s = step(s, []);
      stocked += s.log.filter((e) => e.kind === 'milk.out' && e.data.station === SUPPLY_ID && e.tick === s.tick).length;
      fills += s.log.filter((e) => e.kind === 'supply.fill' && e.tick === s.tick).length;
      expect(s.supplyMilk ?? 0).toBeGreaterThanOrEqual(0);
      for (const p of s.players) {
        if (!p.bot) continue;
        if (p.tool === 'milk') {
          if (!since.has(p.id)) since.set(p.id, s.tick);
          longest = Math.max(longest, s.tick - since.get(p.id)!);
        } else since.delete(p.id);
      }
    }
    expect(stocked).toBeGreaterThan(0);
    expect(fills).toBeGreaterThan(0);
    expect(longest).toBeLessThanOrEqual(60 * TICK_RATE);
    expect(s.days.at(-1)!.served).toBeGreaterThan(0);
  });
});
