import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { finishDay } from './closing';
import { interact } from './stations';
import { ensureCounterSpots, stationsFromSlots } from './slots';
import { applyGrowInput } from './growth';
import { CONDIMENTS } from './condiments';
import { spotOf } from './pickup';
import { stationLeft } from './counts';
import { FRIDGE, closingChecklist, closingSoon, fridgeCapacity, fridgeCards, fridgeGear, fridgeMorning } from './fridge';
import { migrateSnapshot, SNAPSHOT_VERSION } from '../storage/snapshotStore';
import { FRIDGE_ID, CONDIMENTS_ID, layoutFor } from '../data/layout';
import { ECONOMY } from '../data/economy';
import { FRIDGES, type FridgeId } from '../data/fridges';
import { GEAR, type GearId } from '../data/gear';
import { secondsToTicks } from './constants';
import type { GameState, Player, SimEvent, TierId } from './types';

/** A Gear run at night with `gear` in the first slots. The stand gets the Dorm Room Cube unless `fridge` says otherwise. */
function gearNight(gear: GearId[], tier: TierId = 'stand', fridge: FridgeId | null = 'f1'): GameState {
  const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier, gear: true });
  const slots = [...s.slots!];
  const slotGear = [...s.slotGear!];
  gear.forEach((id, i) => {
    slots[i] = GEAR[id].station;
    slotGear[i] = id;
  });
  s.slots = slots;
  s.slotGear = slotGear;
  s.stations = stationsFromSlots(s.tier, slots, slotGear);
  if (fridge) s.fridge = fridge;
  ensureCounterSpots(s);
  return s;
}

/** Stand tier: s2 steamer in slot 0 (x 1), e2 espresso in slot 1 (x 3), the cardboard box in the last slot. */
function gearDay(gear: GearId[] = ['s2', 'e2'], fridge: FridgeId | null = 'f1'): GameState {
  const s = gearNight(gear, 'stand', fridge);
  s.supplies.milk = 20;
  s.supplies.beans = 20;
  return startDay(s);
}

const me = (s: GameState): Player => s.players[0]!;
const at = (s: GameState, id: string) => s.stations.find((x) => x.id === id)!;
const hasFridge = (s: GameState) => s.stations.filter((x) => x.id === FRIDGE_ID).length;
/** Stand one tile below a back-bar station, or beside the fridge (the side away from the wall). */
function standAt(s: GameState, id: string): void {
  const st = at(s, id);
  me(s).pos = id === FRIDGE_ID ? { x: st.pos.x + 1, y: st.pos.y } : id === CONDIMENTS_ID ? { x: st.pos.x, y: st.pos.y - 1 } : { x: st.pos.x, y: st.pos.y + 1 };
}
const logs = (s: GameState, kind: string): SimEvent[] => s.log.filter((e) => e.kind === kind);
const buy = (s: GameState, fridge: FridgeId) => step(s, [{ kind: 'fridge', playerId: 'p1', fridge }]);

