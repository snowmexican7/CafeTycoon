import { describe, it, expect } from 'vitest';
import { SLOT_POSITIONS, TIER_LAYOUTS } from '../data/layout';
import { createRun, startDay } from './run';
import { step } from './step';
import { applyGrowInput, canMake, hasStation, stationsFor } from './growth';
import { defaultSlots, reasonOff, slotCount, stationsFromSlots } from './slots';
import { unlockedDrinks } from './unlocks';
import type { GameState, Station, TierId } from './types';

const TIERS: TierId[] = ['stand', 'cart', 'cafe'];

/** The stations exactly as `stationsFor` built them before slots (the pre-WP5 code, verbatim). */
const legacyStations = (tier: TierId): Station[] =>
  TIER_LAYOUTS[tier].stations.map((s) => ({ id: s.id, kind: s.kind, pos: { ...s.pos }, busyTicksLeft: 0, output: null, occupiedBy: null }));

const run = (tier?: TierId, bots = 2, seed = 7) =>
  createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots }, tier });

const night = (tier?: TierId) => {
  const s = run(tier, 0);
  s.phase = 'night';
  s.cash = 1000;
  return s;
};

const setSlots = (s: GameState, slots: GameState['slots']) => {
  s.slots = slots;
  s.stations = stationsFromSlots(s.tier, slots!);
};

