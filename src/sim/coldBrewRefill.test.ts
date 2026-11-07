import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { interact, stepStations } from './stations';
import { ensureCounterSpots, stationsFromSlots } from './slots';
import { COLD_BREW_REFILL_SEC, canRefillColdBrew, gearTapPour } from './gear';
import { secondsToTicks } from './constants';
import { layoutProblems } from './rearrange';
import { FRIDGE, fridgeGear, isSupply } from './fridge';
import { SUPPLY_ID, layoutFor } from '../data/layout';
import { GEAR, type GearId } from '../data/gear';
import { step } from './step';
import { addStandIns } from './bots/roster';
import { uncoveredOrders } from '../harness/brain';
import { TICK_RATE } from './constants';
import type { DrinkId, GameState, SupplyId, TierId } from './types';

/** FB2 C9: 'steamer' in a test kit is a plain steam station with no gear. */
type Kit = GearId | 'steamer';

function gearNight(gear: Kit[], supplies: Partial<Record<SupplyId, number>> = {}, tier: TierId = 'stand'): GameState {
  const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier, gear: true });
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
  Object.assign(s.supplies, supplies);
  return s;
}

const gearDay = (gear: Kit[], supplies: Partial<Record<SupplyId, number>> = {}, tier: TierId = 'stand') => {
  const s = startDay(gearNight(gear, supplies, tier));
  if (supplies.milk) s.milkOut = 0; // milk stays in the fridge until grabbed
  return s;
};

const standAt = (s: GameState, id: string) => {
  const st = s.stations.find((x) => x.id === id)!;
  // supply against the right wall: from the left; fridge against the left wall: from the right; else one tile below
  const pos =
    id === SUPPLY_ID
      ? { x: st.pos.x - 1, y: st.pos.y }
      : id === 'fridge'
        ? { x: st.pos.x + 1, y: st.pos.y }
        : { x: st.pos.x, y: st.pos.y + 1 };
  s.players[0].pos = pos;
  s.players[0].tile = { x: pos.x, y: pos.y };
};

const tapOf = (s: GameState) => s.stations.find((x) => x.kind === 'coldBrewTap')!;
const me = (s: GameState) => s.players[0]!;

