import { describe, it, expect } from 'vitest';
import { createRun } from './run';
import { secondsToTicks } from './constants';
import { addStandIns } from './bots/roster';
import { step } from './step';
import { ensureCounterSpots, stationsFromSlots, type SlotContent } from './slots';
import { BASE_DRINKS } from '../data/drinks';
import type { AddOnWand, GearId } from '../data/gear';
import type { Customer, GameState, PlayerInput, SupplyId, TierId, Vec2 } from './types';
import { canSetDown, validStationSpots } from './rearrange';
import { applyGearInput, wandCards } from './gear';
import { SYRUP_ID } from '../data/layout';
import { validateInput } from './validate';

/** A Gear run at night with the back bar set by hand. */
function night(slots: SlotContent[], gear: (GearId | null)[], o: { tier?: TierId; people?: number; wands?: (AddOnWand | null)[]; standIns?: number } = {}): GameState {
  const tier = o.tier ?? 'stand';
  const people = Array.from({ length: o.people ?? 1 }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
  const s = createRun({ seed: 4, hostId: 'p1', players: people, settings: { bots: 0, dayLengthSec: 600 }, gear: true, tier });
  s.slots = [...slots];
  s.slotGear = [...gear];
  s.slotWand = o.wands ? [...o.wands] : slots.map(() => null);
  s.stations = stationsFromSlots(tier, s.slots, s.slotGear, s.slotWand);
  ensureCounterSpots(s);
  s.unlocked = [...BASE_DRINKS, 'drip'];
  for (const d of s.unlocked) s.menu[d] = true;
  for (const k of Object.keys(s.supplies) as SupplyId[]) s.supplies[k] = 99;
  if (o.standIns) addStandIns(s, o.standIns);
  return s;
}

const STAND: SlotContent[] = ['grinder', 'espresso', 'drip', 'trash'];
const STAND_GEAR: (GearId | null)[] = ['g1', 'e2', 'd1', 'b0'];

const at = (s: GameState, id: string): Vec2 => s.stations.find((x) => x.id === id)!.pos;
const move = (s: GameState, station: string, to: Vec2, playerId = 'p1'): GameState => step(s, [{ kind: 'moveStation', playerId, station, to }]);
const events = (s: GameState, kind: string) => s.log.filter((e) => e.kind === kind);
const lastEvent = (s: GameState, kind: string) => events(s, kind).at(-1);

describe('Round 5: rearranging at night (no morning pre-open)', () => {
  it('opening the shop starts the day with no pre-open', () => {
    let s = night(STAND, STAND_GEAR);
    s = step(s, [{ kind: 'ready', playerId: 'p1' }]);
    expect(s.phase).toBe('day');
    expect('preOpenUntil' in s).toBe(false);
    expect(s.log.some((e) => (e.kind as string).startsWith('preopen'))).toBe(false);
  });

  it('openDoors is no longer an input', () => {
    expect(validateInput({ kind: 'openDoors', playerId: 'p1' } as never)).toBeNull();
  });

  it('a machine moves at night; the day refuses', () => {
    let s = night(STAND, STAND_GEAR);
    expect(at(s, 'drip')).toEqual({ x: 5, y: 1 });
    s = move(s, 'drip', { x: 3, y: 3 });
    expect(at(s, 'drip')).toEqual({ x: 3, y: 3 });
    expect(lastEvent(s, 'station.place')?.data).toMatchObject({ by: 'p1', station: 'drip', to: { x: 3, y: 3 }, swapped: false });
    expect(s.slotPos?.[2]).toEqual({ x: 3, y: 3 });

    s = step(s, [{ kind: 'ready', playerId: 'p1' }]);
    expect(s.phase).toBe('day');
    expect(at(s, 'drip')).toEqual({ x: 3, y: 3 }); // opening the shop keeps the move
    s = move(s, 'drip', { x: 5, y: 2 });
    expect(at(s, 'drip')).toEqual({ x: 3, y: 3 });
    expect(events(s, 'station.place')).toHaveLength(1); // only the night move
  });

  it('canSetDown is true at night on a valid tile, false in the day', () => {
    const s = night(STAND, STAND_GEAR);
    expect(canSetDown(s, 'p1', 'drip', { x: 3, y: 3 })).toBe(true);
    let day = step(s, [{ kind: 'ready', playerId: 'p1' }]);
    expect(canSetDown(day, 'p1', 'drip', { x: 3, y: 3 })).toBe(false);
  });

  it('two machines swap slots', () => {
    let s = night(STAND, STAND_GEAR);
    s = move(s, 'espresso', { x: 5, y: 1 }); // drip's spot
    expect(at(s, 'espresso')).toEqual({ x: 5, y: 1 });
    expect(at(s, 'drip')).toEqual({ x: 3, y: 1 });
    expect(lastEvent(s, 'station.place')?.data.swapped).toBe(true);
  });

  it('fixed fixtures never move', () => {
    for (const id of ['counter', 'pickup', 'condiments', 'sink', 'supply', 'trayTable', SYRUP_ID]) {
      let s = night(STAND, STAND_GEAR);
      // syrup rack only appears with a wand
      if (id === SYRUP_ID) {
        s = night(['grinder', 'espresso', 'drip', 'trash'], ['g1', 'e3', 'd1', 'b0'], { wands: [null, 'weak', null, null] });
        if (!s.stations.some((x) => x.id === SYRUP_ID)) continue;
      }
      const was = s.stations.find((x) => x.id === id);
      if (!was) continue;
      const before = { ...was.pos };
      s = move(s, id, { x: 3, y: 3 });
      expect(at(s, id)).toEqual(before);
      expect(lastEvent(s, 'station.refuse')?.data).toEqual({ by: 'p1', station: id });
    }
  });

  it('a tile that would block the floor is refused', () => {
    let s = night(STAND, STAND_GEAR);
    s = move(s, 'drip', { x: 6, y: 3 }); // a spawn point
    expect(at(s, 'drip')).toEqual({ x: 5, y: 1 });
    expect(events(s, 'station.refuse')).toHaveLength(1);
  });

  it('a twin moves with its machine', () => {
    let s = night(['grinder', 'espresso', null, 'trash'], ['g1', 'e4', null, 'b0'], { wands: [null, 'weak', null, null] });
    expect(s.stations.filter((x) => x.id === 'espresso' || x.id === 'espresso-2' || x.id === 'steamer')).toHaveLength(3);
    s = move(s, 'steamer', { x: 3, y: 3 });
    expect(at(s, 'espresso')).toEqual({ x: 3, y: 3 });
    expect(at(s, 'steamer')).toEqual({ x: 3.55, y: 3 });
    expect(lastEvent(s, 'station.place')?.data.station).toBe('espresso');
  });

  it("a one-twin machine on the cart's last column has its twin on the left", () => {
    // Cart: last column is x=9; stand's x=7 is next to Round 5's milk & cream shelf at (7,3).
    let s = night(['grinder', 'espresso', null, null, 'trash'], ['g1', 'e3', null, null, 'b0'], {
      tier: 'cart',
      wands: [null, 'weak', null, null, null],
    });
    expect(at(s, 'steamer')).toEqual({ x: 3.55, y: 1 });
    s = move(s, 'espresso', { x: 9, y: 5 });
    expect(at(s, 'espresso')).toEqual({ x: 9, y: 5 });
    expect(at(s, 'steamer')).toEqual({ x: 8.45, y: 5 });
  });

  it('validStationSpots lists where a machine may go; none for a fixture', () => {
    const s = night(STAND, STAND_GEAR);
    const spots = validStationSpots(s, 'drip');
    const has = (x: number, y: number) => spots.some((v) => v.x === x && v.y === y);
    expect(has(1, 1)).toBe(true);
    expect(has(3, 3)).toBe(true);
    expect(has(6, 3)).toBe(false); // spawn point
    expect(has(5, 5)).toBe(false); // the pickup counter's only working tile
    expect(has(2, 6)).toBe(false); // the counter row
    expect(has(7, 4)).toBe(false); // the sink
    expect(has(7, 3)).toBe(false); // Round 5: milk & cream shelf
    expect(validStationSpots(s, 'sink')).toEqual([]);
    expect(validStationSpots(s, 'nope')).toEqual([]);
  });

  it('a night gear buy keeps a move that still fits', () => {
    let s = night(STAND, STAND_GEAR);
    s.cash = 500;
    s = move(s, 'drip', { x: 3, y: 3 });
    expect(s.slotPos?.[2]).toEqual({ x: 3, y: 3 });
    s = applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'c1' });
    expect(at(s, 'drip')).toEqual({ x: 3, y: 3 });
    expect(s.slotPos?.[2]).toEqual({ x: 3, y: 3 });
  });

  it('bots and disconnected people cannot move stations', () => {
    let s = night(STAND, STAND_GEAR, { people: 2 });
    s.players[1]!.bot = { personality: 'steady', reactionTicksLeft: 0, yieldTicksLeft: 0, plan: [], claim: null, mistakes: 0, claimDrink: null, thinkTicksLeft: 0, path: [], yields: 0, nodeRank: 0, waitTicks: 0, noticeTicksLeft: 0 };
    const was = { ...at(s, 'drip') };
    s = move(s, 'drip', { x: 3, y: 3 }, 'p2');
    expect(at(s, 'drip')).toEqual(was);
    s.players[0]!.connected = false;
    s = move(s, 'drip', { x: 3, y: 3 }, 'p1');
    expect(at(s, 'drip')).toEqual(was);
  });
});