describe('station slots (FB1 WP5)', () => {
  it('slot positions per tier: the café keeps 1, 3, 5, 8, 10 and gains (11,1)', () => {
    expect(SLOT_POSITIONS.cafe).toEqual([{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 5, y: 1 }, { x: 8, y: 1 }, { x: 10, y: 1 }, { x: 11, y: 1 }]);
    expect(SLOT_POSITIONS.cart.map((p) => p.x)).toEqual([1, 3, 5, 7, 9]);
    expect(SLOT_POSITIONS.stand.map((p) => p.x)).toEqual([1, 3, 5, 7]);
    expect(slotCount('stand')).toBe(4);
    expect(slotCount('cart')).toBe(5);
    expect(slotCount('cafe')).toBe(6);
    expect(slotCount(undefined)).toBe(6);
  });

  it('default slots are the tier layout in slot order; the café sixth slot is empty', () => {
    expect(defaultSlots('cafe')).toEqual(['grinder', 'espresso', 'steamer', 'coldBrewTap', 'trash', null]);
    expect(defaultSlots(undefined)).toEqual(defaultSlots('cafe'));
    expect(defaultSlots('cart')).toEqual(['grinder', 'espresso', 'steamer', 'coldBrewTap', 'trash']);
    expect(defaultSlots('stand')).toEqual(['grinder', 'espresso', 'coldBrewTap', 'trash']);
  });

  it.each(TIERS)('default slots rebuild exactly the stations %s had before slots (ids, order, positions, counter last)', (tier) => {
    const built = stationsFromSlots(tier, defaultSlots(tier));
    expect(built).toStrictEqual(legacyStations(tier));
    expect(JSON.stringify(built)).toBe(JSON.stringify(legacyStations(tier)));
    expect(JSON.stringify(stationsFor(tier))).toBe(JSON.stringify(legacyStations(tier)));
    expect(built[built.length - 1].kind).toBe('counter');
  });

  it('a second machine of a kind gets the next id; empty slots leave a gap; the counter stays last', () => {
    const built = stationsFromSlots('cafe', ['espresso', 'espresso', null, 'grinder', null, 'espresso']);
    expect(built.map((s) => s.id)).toEqual(['espresso', 'espresso-2', 'grinder', 'espresso-3', 'counter']);
    expect(built.map((s) => s.pos.x)).toEqual([1, 3, 8, 11, 6]);
    expect(built[1]).toEqual({ id: 'espresso-2', kind: 'espresso', pos: { x: 3, y: 1 }, busyTicksLeft: 0, output: null, occupiedBy: null });
    expect(built[4]).toEqual({ id: 'counter', kind: 'counter', pos: { x: 6, y: 6 }, busyTicksLeft: 0, output: null, occupiedBy: null });
  });

  it('a new run carries its slots and no spare equipment', () => {
    for (const tier of TIERS) {
      const s = run(tier);
      expect(s.slots).toEqual(defaultSlots(tier));
      expect(s.equipment).toEqual([]);
      expect(s.stations).toStrictEqual(legacyStations(tier));
    }
  });

  it('hasStation and canMake read the floor: a café without its steamer cannot make a latte', () => {
    const s = run('cafe', 0);
    expect(hasStation(s, 'steamer')).toBe(true);
    expect(canMake(s, 'latte')).toBe(true);
    setSlots(s, ['grinder', 'espresso', null, 'coldBrewTap', 'trash', null]);
    expect(hasStation(s, 'steamer')).toBe(false);
    expect(canMake(s, 'latte')).toBe(false);
    expect(canMake(s, 'espresso')).toBe(true);
    expect(canMake(run(undefined, 0), 'latte')).toBe(true);
    s.unlocked = ['espresso', 'latte', 'coldBrew', 'matcha'];
    expect(unlockedDrinks(s)).toEqual(['espresso', 'coldBrew']);
  });

  it('reasonOff says why a drink is off the board: no station, then no stock, then switched off', () => {
    const s = run('cafe', 0);
    expect(reasonOff(s, 'latte')).toBeNull();
    s.menu.latte = false;
    expect(reasonOff(s, 'latte')).toBe('off');
    s.supplies.milk = 0;
    expect(reasonOff(s, 'latte')).toBe('noStock');
    setSlots(s, ['grinder', 'espresso', null, 'coldBrewTap', 'trash', null]);
    expect(reasonOff(s, 'latte')).toBe('noStation');
    expect(reasonOff(s, 'espresso')).toBeNull();
  });

  it('growing resets slots to the new tier and moves machines placed beyond the old defaults to equipment', () => {
    const s = night('stand');
    s.players[0].connected = true;
    s.equipment = ['steamer'];
    setSlots(s, ['grinder', 'espresso', 'espresso', 'trash']);
    applyGrowInput(s, { kind: 'grow', playerId: 'p1', tier: 'cart' });
    expect(s.tier).toBe('cart');
    expect(s.slots).toEqual(defaultSlots('cart'));
    expect(s.equipment).toEqual(['steamer', 'espresso']);
    expect(s.stations).toStrictEqual(legacyStations('cart'));
  });

  it('growing a default shop keeps equipment empty and the floor exactly as before', () => {
    const s = night('stand');
    applyGrowInput(s, { kind: 'grow', playerId: 'p1', tier: 'cart' });
    expect(s.equipment).toEqual([]);
    expect(s.stations).toStrictEqual(legacyStations('cart'));
    applyGrowInput(s, { kind: 'grow', playerId: 'p1', tier: 'cafe' });
    expect(s.slots).toEqual(defaultSlots('cafe'));
    expect(s.equipment).toEqual([]);
    expect(s.stations).toStrictEqual(legacyStations('cafe'));
  });

  it.each([undefined, 'stand'] as const)('a default %s run plays 900 day ticks identically to the same run built before slots', (tier) => {
    const a = run(tier);
    const b = run(tier);
    delete b.slots;
    delete b.equipment;
    b.stations = legacyStations(tier ?? 'cafe');
    expect('slots' in a).toBe(true);
    let x = startDay(a);
    let y = startDay(b);
    for (let i = 0; i < 900; i++) {
      x = step(x, []);
      y = step(y, []);
    }
    expect(x.phase).toBe('day');
    expect(x.slots).toEqual(defaultSlots(tier));
    const { slots: _s, equipment: _e, ...rest } = x;
    expect(JSON.stringify(rest)).toBe(JSON.stringify(y));
    expect(x.rng).toEqual(y.rng);
  });
});