describe('Round 5 block 4a: mid-day cold brew refill', () => {
  it('E at an empty cold brew with concentrate starts a 4 s refill for half the cap and pays concentrate', () => {
    const s = gearDay(['c1'], { concentrate: 50 });
    const tap = tapOf(s);
    tap.batchLeft = 0;
    s.supplies.concentrate = 10; // after morning steep used some
    standAt(s, tap.id);
    expect(canRefillColdBrew(s, tap, me(s))).toBe(true);
    interact(s, 'p1');
    expect(tap.busyTicksLeft).toBe(secondsToTicks(COLD_BREW_REFILL_SEC));
    expect(tap.batchLeft).toBe(4); // floor(8/2)
    expect(s.supplies.concentrate).toBe(6);
    expect(me(s).holding).toBeNull();
    expect(tap.output).toBeNull();
    expect(tap.making).toBeNull();
    expect(s.log.some((e) => e.kind === 'coldbrew.refill' && e.data.cups === 4 && e.data.station === tap.id)).toBe(true);
  });

  it('finishing the refill never leaves a cup on the station', () => {
    const s = gearDay(['c1'], { concentrate: 50 });
    const tap = tapOf(s);
    tap.batchLeft = 0;
    s.supplies.concentrate = 10;
    standAt(s, tap.id);
    interact(s, 'p1');
    const ticks = tap.busyTicksLeft;
    for (let i = 0; i < ticks; i++) stepStations(s);
    expect(tap.busyTicksLeft).toBe(0);
    expect(tap.output).toBeNull();
    expect(tap.making).toBeNull();
    expect(tap.batchLeft).toBe(4);
    expect(me(s).holding).toBeNull();
  });

  it('no concentrate → no-op; night → no-op', () => {
    const day = gearDay(['c1'], { concentrate: 50 });
    const tap = tapOf(day);
    tap.batchLeft = 0;
    day.supplies.concentrate = 0;
    standAt(day, tap.id);
    expect(canRefillColdBrew(day, tap, me(day))).toBe(false);
    interact(day, 'p1');
    expect([tap.busyTicksLeft, tap.batchLeft, day.supplies.concentrate, me(day).holding]).toEqual([0, 0, 0, null]);

    const night = gearNight(['c1'], { concentrate: 20 });
    const nTap = tapOf(night);
    nTap.batchLeft = 0;
    standAt(night, nTap.id);
    expect(canRefillColdBrew(night, nTap, me(night))).toBe(false);
    expect(gearTapPour(night, nTap, me(night))).toBe(true);
    expect([nTap.busyTicksLeft, nTap.batchLeft, night.supplies.concentrate]).toEqual([0, 0, 20]);
  });

  it('after a refill, the tap pours again (Round 6 block 4: the iced latte no longer draws a cup)', () => {
    // Cold brew in slot 2 so the press isn't swallowed by the fridge (same tile column as slot 0).
    const s = gearDay(['e1', 'steamer', 'c1'], { concentrate: 50, beans: 20, milk: 20 });
    s.unlocked = ['espresso', 'latte', 'coldBrew', 'icedLatte'];
    for (const d of s.unlocked) s.menu[d] = true;
    const tap = tapOf(s);
    tap.batchLeft = 0;
    s.supplies.concentrate = 10;
    standAt(s, tap.id);
    interact(s, 'p1');
    const lock = tap.busyTicksLeft;
    for (let i = 0; i < lock; i++) stepStations(s);
    expect(tap.busyTicksLeft).toBe(0);
    expect(tap.batchLeft).toBe(4);
    expect(tap.output).toBeNull();
    standAt(s, tap.id);
    interact(s, 'p1');
    expect([tap.batchLeft, me(s).holding]).toEqual([3, 'coldBrew']);
  });

  it('a dead tap (batteries died, dead until tonight) cannot be refilled', () => {
    const s = gearDay(['c1'], { concentrate: 50 });
    const tap = tapOf(s);
    tap.batchLeft = 0;
    tap.dead = true;
    expect(canRefillColdBrew(s, tap, me(s))).toBe(false);
    const concentrate = s.supplies.concentrate;
    standAt(s, tap.id);
    interact(s, 'p1');
    expect([tap.busyTicksLeft, tap.batchLeft, s.supplies.concentrate]).toEqual([0, 0, concentrate]);
  });

  it('bots do not count a refill in progress as a cold brew on its way', () => {
    let s = gearDay(['c1'], { concentrate: 50 });
    addStandIns(s, 1);
    const bot = s.players.find((p) => p.bot)!;
    s.customers = [{ id: 1, drink: 'coldBrew', patienceLeft: 100_000, patienceMax: 100_000, stage: 'pickup', rungAt: 0 }];
    const tap = tapOf(s);
    tap.batchLeft = 0;
    standAt(s, tap.id);
    s = interact(s, 'p1');
    expect(tap.busyTicksLeft).toBeGreaterThan(0);
    expect(tap.making).toBeNull();
    expect(uncoveredOrders(s, bot).map((c) => c.id)).toEqual([1]);
  });

  it('pays only what concentrate can cover (short of half the cap)', () => {
    const s = gearDay(['c2'], { concentrate: 50 }); // c2 cap 16, half = 8
    const tap = tapOf(s);
    tap.batchLeft = 0;
    s.supplies.concentrate = 3;
    standAt(s, tap.id);
    interact(s, 'p1');
    expect(tap.batchLeft).toBe(3);
    expect(s.supplies.concentrate).toBe(0);
  });
});