/** Every connected person readies up: the shop opens straight into the day. */
const open = (s: GameState): GameState =>
  step(
    s,
    s.players.filter((p) => !p.bot && p.connected).map((p) => ({ kind: 'ready', playerId: p.id }) as PlayerInput),
  );

/** Run the day out to the next night. */
const toNight = (s: GameState): GameState => {
  let x = s;
  x.phaseTicksLeft = 1;
  for (let i = 0; i < secondsToTicks(120) && x.phase !== 'night'; i++) x = step(x, []);
  expect(x.phase).toBe('night');
  return x;
};

describe('Round 5: the move rules at night', () => {
  it('validateInput keeps a station id and a whole tile, and drops anything else', () => {
    expect(validateInput({ kind: 'moveStation', playerId: 'p1', station: 'drip', to: { x: 3, y: 2 } })).toEqual({ kind: 'moveStation', playerId: 'p1', station: 'drip', to: { x: 3, y: 2 } });
    const bad: unknown[] = [
      { kind: 'moveStation', playerId: 'p1', station: '', to: { x: 3, y: 2 } },
      { kind: 'moveStation', playerId: 'p1', station: 'x'.repeat(33), to: { x: 3, y: 2 } },
      { kind: 'moveStation', playerId: 'p1', station: 'drip', to: { x: 3.5, y: 2 } },
      { kind: 'moveStation', playerId: 'p1', station: 'drip', to: { x: -1, y: 2 } },
      { kind: 'moveStation', playerId: 'p1', station: 'drip', to: { x: 3, y: 99 } },
      { kind: 'moveStation', playerId: 'p1', station: 'drip', to: null },
      { kind: 'moveStation', playerId: 'p1', station: 7, to: { x: 3, y: 2 } },
    ];
    for (const b of bad) expect(validateInput(b as PlayerInput)).toBeNull();
  });

  it('a spawn point and the only tile the pickup counter is worked from are refused', () => {
    let s = night(STAND, STAND_GEAR);
    s = move(s, 'drip', { x: 6, y: 3 }); // a spawn point
    expect(at(s, 'drip')).toEqual({ x: 5, y: 1 });
    expect(events(s, 'station.refuse')).toHaveLength(1);
    s = move(s, 'drip', { x: 5, y: 5 }); // the pickup counter's only working tile
    expect(at(s, 'drip')).toEqual({ x: 5, y: 1 });
    expect(events(s, 'station.refuse')).toHaveLength(2);
  });

  it('a tile outside the bar area (the counter row and below, the walls) is refused', () => {
    let s = night(STAND, STAND_GEAR);
    for (const to of [{ x: 2, y: 6 }, { x: 0, y: 2 }, { x: 8, y: 2 }, { x: 2.5, y: 2 }]) s = move(s, 'drip', to);
    expect(at(s, 'drip')).toEqual({ x: 5, y: 1 });
    expect(s.slotPos).toBeUndefined();
    expect(events(s, 'station.refuse').length).toBeGreaterThanOrEqual(3);
  });
});