describe('FB2 A4: which fridge a shop has (Kennedy: it follows the shop size)', () => {
  it('the stand starts with none; the cart comes with the Garage Beer Fridge, the café with the Chrome Reach-In', () => {
    const stand = gearNight([], 'stand', null);
    expect(fridgeGear(stand)).toBeNull();
    expect(hasFridge(stand)).toBe(0);
    expect(fridgeCapacity(stand)).toBe(0);
    for (const [tier, id] of [['cart', 'f2'], ['cafe', 'f3']] as const) {
      const s = gearNight([], tier, null);
      expect(fridgeGear(s)).toBe(id);
      expect(at(s, FRIDGE_ID).pos).toEqual(layoutFor(tier).fridge);
      expect(at(s, FRIDGE_ID).kind).toBe('counter');
      expect(fridgeCapacity(s)).toBe(FRIDGES[id].holds);
    }
    // a run created at the café (no tier) has its fridge from the first night
    const cafe = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, gear: true });
    expect([fridgeGear(cafe), hasFridge(cafe)]).toEqual(['f3', 1]);
    const d = gearDay();
    expect(d.milkOut ?? 0).toBe(0);
    expect(d.closingSoonAt).toBeUndefined();
  });

  it('a classic run has no fridge, and the steamer draws straight from supplies as before', () => {
    const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
    expect(s.stations.some((x) => x.id === FRIDGE_ID)).toBe(false);
    expect([s.fridge, fridgeGear(s), fridgeCards(s)]).toEqual([undefined, null, []]);
    startDay(s);
    const milk = s.supplies.milk;
    me(s).holding = 'espresso';
    standAt(s, 'steamer');
    interact(s, 'p1');
    expect(at(s, 'steamer').making).toBe('latte');
    expect(s.supplies.milk).toBe(milk - 1);
    expect(s.milkOut).toBeUndefined();
    expect(step(s, [{ kind: 'fridge', playerId: 'p1', fridge: 'f1' }]).fridge).toBeUndefined();
  });

  it('the stand buys the Dorm Room Cube once ($20, a single card); the fridge appears at its spot', () => {
    const s = gearNight([], 'stand', null);
    s.cash = 100;
    expect(fridgeCards(s)).toEqual([{ id: 'f1', price: 20 }]);
    const t = buy(s, 'f1');
    expect([t.fridge, t.cash, hasFridge(t)]).toEqual(['f1', 80, 1]);
    expect(fridgeCards(t)).toEqual([]);
    expect(buy(t, 'f1').cash).toBe(80); // once
    expect(buy(t, 'f4').fridge).toBe('f1'); // not at the stand
    const poor = gearNight([], 'stand', null);
    poor.cash = 19;
    expect(buy(poor, 'f1').fridge).toBeUndefined();
    const day = gearDay(['s2', 'e2'], null);
    day.cash = 100;
    expect(buy(day, 'f1').fridge).toBeUndefined(); // night only
  });

  it('growing hands over the bigger fridge for free, cube or not; the café can buy the Udder-Matic', () => {
    for (const cube of [true, false]) {
      const s = gearNight([], 'stand', cube ? 'f1' : null);
      s.cash = 10_000;
      applyGrowInput(s, { kind: 'grow', playerId: 'p1', tier: 'cart' });
      expect([fridgeGear(s), hasFridge(s)]).toEqual(['f2', 1]);
      expect(fridgeCards(s)).toEqual([]);
      applyGrowInput(s, { kind: 'grow', playerId: 'p1', tier: 'cafe' });
      expect([fridgeGear(s), hasFridge(s)]).toEqual(['f3', 1]);
      expect(fridgeCards(s)).toEqual([{ id: 'f4', price: 320 }]);
      const cash = s.cash;
      const t = buy(s, 'f4');
      expect([fridgeGear(t), t.cash, hasFridge(t)]).toEqual(['f4', cash - 320, 1]);
      expect(fridgeCards(t)).toEqual([]);
      expect(buy(t, 'f1').cash).toBe(t.cash); // never downgraded
    }
  });

  it('no fridge: no milk can be bought, the bar can\'t be put away and spoils at close', () => {
    const s = gearNight(['s2', 'e2'], 'stand', null);
    s.cash = 100;
    expect(step(s, [{ kind: 'restock', playerId: 'p1', supply: 'milk', packs: 2 }]).supplies.milk).toBe(0);
    const d = gearDay(['s2', 'e2'], null);
    d.condiments = { servings: 9 };
    d.closingSoonAt = d.tick;
    standAt(d, CONDIMENTS_ID);
    interact(d, 'p1');
    expect([me(d).tool, d.condiments.servings]).toEqual([null, 9]);
    finishDay(d);
    expect(d.days.at(-1)!.spoiledBar).toBe(9);
  });

  it('I1: every Gear state gets the fridge its shop has, on load (any snapshot version) and every morning, once', () => {
    const s = gearNight(['s2', 'e2'], 'cart', null);
    s.stations = s.stations.filter((x) => x.id !== FRIDGE_ID);
    const loaded = migrateSnapshot(SNAPSHOT_VERSION, JSON.parse(JSON.stringify(s)) as GameState)!;
    expect(hasFridge(loaded)).toBe(1);
    s.stations = s.stations.filter((x) => x.id !== FRIDGE_ID && x.id !== CONDIMENTS_ID);
    startDay(s);
    expect([hasFridge(s), s.stations.filter((x) => x.id === CONDIMENTS_ID).length]).toEqual([1, 1]);
    ensureCounterSpots(s);
    ensureCounterSpots(s);
    expect(hasFridge(s)).toBe(1);
    // a stand with no fridge stays without one
    const stand = gearNight([], 'stand', null);
    startDay(stand);
    expect(hasFridge(stand)).toBe(0);
  });

  it('the fridge caps the milk restock: only whole packs that fit are bought, nothing is lost', () => {
    const s = gearNight([]);
    s.cash = 100;
    s.supplies.milk = 0;
    const t = step(s, [{ kind: 'restock', playerId: 'p1', supply: 'milk', packs: 5 }]);
    expect(t.supplies.milk).toBe(20); // 24 holds two packs of 10
    expect(t.cash).toBe(80);
    const u = step(t, [{ kind: 'restock', playerId: 'p1', supply: 'milk', packs: 1 }]);
    expect([u.supplies.milk, u.cash]).toEqual([20, 80]);
    // beans are not in the fridge
    expect(step(u, [{ kind: 'restock', playerId: 'p1', supply: 'beans', packs: 3 }]).supplies.beans).toBe(30);
  });

  it('a bigger fridge spoils less overnight', () => {
    const spoilWith = (id: FridgeId) => {
      const s = gearDay();
      s.fridge = id;
      s.supplies.milk = 40;
      finishDay(s);
      return s.days.at(-1)!.spoiled?.milk ?? 0;
    };
    expect(spoilWith('f1')).toBe(12);
    expect(spoilWith('f3')).toBe(6);
    expect(spoilWith('f4')).toBe(3);
  });

  it('M2: bar servings put away beyond a full bar wait in the fridge for the next morning', () => {
    const s = gearDay();
    s.condiments = { servings: 5 };
    s.barAway = 30;
    fridgeMorning(s);
    expect([s.condiments.servings, s.barAway]).toEqual([CONDIMENTS.servings, 15]);
  });

  it('A5 counts: the fridge shows the milk it holds, nothing when empty', () => {
    const s = gearDay();
    expect(stationLeft(s, FRIDGE_ID)).toBe(20);
    s.supplies.milk = 0;
    expect(stationLeft(s, FRIDGE_ID)).toBeNull();
  });

  it('A2: a carton carried as a tool is not a cup and never cools', () => {
    let s = gearDay();
    me(s).tool = 'milk';
    me(s).carry = 8;
    me(s).pos = { x: 6, y: 4 };
    let cold = 0;
    for (let i = 0; i < 60 * 90; i++) {
      s = step(s, []);
      cold += logs(s, 'cup.cold').length;
    }
    expect([me(s).tool, me(s).carry, me(s).heldSince, cold]).toEqual(['milk', 8, undefined, 0]);
  });

  it('spotOf names the fridge (not the till)', () => {
    expect(spotOf(at(gearDay(), FRIDGE_ID))).toBe('fridge');
  });

  it('M1: with the mop in hand next to the fridge, E still mops', () => {
    const s = gearDay();
    standAt(s, FRIDGE_ID);
    const p = me(s);
    p.tool = 'mop';
    s.mop.heldBy = p.id;
    s.messes.push({ id: 9, kind: 'spill', x: p.pos.x, y: p.pos.y + 1, amount: 1 });
    interact(s, 'p1');
    expect(p.cleaningTicksLeft).toBeGreaterThan(0);
  });
});

