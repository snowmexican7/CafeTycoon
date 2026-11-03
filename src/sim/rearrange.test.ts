import { describe, it, expect } from 'vitest';
import { createRun } from './run';
import { step } from './step';
import { ensureCounterSpots, stationsFromSlots, type SlotContent } from './slots';
import { BASE_DRINKS } from '../data/drinks';
import type { AddOnWand, GearId } from '../data/gear';
import type { GameState, PlayerInput, SupplyId, TierId, Vec2 } from './types';
import { canSetDown, validStationSpots } from './rearrange';
import { applyGearInput } from './gear';
import { SYRUP_ID } from '../data/layout';
import { validateInput } from './validate';

/** A Gear run at night with the back bar set by hand. */
function night(slots: SlotContent[], gear: (GearId | null)[], o: { tier?: TierId; people?: number; wands?: (AddOnWand | null)[] } = {}): GameState {
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
    expect(s.preOpenUntil).toBeUndefined();
    expect(events(s, 'preopen.start')).toHaveLength(0);
  });

  it('moveStation is refused as openDoors (input gone)', () => {
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
    const was = { ...at(s, 'drip') };
    s = move(s, 'drip', { x: 5, y: 2 });
    expect(at(s, 'drip')).toEqual(was);
    expect(events(s, 'station.refuse').length + events(s, 'station.place').filter((e) => e.data.to && (e.data.to as Vec2).y === 2).length).toBe(0);
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
    for (const id of ['counter', 'pickup', 'condiments', 'sink', 'trayTable', SYRUP_ID]) {
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
    expect(has(6, 3)).toBe(false);
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