describe('Round 5: canSetDown mirrors moveStation (night)', () => {
  it('true on exactly the tiles where moveStation places, for every movable machine and a few odd drops', () => {
    const s = night(STAND, STAND_GEAR);
    for (const id of ['grinder', 'espresso', 'drip', 'trash', 'sink', 'supply', 'nope']) {
      const tiles: Vec2[] = [{ x: 2.5, y: 2 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 19, y: 2 }, { x: 3, y: 99 }];
      for (let y = 1; y <= 6; y++) for (let x = 0; x <= 8; x++) tiles.push({ x, y });
      for (const to of tiles) {
        const t = move(s, id, to);
        const placed = events(t, 'station.place').length > events(s, 'station.place').length;
        expect(canSetDown(s, 'p1', id, to), `${id} -> ${to.x},${to.y}`).toBe(placed);
      }
    }
  });

  it('agrees with validStationSpots for a person at night, and is false for the other gates', () => {
    const s = night(STAND, STAND_GEAR);
    const spots = validStationSpots(s, 'drip');
    expect(spots.length).toBeGreaterThan(0);
    for (const to of spots) expect(canSetDown(s, 'p1', 'drip', to)).toBe(true);
    const to = spots[0]!;
    expect(canSetDown(s, 'nobody', 'drip', to)).toBe(false);
    const away = night(STAND, STAND_GEAR);
    away.players[0]!.connected = false;
    expect(canSetDown(away, 'p1', 'drip', to)).toBe(false);
    expect(canSetDown({ ...s, phase: 'day' as const }, 'p1', 'drip', to)).toBe(false);
    const classic = { ...s };
    delete classic.gear;
    expect(canSetDown(classic, 'p1', 'drip', to)).toBe(false);
    const withBot = night(STAND, STAND_GEAR, { standIns: 1 });
    expect(canSetDown(withBot, 'sim-1', 'drip', to)).toBe(false);
  });
});