describe('FB2 A4: milk from the fridge to the bar', () => {
  it('empty hands at the fridge take a carton; E at the steamer puts it out', () => {
    const s = gearDay();
    standAt(s, FRIDGE_ID);
    interact(s, 'p1');
    expect([me(s).tool, me(s).carry, s.supplies.milk]).toEqual(['milk', FRIDGE.carton, 20 - FRIDGE.carton]);
    expect(logs(s, 'fridge.take').at(-1)!.data).toEqual({ by: 'p1', item: 'milk', n: FRIDGE.carton });
    standAt(s, 'steamer');
    interact(s, 'p1');
    expect([me(s).tool, me(s).carry, s.milkOut]).toEqual([null, undefined, FRIDGE.carton]);
    expect(logs(s, 'milk.out').at(-1)!.data).toEqual({ by: 'p1', n: FRIDGE.carton, station: 'steamer' });
  });

  it('a carton holds what is left when the fridge is nearly empty, and an empty fridge gives nothing', () => {
    const s = gearDay();
    s.supplies.milk = 3;
    standAt(s, FRIDGE_ID);
    interact(s, 'p1');
    expect([me(s).tool, me(s).carry, s.supplies.milk]).toEqual(['milk', 3, 0]);
    const t = gearDay();
    t.supplies.milk = 0;
    standAt(t, FRIDGE_ID);
    interact(t, 'p1');
    expect(me(t).tool).toBeNull();
  });

  it('steaming draws from the milk out at the bar; with none out the steamer refuses', () => {
    const s = gearDay();
    me(s).holding = 'espresso';
    standAt(s, 'steamer');
    interact(s, 'p1');
    expect(me(s).holding).toBe('espresso');
    expect(at(s, 'steamer').making ?? null).toBeNull();
    s.milkOut = 2;
    interact(s, 'p1');
    expect(at(s, 'steamer').making).toBe('latte');
    expect([s.milkOut, s.supplies.milk]).toEqual([1, 20]);
  });

  it('a cup in hand at the fridge stays in hand (the fridge is not a counter)', () => {
    const s = gearDay();
    me(s).holding = 'latte';
    standAt(s, FRIDGE_ID);
    interact(s, 'p1');
    expect(me(s).holding).toBe('latte');
    expect(s.pass).toHaveLength(0);
    const t = step(s, [{ kind: 'drop', playerId: 'p1' }]);
    expect(t.players[0]!.holding).toBe('latte');
    expect(t.pass).toHaveLength(0);
  });

  it('R, leaving, or the end of the day sends a carried carton back into the fridge', () => {
    for (const how of ['drop', 'leave', 'close'] as const) {
      let s = gearDay();
      s.supplies.milk = 12;
      me(s).tool = 'milk';
      me(s).carry = 8;
      if (how === 'drop') s = step(s, [{ kind: 'drop', playerId: 'p1' }]);
      else if (how === 'leave') s = step(s, [{ kind: 'leave', playerId: 'p1' }]);
      else finishDay(s);
      expect(me(s).tool).toBeNull();
      expect(me(s).carry).toBeUndefined();
      // at close the overnight spoil (30% on the cube) comes after the carton is back
      expect(s.supplies.milk).toBe(how === 'close' ? 20 - Math.floor(20 * 0.3) : 20);
      expect(logs(s, 'fridge.put').at(-1)!.data).toEqual({ by: 'p1', item: 'milk', n: 8 });
    }
  });

  it('the Udder-Matic tops the milk out up from the fridge by itself, and takes it back at close', () => {
    let s = gearDay();
    s.fridge = 'f4';
    s.supplies.milk = 20;
    s = step(s, []);
    expect(s.milkOut).toBe(FRIDGE.carton);
    expect(s.supplies.milk).toBe(20 - FRIDGE.carton);
    expect(logs(s, 'fridge.auto').at(-1)!.data).toEqual({ n: FRIDGE.carton });
    s.milkOut = FRIDGE.autoBelow; // not below the mark: no top-up
    s = step(s, []);
    expect(s.milkOut).toBe(FRIDGE.autoBelow);
    s.milkOut = 3;
    s = step(s, []);
    expect(s.milkOut).toBe(3 + FRIDGE.carton);
    const left = s.supplies.milk + s.milkOut!;
    finishDay(s);
    expect(s.milkOut ?? 0).toBe(0);
    expect(logs(s, 'supply.spoil').some((e) => e.data.item === 'milk')).toBe(false);
    expect(s.days.at(-1)!.spoiled?.milk ?? 0).toBe(Math.floor(left * 0.3 * 0.25));
  });
});

