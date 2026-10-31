import { describe, it, expect } from 'vitest';
import { createRun } from './run';
import { step } from './step';
import { ensureCounterSpots, stationsFromSlots, type SlotContent } from './slots';
import { secondsToTicks } from './constants';
import { ECONOMY } from '../data/economy';
import { BASE_DRINKS } from '../data/drinks';
import type { AddOnWand, GearId } from '../data/gear';
import type { Customer, GameState, PlayerInput, SupplyId, TierId, Vec2 } from './types';
import { addStandIns } from './bots/roster';
import { validStationSpots } from './rearrange';
import { wandCards } from './gear';
import { validateInput } from './validate';

/** A Gear run at night with the back bar set by hand (one person, p1, unless `people` says more). */
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

/** Everyone readies up: the shop opens into its pre-open. */
const open = (s: GameState): GameState =>
  step(
    s,
    s.players.filter((p) => !p.bot).map((p) => ({ kind: 'ready', playerId: p.id }) as PlayerInput),
  );

const STAND: SlotContent[] = ['grinder', 'espresso', 'drip', 'trash'];
const STAND_GEAR: (GearId | null)[] = ['g1', 'e2', 'd1', 'b0'];
const preOpen = () => open(night(STAND, STAND_GEAR));

const at = (s: GameState, id: string): Vec2 => s.stations.find((x) => x.id === id)!.pos;
const move = (s: GameState, station: string, to: Vec2, playerId = 'p1'): GameState => step(s, [{ kind: 'moveStation', playerId, station, to }]);
const events = (s: GameState, kind: string) => s.log.filter((e) => e.kind === kind);
const lastEvent = (s: GameState, kind: string) => events(s, kind).at(-1);

describe('FB2 C10: the pre-open', () => {
  it('opening a Gear morning starts a 15 s pre-open: doors shut, the day clock stands still', () => {
    let s = night(STAND, STAND_GEAR);
    s.owned.push({ itemId: 'test-rush', effects: [{ kind: 'traffic', mul: 50 }] });
    s = open(s);
    expect(s.phase).toBe('day');
    expect(s.preOpenUntil).toBe(s.tick + secondsToTicks(ECONOMY.preOpenSeconds));
    expect(lastEvent(s, 'preopen.start')?.data).toEqual({ until: s.preOpenUntil });
    const clock = s.phaseTicksLeft;
    for (let i = 0; i < secondsToTicks(10); i++) s = step(s, []);
    expect(s.phaseTicksLeft).toBe(clock);
    expect(s.customers).toHaveLength(0);
    expect(s.preOpenUntil).toBeDefined();
  });

  it('ends on its own when the 15 s run out; then the clock runs and customers come', () => {
    let s = night(STAND, STAND_GEAR);
    s.owned.push({ itemId: 'test-rush', effects: [{ kind: 'traffic', mul: 50 }] });
    s = open(s);
    const until = s.preOpenUntil!;
    while (s.tick < until) s = step(s, []);
    expect(s.preOpenUntil).toBeUndefined();
    expect(events(s, 'preopen.end')).toHaveLength(1);
    const clock = s.phaseTicksLeft;
    for (let i = 0; i < secondsToTicks(10); i++) s = step(s, []);
    expect(s.phaseTicksLeft).toBe(clock - secondsToTicks(10));
    expect(s.customers.length + (s.waiting?.length ?? 0)).toBeGreaterThan(0);
  });

  it('every connected person pressing Ready opens the doors (one is not enough)', () => {
    let s = open(night(STAND, STAND_GEAR, { people: 2 }));
    expect(s.preOpenUntil).toBeDefined();
    expect(s.ready).toEqual([]);
    s = step(s, [{ kind: 'ready', playerId: 'p2' }]);
    expect(s.preOpenUntil).toBeDefined();
    s = step(s, [{ kind: 'ready', playerId: 'p1' }]);
    expect(s.preOpenUntil).toBeUndefined();
    expect(events(s, 'preopen.end')).toHaveLength(1);
  });

  it('the host can open the doors at once; anyone else cannot', () => {
    let s = open(night(STAND, STAND_GEAR, { people: 2 }));
    s = step(s, [{ kind: 'openDoors', playerId: 'p2' }]);
    expect(s.preOpenUntil).toBeDefined();
    s = step(s, [{ kind: 'openDoors', playerId: 'p1' }]);
    expect(s.preOpenUntil).toBeUndefined();
  });

  it('the day events are pushed back by the pre-open, so the schedule keeps its place on the clock', () => {
    let s = open(night(STAND, STAND_GEAR));
    s.eventSchedule = [{ kind: 'rushHour', startTick: s.tick + 60 }];
    const before = s.eventSchedule[0].startTick;
    s = step(s, [{ kind: 'openDoors', playerId: 'p1' }]);
    expect(s.eventSchedule[0].startTick).toBe(before + 1);
  });
});