describe('Round 5: moves last the run', () => {
  it('a moved machine is still there tomorrow, and after a gear change rebuilds the bar', () => {
    let s = night(STAND, STAND_GEAR);
    s = move(s, 'drip', { x: 3, y: 3 });
    s = move(s, 'espresso', { x: 1, y: 1 });
    s = toNight(open(s));
    expect(at(s, 'drip')).toEqual({ x: 3, y: 3 });
    // Sell the grinder at night: the bar is rebuilt from the slots, and the moves hold.
    s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'sell', index: 0 }]);
    expect(s.slots?.[0]).toBeNull();
    expect(at(s, 'drip')).toEqual({ x: 3, y: 3 });
    expect(at(s, 'espresso')).toEqual({ x: 1, y: 1 });
    s = open(s);
    expect(at(s, 'drip')).toEqual({ x: 3, y: 3 });
    expect(at(s, 'espresso')).toEqual({ x: 1, y: 1 });
  });

  it('a moved espresso machine is still offered its wand at night (and gets it on its new spot)', () => {
    let s = night(['grinder', 'espresso', 'drip', 'trash'], ['g1', 'e3', 'd1', 'b0']);
    s = move(s, 'espresso', { x: 3, y: 3 });
    s = toNight(open(s));
    s.cash = 10_000;
    expect(wandCards(s).map((c) => [c.station, c.index])).toEqual([['espresso', 1]]);
    s = step(s, [{ kind: 'wand', playerId: 'p1', station: 'espresso', wand: 'weak' }]);
    expect(at(s, 'espresso')).toEqual({ x: 3, y: 3 });
    expect(at(s, 'steamer')).toEqual({ x: 3.55, y: 3 });
  });

  it('a grow keeps the moves when they still fit', () => {
    let s = night(STAND, STAND_GEAR);
    s = move(s, 'drip', { x: 4, y: 3 });
    s.cash = 100_000;
    s = step(s, [{ kind: 'grow', playerId: 'p1', tier: 'cart' }]);
    expect(s.tier).toBe('cart');
    expect(at(s, 'drip')).toEqual({ x: 4, y: 3 });
    expect(events(s, 'station.reset')).toHaveLength(0);
  });

  it("a grow that leaves the moved layout blocked puts every station back on the bigger shop's default spots", () => {
    let s = night(STAND, STAND_GEAR);
    s = move(s, 'drip', { x: 3, y: 3 });
    s = move(s, 'espresso', { x: 1, y: 3 }); // the cart's fridge comes here
    expect(at(s, 'espresso')).toEqual({ x: 1, y: 3 });
    s.cash = 100_000;
    s = step(s, [{ kind: 'grow', playerId: 'p1', tier: 'cart' }]);
    expect(s.tier).toBe('cart');
    expect(s.slotPos).toBeUndefined();
    expect(at(s, 'espresso')).toEqual({ x: 3, y: 1 });
    expect(at(s, 'drip')).toEqual({ x: 5, y: 1 });
    expect(events(s, 'station.reset')).toHaveLength(1);
  });

  it('a stand-in makes a drip at a moved drip machine; the move is still there that night', () => {
    let s = night(STAND, STAND_GEAR, { standIns: 1 });
    s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
    s = move(s, 'drip', { x: 3, y: 3 });
    s = move(s, 'espresso', { x: 7, y: 1 }); // swap with the bin
    s = open(s);
    expect(s.phase).toBe('day');
    s.eventSchedule = [];
    s.players[0].pos = { x: 6, y: 5 };
    const c: Customer = { id: 900, drink: 'drip', patienceLeft: 100_000, patienceMax: 100_000, stage: 'pickup', rungAt: s.tick };
    s.customers.push(c);
    for (let i = 0; i < secondsToTicks(120) && s.customers.length > 0; i++) s = step(s, []);
    expect(s.customers).toHaveLength(0);
    expect(s.today.drinks?.drip).toBe(1);
    expect(at(s, 'drip')).toEqual({ x: 3, y: 3 });
    s = toNight(s);
    expect(at(s, 'drip')).toEqual({ x: 3, y: 3 });
    expect(at(s, 'espresso')).toEqual({ x: 7, y: 1 });
  });
});