describe('FB2 A4: closing soon and the close', () => {
  it('closing soon starts once, 30 s before the doors lock (Gear only)', () => {
    let s = gearNight(['s2', 'e2']);
    s.settings.dayLengthSec = 40;
    s = startDay(s);
    const soon = secondsToTicks(ECONOMY.closingSoonSeconds);
    const seen = new Set<number>();
    const run = (t: GameState) => {
      const next = step(t, []);
      for (const e of logs(next, 'closing.soon')) seen.add(e.seq);
      return next;
    };
    while (s.phase === 'day' && s.phaseTicksLeft > soon + 1) s = run(s);
    expect(closingSoon(s)).toBe(false);
    s = run(s);
    expect(closingSoon(s)).toBe(true);
    expect(s.phaseTicksLeft).toBe(soon);
    const fired = s.closingSoonAt!;
    while (s.phase === 'day') s = run(s);
    expect(seen.size).toBe(1);
    expect(s.closingSoonAt).toBe(fired);
    let c = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 40 } });
    c = startDay(c);
    let classic = 0;
    while (c.phase === 'day') {
      c = step(c, []);
      classic += logs(c, 'closing.soon').length;
    }
    expect(classic).toBe(0);
    expect(c.closingSoonAt).toBeUndefined();
  });

  it('closing early starts closing soon too', () => {
    let s = gearDay();
    s.phaseTicksLeft -= secondsToTicks(20); // past the close-early gate, well before closing soon
    s = step(s, [{ kind: 'closeEarly', playerId: 'p1', on: true }]);
    expect(s.phase).toBe('closing');
    expect(closingSoon(s)).toBe(true);
    expect(logs(s, 'closing.soon')).toHaveLength(1);
  });

  it('the checklist reads a hand-built state', () => {
    const s = gearDay(['s2', 'e2', 'd2']);
    s.milkOut = 0;
    s.condiments = { servings: 0 };
    expect(closingChecklist(s)).toEqual({ milkAway: true, barAway: true, potsEmpty: true, floorClean: true, counterClear: true });
    s.milkOut = 3;
    s.condiments = { servings: 19 };
    at(s, 'drip').potLeft = 2;
    s.messes.push({ id: 1, kind: 'spill', x: 3, y: 4, amount: 1 });
    s.pass.push({ item: 'latte', ticksLeft: 100 });
    expect(closingChecklist(s)).toEqual({ milkAway: false, barAway: false, potsEmpty: false, floorClean: false, counterClear: false });
    s.milkOut = 0;
    s.condiments = { servings: 0 };
    me(s).tool = 'milk';
    me(s).carry = 3;
    expect(closingChecklist(s).milkAway).toBe(false); // still on its way to the fridge
    me(s).tool = 'bar';
    expect(closingChecklist(s).barAway).toBe(false);
    s.fridge = 'f4';
    s.milkOut = 6;
    expect(closingChecklist(s).milkAway).toBe(true); // the Udder-Matic takes it back itself
  });

  it('whatever is left out at close goes bad, even 19 of 20, and is logged and costed', () => {
    const s = gearDay();
    s.supplies.milk = 0;
    s.milkOut = 5;
    s.condiments = { servings: 19 };
    finishDay(s);
    const spoils = logs(s, 'supply.spoil').map((e) => e.data);
    expect(spoils).toEqual([{ item: 'milk', count: 5 }, { item: 'bar', count: 19 }]);
    const day = s.days.at(-1)!;
    expect(day.spoiled?.milk).toBe(5);
    expect(day.spoiledBar).toBe(19);
    expect(day.spoiledValue).toBeCloseTo(5 * (ECONOMY.packs.milk.cost / ECONOMY.packs.milk.size) + 19 * (CONDIMENTS.boxCost / CONDIMENTS.servings), 2);
    expect([s.milkOut ?? 0, s.condiments.servings]).toEqual([0, 0]);
  });

  it('put away during closing soon, milk and the bar keep, and the bar comes back out next morning', () => {
    const s = gearDay();
    s.supplies.milk = 0;
    s.milkOut = 5;
    s.condiments = { servings: 19 };
    // not closing soon yet: empty hands at the steamer and the bar lift nothing
    standAt(s, 'steamer');
    interact(s, 'p1');
    standAt(s, CONDIMENTS_ID);
    interact(s, 'p1');
    expect(me(s).tool).toBeNull();
    s.closingSoonAt = s.tick;
    standAt(s, 'steamer');
    interact(s, 'p1');
    expect([me(s).tool, me(s).carry, s.milkOut]).toEqual(['milk', 5, 0]);
    expect(logs(s, 'milk.lift').at(-1)!.data).toEqual({ by: 'p1', n: 5, station: 'steamer' });
    standAt(s, FRIDGE_ID);
    interact(s, 'p1');
    expect([me(s).tool, s.supplies.milk]).toEqual([null, 5]);
    standAt(s, CONDIMENTS_ID);
    interact(s, 'p1');
    expect([me(s).tool, me(s).carry, s.condiments.servings]).toEqual(['bar', 19, 0]);
    expect(logs(s, 'bar.lift').at(-1)!.data).toEqual({ by: 'p1', n: 19 });
    standAt(s, FRIDGE_ID);
    interact(s, 'p1');
    expect([me(s).tool, s.barAway]).toEqual([null, 19]);
    expect(logs(s, 'fridge.put').map((e) => e.data)).toEqual([{ by: 'p1', item: 'milk', n: 5 }, { by: 'p1', item: 'bar', n: 19 }]);
    finishDay(s);
    expect(logs(s, 'supply.spoil')).toHaveLength(0);
    expect(s.days.at(-1)!.spoiledBar).toBeUndefined();
    expect(s.supplies.milk).toBe(5 - Math.floor(5 * 0.3));
    startDay(s);
    expect([s.condiments.servings, s.barAway ?? 0, s.milkOut ?? 0]).toEqual([19, 0, 0]);
  });

  it('the lifted bar can go straight back on the bar', () => {
    const s = gearDay();
    s.condiments = { servings: 7 };
    s.closingSoonAt = s.tick;
    standAt(s, CONDIMENTS_ID);
    interact(s, 'p1');
    expect(me(s).tool).toBe('bar');
    interact(s, 'p1');
    expect([me(s).tool, s.condiments.servings]).toEqual([null, 7]);
  });

  it('during closing soon a wanted empty-hands drink still gets made instead of lifting the milk', () => {
    const s = gearDay(['c2', 's2']);
    s.milkOut = 4;
    s.closingSoonAt = s.tick;
    const tap = at(s, 'coldBrewTap');
    tap.batchLeft = 5;
    s.customers.push({ id: 50, drink: 'coldBrew', patienceLeft: 999, patienceMax: 999 });
    standAt(s, 'coldBrewTap');
    interact(s, 'p1');
    expect(me(s).holding).toBe('coldBrew');
    expect(s.milkOut).toBe(4);
    me(s).holding = null;
    s.customers = [];
    interact(s, 'p1');
    expect([me(s).tool, me(s).carry, s.milkOut]).toEqual(['milk', 4, 0]);
  });

  it('a carton can go out at the cold brew tap too (iced lattes use milk there)', () => {
    const s = gearDay(['c2', 'e2']);
    me(s).tool = 'milk';
    me(s).carry = 6;
    standAt(s, 'coldBrewTap');
    interact(s, 'p1');
    expect(s.milkOut).toBe(6);
  });

  it('a new day starts the bar with nothing but what was put away', () => {
    const s = gearDay();
    s.condiments = { servings: 12 };
    finishDay(s);
    startDay(s);
    expect(s.condiments!.servings).toBe(0);
    expect(CONDIMENTS.servings).toBe(20);
  });
});