describe('FB2 C10: the inputs', () => {
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
    expect(validateInput({ kind: 'openDoors', playerId: 'p1' })).toEqual({ kind: 'openDoors', playerId: 'p1' });
  });

  it('a close-early vote in the pre-open is ignored', () => {
    let s = preOpen();
    s = step(s, [{ kind: 'closeEarly', playerId: 'p1', on: true }]);
    expect(s.closeVotes ?? []).toEqual([]);
  });
});

describe('FB2 C10: moving stations', () => {
  it('setting a machine down on another machine swaps the two', () => {
    let s = preOpen();
    s = move(s, 'espresso', { x: 1, y: 1 });
    expect(at(s, 'espresso')).toEqual({ x: 1, y: 1 });
    expect(at(s, 'grinder')).toEqual({ x: 3, y: 1 });
    expect(lastEvent(s, 'station.place')?.data).toEqual({ by: 'p1', station: 'espresso', to: { x: 1, y: 1 }, swapped: true });
    expect(s.slotPos?.slice(0, 2)).toEqual([{ x: 3, y: 1 }, { x: 1, y: 1 }]);
  });

  it('setting a machine down on a free tile moves it there', () => {
    let s = preOpen();
    s = move(s, 'drip', { x: 3, y: 3 });
    expect(at(s, 'drip')).toEqual({ x: 3, y: 3 });
    expect(lastEvent(s, 'station.place')?.data).toEqual({ by: 'p1', station: 'drip', to: { x: 3, y: 3 }, swapped: false });
  });

  it('a machine set down on an empty slot takes that spot, and the empty slot takes its old one', () => {
    let s = open(night(['grinder', null, 'drip', 'trash'], ['g1', null, 'd1', 'b0']));
    s = move(s, 'drip', { x: 3, y: 1 });
    expect(at(s, 'drip')).toEqual({ x: 3, y: 1 });
    expect(lastEvent(s, 'station.place')?.data.swapped).toBe(false);
    expect(s.slotPos?.slice(1, 3)).toEqual([{ x: 5, y: 1 }, { x: 3, y: 1 }]);
  });

  it('fixed fixtures never move', () => {
    for (const id of ['counter', 'pickup', 'condiments', 'sink', 'trayTable']) {
      let s = preOpen();
      const was = { ...at(s, id) };
      s = move(s, id, { x: 3, y: 3 });
      expect(at(s, id)).toEqual(was);
      expect(lastEvent(s, 'station.refuse')?.data).toEqual({ by: 'p1', station: id });
    }
  });

  it('a tile that would block the floor is refused: a spawn point, the only tile the pickup counter is worked from', () => {
    let s = preOpen();
    s = move(s, 'drip', { x: 6, y: 3 }); // a spawn point
    expect(at(s, 'drip')).toEqual({ x: 5, y: 1 });
    expect(events(s, 'station.refuse')).toHaveLength(1);
    s = move(s, 'drip', { x: 5, y: 5 }); // the pickup counter's only working tile
    expect(at(s, 'drip')).toEqual({ x: 5, y: 1 });
    expect(events(s, 'station.refuse')).toHaveLength(2);
  });

  it('a tile outside the bar area (the counter row and below, the walls) is refused', () => {
    let s = preOpen();
    for (const to of [{ x: 2, y: 6 }, { x: 0, y: 2 }, { x: 8, y: 2 }, { x: 2.5, y: 2 }]) s = move(s, 'drip', to);
    expect(at(s, 'drip')).toEqual({ x: 5, y: 1 });
    expect(events(s, 'station.refuse').length).toBeGreaterThanOrEqual(3);
  });

  it('outside the pre-open, moveStation does nothing (at night, and once the doors are open)', () => {
    let s = night(STAND, STAND_GEAR);
    s = move(s, 'drip', { x: 3, y: 3 });
    expect(at(s, 'drip')).toEqual({ x: 5, y: 1 });
    s = open(s);
    s = step(s, [{ kind: 'openDoors', playerId: 'p1' }]);
    s = move(s, 'drip', { x: 3, y: 3 });
    expect(at(s, 'drip')).toEqual({ x: 5, y: 1 });
    expect(s.slotPos).toBeUndefined();
  });

  it('bots cannot move stations', () => {
    let s = open(night(STAND, STAND_GEAR, { standIns: 1 }));
    s = move(s, 'drip', { x: 3, y: 3 }, 'sim-1');
    expect(at(s, 'drip')).toEqual({ x: 5, y: 1 });
  });

  it('a twin moves with its machine (by either id)', () => {
    // La Marzipana Due (two groups) with a weak add-on wand: three stations in one slot.
    let s = open(night(['grinder', 'espresso', null, 'trash'], ['g1', 'e4', null, 'b0'], { wands: [null, 'weak', null, null] }));
    const group = s.stations.filter((x) => x.id === 'espresso' || x.id === 'espresso-2' || x.id === 'steamer');
    expect(group).toHaveLength(3);
    s = move(s, 'steamer', { x: 3, y: 3 });
    expect(at(s, 'espresso')).toEqual({ x: 3, y: 3 });
    expect(at(s, 'steamer')).toEqual({ x: 3.55, y: 3 });
    expect(at(s, 'espresso-2')).toEqual({ x: 2.45, y: 3 });
    expect(lastEvent(s, 'station.place')?.data.station).toBe('espresso');
    s = move(s, 'espresso-2', { x: 7, y: 2 }); // the last column: its outer group would face the wall
    expect(at(s, 'espresso')).toEqual({ x: 3, y: 3 });
    expect(lastEvent(s, 'station.refuse')?.data).toEqual({ by: 'p1', station: 'espresso-2' });
  });

  it("a one-twin machine on the floor's last column has its twin on the left", () => {
    let s = open(night(['grinder', 'espresso', null, 'trash'], ['g1', 'e3', null, 'b0'], { wands: [null, 'weak', null, null] }));
    expect(at(s, 'steamer')).toEqual({ x: 3.55, y: 1 });
    s = move(s, 'espresso', { x: 7, y: 2 });
    expect(at(s, 'espresso')).toEqual({ x: 7, y: 2 });
    expect(at(s, 'steamer')).toEqual({ x: 6.45, y: 2 });
  });

  it('validStationSpots lists where a machine may go; none for a fixture', () => {
    const s = preOpen();
    const spots = validStationSpots(s, 'drip');
    const has = (x: number, y: number) => spots.some((v) => v.x === x && v.y === y);
    expect(has(1, 1)).toBe(true); // swap with the grinder
    expect(has(3, 3)).toBe(true);
    expect(has(6, 3)).toBe(false); // spawn point
    expect(has(5, 5)).toBe(false); // the pickup counter's only working tile
    expect(has(2, 6)).toBe(false); // the counter row
    expect(has(7, 4)).toBe(false); // the sink
    expect(validStationSpots(s, 'sink')).toEqual([]);
    expect(validStationSpots(s, 'nope')).toEqual([]);
  });
});

