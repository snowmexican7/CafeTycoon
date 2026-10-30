import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { finishDay } from './closing';
import { interact } from './stations';
import { stationsFromSlots } from './slots';
import { CONDIMENTS } from './condiments';
import { FRIDGE, closingChecklist, closingSoon, fridgeCapacity } from './fridge';
import { FRIDGE_ID, CONDIMENTS_ID, layoutFor } from '../data/layout';
import { ECONOMY } from '../data/economy';
import { GEAR, type GearId } from '../data/gear';
import { secondsToTicks } from './constants';
import type { GameState, Player, SimEvent, TierId } from './types';

function gearNight(gear: GearId[], tier: TierId = 'stand'): GameState {
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
  return s;
}

/** Stand tier: s2 steamer in slot 0 (x 1), e2 espresso in slot 1 (x 3), the cardboard box in the last slot. */
function gearDay(gear: GearId[] = ['s2', 'e2']): GameState {
  const s = gearNight(gear);
  s.supplies.milk = 20;
  s.supplies.beans = 20;
  return startDay(s);
}

const me = (s: GameState): Player => s.players[0]!;
const at = (s: GameState, id: string) => s.stations.find((x) => x.id === id)!;
/** Stand one tile below a back-bar station, or beside the fridge (the side away from the wall). */
function standAt(s: GameState, id: string): void {
  const st = at(s, id);
  me(s).pos = id === FRIDGE_ID ? { x: st.pos.x + 1, y: st.pos.y } : id === CONDIMENTS_ID ? { x: st.pos.x, y: st.pos.y - 1 } : { x: st.pos.x, y: st.pos.y + 1 };
}
const logs = (s: GameState, kind: string): SimEvent[] => s.log.filter((e) => e.kind === kind);

describe('FB2 A4: the fridge station and its gear', () => {
  it('a new Gear run has the fridge at its spot in every tier, the Dorm Room Cube, and no milk out in the morning', () => {
    for (const tier of ['stand', 'cart', 'cafe'] as const) {
      const s = gearNight([], tier);
      const f = at(s, FRIDGE_ID);
      expect(f.kind).toBe('counter');
      expect(f.pos).toEqual(layoutFor(tier).fridge);
      expect(s.fridge ?? 'f1').toBe('f1');
      expect(fridgeCapacity(s)).toBe(24);
    }
    const d = gearDay();
    expect(d.milkOut ?? 0).toBe(0);
    expect(d.closingSoonAt).toBeUndefined();
  });

  it('a classic run has no fridge, and the steamer draws straight from supplies as before', () => {
    const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
    expect(s.stations.some((x) => x.id === FRIDGE_ID)).toBe(false);
    expect(s.fridge).toBeUndefined();
    startDay(s);
    const milk = s.supplies.milk;
    me(s).holding = 'espresso';
    standAt(s, 'steamer');
    interact(s, 'p1');
    expect(at(s, 'steamer').making).toBe('latte');
    expect(s.supplies.milk).toBe(milk - 1);
    expect(s.milkOut).toBeUndefined();
  });

  it('the fridge is gear: upgraded at night with a trade-in, never in a slot, never below the cube', () => {
    const s = gearNight([]);
    s.cash = 200;
    const slots = JSON.stringify(s.slotGear);
    const t = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: 'f2' }]);
    expect(t.fridge).toBe('f2');
    expect(t.cash).toBe(140);
    expect(JSON.stringify(t.slotGear)).toBe(slots);
    expect(fridgeCapacity(t)).toBe(48);
    const u = step(t, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: 'f3' }]);
    expect([u.fridge, u.cash]).toEqual(['f3', 140 + GEAR.f2.sell - GEAR.f3.price]);
    expect(step(u, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: 'f2' }]).fridge).toBe('f3'); // no downgrade
    expect(step(u, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: 'f1' }]).cash).toBe(u.cash);
    const poor = gearNight([]);
    poor.cash = 10;
    expect(step(poor, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: 'f2' }]).fridge ?? 'f1').toBe('f1');
    const day = gearDay();
    day.cash = 500;
    expect(step(day, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: 'f2' }]).fridge ?? 'f1').toBe('f1');
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
    const spoilWith = (id: GearId) => {
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