describe('Round 5 block 4b: staff milk & cream by the sink', () => {
  it('the supply shelf sits one tile above the sink on stand, cart and café', () => {
    for (const tier of ['stand', 'cart', 'cafe'] as const) {
      const s = gearDay(['c1'], { milk: 20 }, tier);
      const supply = s.stations.find((x) => x.id === SUPPLY_ID)!;
      expect(isSupply(supply)).toBe(true);
      expect(supply.pos).toEqual(layoutFor(tier).supply);
      expect(supply.pos).toEqual({ x: layoutFor(tier).sink.x, y: layoutFor(tier).sink.y - 1 });
      expect(layoutProblems(s).size).toBe(0);
    }
  });

  it('Round 6 block 4: the shelf is the milk counter: empty hands take nothing; a fridge carton goes out at the steamer or onto the counter', () => {
    const s = gearDay(['c1', 'steamer'], { milk: 20, concentrate: 10 });
    expect(fridgeGear(s)).toBe('f1');
    standAt(s, SUPPLY_ID);
    interact(s, 'p1');
    expect(me(s).tool).toBeNull();
    expect(s.supplies.milk).toBe(20);

    standAt(s, 'fridge');
    interact(s, 'p1');
    expect([me(s).tool, me(s).carry]).toEqual(['milk', FRIDGE.carton]);
    standAt(s, 'steamer');
    interact(s, 'p1');
    expect(me(s).tool).toBeNull();
    expect(s.milkOut).toBe(FRIDGE.carton);

    standAt(s, 'fridge');
    interact(s, 'p1');
    standAt(s, SUPPLY_ID);
    interact(s, 'p1');
    expect(me(s).tool).toBeNull();
    expect([s.milkOut, s.supplyMilk, s.supplies.milk]).toEqual([FRIDGE.carton, FRIDGE.carton, 20 - 2 * FRIDGE.carton]);
  });

  it('R with a cup at the shelf does nothing (the shelf takes no cups, like the fridge)', () => {
    let s = gearDay(['c1', 'steamer'], { milk: 20 });
    standAt(s, SUPPLY_ID);
    me(s).holding = 'latte';
    s = step(s, [{ kind: 'drop', playerId: 'p1' }]);
    expect(s.pass).toHaveLength(0);
    expect(me(s).holding).toBe('latte');
  });

  it('a bots-only Gear day on the stand with milk drinks: milk never goes negative and no bot sits on a carton', () => {
    let s = gearNight(['e1', 'steamer'], { milk: 30, beans: 40 }, 'stand');
    s.settings.dayLengthSec = 120;
    s.players[0].connected = false;
    addStandIns(s, 2);
    s.unlocked = [...new Set([...(s.unlocked ?? []), 'latte', 'espresso'] as DrinkId[])];
    for (const d of Object.keys(s.menu) as DrinkId[]) s.menu[d] = d === 'latte' || d === 'espresso';
    s = startDay(s);
    s.milkOut = 0;
    const since = new Map<string, number>();
    let longest = 0;
    let took = 0;
    for (let i = 0; i < 150 * TICK_RATE && s.phase === 'day'; i++) {
      s = step(s, []);
      took += s.log.filter((e) => e.kind === 'fridge.take' && e.tick === s.tick).length;
      expect(s.supplies.milk).toBeGreaterThanOrEqual(0);
      expect(s.milkOut ?? 0).toBeGreaterThanOrEqual(0);
      for (const p of s.players) {
        if (!p.bot) continue;
        expect(p.carry ?? 0).toBeGreaterThanOrEqual(0);
        if (p.tool === 'milk') {
          if (!since.has(p.id)) since.set(p.id, s.tick);
          longest = Math.max(longest, s.tick - since.get(p.id)!);
        } else since.delete(p.id);
      }
    }
    expect(took).toBeGreaterThan(0);
    expect(s.today.served).toBeGreaterThan(0);
    expect(longest).toBeLessThanOrEqual(60 * TICK_RATE);
  });

  it('no fridge → no carton from the supply shelf', () => {
    const s = gearNight(['c1'], { milk: 20 }, 'stand');
    s.fridge = undefined as unknown as typeof s.fridge;
    delete (s as { fridge?: string }).fridge;
    // strip fridge station; keep supply
    s.stations = s.stations.filter((x) => x.id !== 'fridge');
    ensureCounterSpots(s); // won't re-add fridge without fridgeGear
    expect(fridgeGear(s)).toBeNull();
    expect(s.stations.some((x) => x.id === SUPPLY_ID)).toBe(true);
    const day = startDay(s);
    day.supplies.milk = 20;
    standAt(day, SUPPLY_ID);
    interact(day, 'p1');
    expect(me(day).tool).toBeNull();
    expect(day.supplies.milk).toBe(20);
  });

  it('old Gear saves get the supply shelf once (ensureCounterSpots)', () => {
    const s = gearNight(['c1']);
    s.stations = s.stations.filter((x) => x.id !== SUPPLY_ID);
    ensureCounterSpots(s);
    ensureCounterSpots(s);
    expect(s.stations.filter((x) => x.id === SUPPLY_ID)).toHaveLength(1);
    expect(s.stations.find((x) => x.id === SUPPLY_ID)!.pos).toEqual(layoutFor('stand').supply);
  });
});