describe('FB2 C10: moves last the run', () => {
  const toNight = (s: GameState): GameState => {
    let x = s;
    x.phaseTicksLeft = 1;
    for (let i = 0; i < secondsToTicks(120) && x.phase !== 'night'; i++) x = step(x, []);
    expect(x.phase).toBe('night');
    return x;
  };

  it('a moved machine is still there tomorrow, and after a gear change rebuilds the bar', () => {
    let s = preOpen();
    s = move(s, 'drip', { x: 3, y: 3 });
    s = move(s, 'espresso', { x: 1, y: 1 });
    s = step(s, [{ kind: 'openDoors', playerId: 'p1' }]);
    s = toNight(s);
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
    let s = open(night(['grinder', 'espresso', 'drip', 'trash'], ['g1', 'e3', 'd1', 'b0']));
    s = move(s, 'espresso', { x: 3, y: 3 });
    s = step(s, [{ kind: 'openDoors', playerId: 'p1' }]);
    s = toNight(s);
    s.cash = 10_000;
    expect(wandCards(s).map((c) => [c.station, c.index])).toEqual([['espresso', 1]]);
    s = step(s, [{ kind: 'wand', playerId: 'p1', station: 'espresso', wand: 'weak' }]);
    expect(at(s, 'espresso')).toEqual({ x: 3, y: 3 });
    expect(at(s, 'steamer')).toEqual({ x: 3.55, y: 3 });
  });

  it('a grow keeps the moves when they still fit', () => {
    let s = preOpen();
    s = move(s, 'drip', { x: 4, y: 3 });
    s = step(s, [{ kind: 'openDoors', playerId: 'p1' }]);
    s = toNight(s);
    s.cash = 100_000;
    s = step(s, [{ kind: 'grow', playerId: 'p1', tier: 'cart' }]);
    expect(s.tier).toBe('cart');
    expect(at(s, 'drip')).toEqual({ x: 4, y: 3 });
    expect(events(s, 'station.reset')).toHaveLength(0);
  });

  it("a grow that leaves the moved layout blocked puts every station back on the bigger shop's default spots", () => {
    let s = preOpen();
    s = move(s, 'drip', { x: 3, y: 3 });
    s = move(s, 'espresso', { x: 1, y: 3 }); // the cart's fridge comes here
    expect(at(s, 'espresso')).toEqual({ x: 1, y: 3 });
    s = step(s, [{ kind: 'openDoors', playerId: 'p1' }]);
    s = toNight(s);
    s.cash = 100_000;
    s = step(s, [{ kind: 'grow', playerId: 'p1', tier: 'cart' }]);
    expect(s.tier).toBe('cart');
    expect(s.slotPos).toBeUndefined();
    expect(at(s, 'espresso')).toEqual({ x: 3, y: 1 });
    expect(at(s, 'drip')).toEqual({ x: 5, y: 1 });
    expect(events(s, 'station.reset')).toHaveLength(1);
  });
});

describe('FB2 C10: bots use the new spots', () => {
  it('a stand-in makes a drip at a moved drip machine', () => {
    let s = open(night(STAND, STAND_GEAR, { standIns: 1 }));
    s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
    s = move(s, 'drip', { x: 3, y: 3 });
    s = move(s, 'espresso', { x: 7, y: 1 }); // swap with the bin
    s = step(s, [{ kind: 'openDoors', playerId: 'p1' }]);
    s.eventSchedule = [];
    s.players[0].pos = { x: 6, y: 5 };
    const c: Customer = { id: 900, drink: 'drip', patienceLeft: 100_000, patienceMax: 100_000, stage: 'pickup', rungAt: s.tick };
    s.customers.push(c);
    for (let i = 0; i < secondsToTicks(120) && s.customers.length > 0; i++) s = step(s, []);
    expect(s.customers).toHaveLength(0);
    expect(s.today.drinks?.drip).toBe(1);
    expect(at(s, 'drip')).toEqual({ x: 3, y: 3 });
  });
});
