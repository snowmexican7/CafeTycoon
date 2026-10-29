import { describe, it, expect } from 'vitest';
import { SLOT_POSITIONS, TIER_LAYOUTS } from '../data/layout';
import { createRun, startDay } from './run';
import { step } from './step';
import { applyGrowInput, canMake, hasStation, stationsFor } from './growth';
import { applyEquipInput, applySlotInput, defaultSlots, equipmentSpent, reasonOff, slotCount, stationsFromSlots } from './slots';
import { EQUIPMENT } from '../data/equipment';
import { fittingsValue } from './score';
import { validateInput } from './validate';
import { menuDrinks } from './unlocks';
import { unlockedDrinks } from './unlocks';
import { migrateSnapshot } from '../storage/snapshotStore';
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

  it('growing resets slots to the new tier and keeps only the surplus of what the crew owns in equipment', () => {
    const s = night('stand');
    s.players[0].connected = true;
    s.equipment = ['steamer'];
    setSlots(s, ['grinder', 'espresso', 'espresso', 'trash']);
    applyGrowInput(s, { kind: 'grow', playerId: 'p1', tier: 'cart' });
    expect(s.tier).toBe('cart');
    expect(s.slots).toEqual(defaultSlots('cart'));
    // owned: grinder 1, espresso 2, steamer 1, trash 1 (the cold-brew tap was never bought back); cart defaults take one of each but the tap
    expect(s.equipment).toEqual(['espresso']);
    expect(s.stations).toStrictEqual(legacyStations('cart'));
  });

  it('growing conserves owned stations: a grinder removed before growing does not come back twice', () => {
    const s = night('stand');
    s.players[0].connected = true;
    applySlotInput(s, { kind: 'slot', playerId: 'p1', index: 0, station: null });
    expect(s.equipment).toEqual(['grinder']);
    applyGrowInput(s, { kind: 'grow', playerId: 'p1', tier: 'cart' });
    expect(s.slots).toEqual(defaultSlots('cart'));
    expect(s.equipment).toEqual([]);
    expect(s.stations.filter((x) => x.kind === 'grinder')).toHaveLength(1);
  });

  it('growing: a kind the new tier adds (the cart steamer) is part of the price, so a spare steamer is absorbed by it', () => {
    const s = night('stand');
    s.players[0].connected = true;
    s.cash = 1000;
    applyEquipInput(s, { kind: 'equip', playerId: 'p1', station: 'steamer' });
    expect(s.equipment).toEqual(['steamer']);
    applyGrowInput(s, { kind: 'grow', playerId: 'p1', tier: 'cart' });
    expect(s.equipment).toEqual([]);
    // growing again keeps surplus in a stable kind order
    const t = night('cart');
    t.players[0].connected = true;
    t.equipment = ['trash', 'grinder', 'espresso'];
    applyGrowInput(t, { kind: 'grow', playerId: 'p1', tier: 'cafe' });
    expect(t.equipment).toEqual(['grinder', 'espresso', 'trash']);
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

  it.each(TIERS)('old %s saves migrate to their default slots and no equipment (v24 → v25)', (tier) => {
    const old = run(tier, 0);
    delete old.slots;
    delete old.equipment;
    const stations = JSON.stringify(old.stations);
    const m = migrateSnapshot(24, old)!;
    expect(m.slots).toEqual(defaultSlots(old.tier));
    expect(m.slots).toEqual(defaultSlots(tier));
    expect(m.equipment).toEqual([]);
    expect(JSON.stringify(m.stations)).toBe(stations);
  });

  it('migration keeps slots and equipment a save already has', () => {
    const old = run('cafe', 0);
    old.slots = ['espresso', 'espresso', null, null, null, null];
    old.equipment = ['grinder'];
    const m = migrateSnapshot(24, old)!;
    expect(m.slots).toEqual(['espresso', 'espresso', null, null, null, null]);
    expect(m.equipment).toEqual(['grinder']);
  });

  it('a pre-slots save (v22, a migrated café with tier set) reaches v25 with default slots', () => {
    const old = run(undefined, 0);
    delete old.slots;
    delete old.equipment;
    old.tier = 'cafe';
    const m = migrateSnapshot(22, old)!;
    expect(m.slots).toEqual(defaultSlots('cafe'));
    expect(m.equipment).toEqual([]);
  });
});

describe('slot and equip inputs (FB1 WP5)', () => {
  const human = (tier?: TierId) => {
    const s = night(tier);
    s.players[0].connected = true;
    return s;
  };
  const slotIn = (index: number, station: Parameters<typeof applySlotInput>[1]['station'], playerId = 'p1') =>
    ({ kind: 'slot', playerId, index, station }) as const;
  const equipIn = (station: Parameters<typeof applyEquipInput>[1]['station'], playerId = 'p1') => ({ kind: 'equip', playerId, station }) as const;

  it('the price table', () => {
    expect(Object.fromEntries(Object.entries(EQUIPMENT).map(([k, v]) => [k, v.cost]))).toEqual({ espresso: 45, grinder: 30, steamer: 40, coldBrewTap: 35, trash: 15 });
    expect('counter' in EQUIPMENT).toBe(false);
  });

  describe('validation', () => {
    it('slot needs an integer index and a null or non-counter station', () => {
      expect(validateInput(slotIn(2, 'espresso'))).toEqual(slotIn(2, 'espresso'));
      expect(validateInput(slotIn(0, null))).toEqual(slotIn(0, null));
      expect(validateInput({ ...slotIn(0, 'counter') })).toBeNull();
      expect(validateInput({ ...slotIn(0, 'bogus' as never) })).toBeNull();
      expect(validateInput({ ...slotIn(1.5, 'espresso') })).toBeNull();
      expect(validateInput({ ...slotIn('1' as never, 'espresso') })).toBeNull();
      expect(validateInput({ kind: 'slot', playerId: 'p1', index: 1 } as never)).toBeNull();
    });
    it('equip needs a station kind other than the counter', () => {
      expect(validateInput(equipIn('steamer'))).toEqual(equipIn('steamer'));
      expect(validateInput(equipIn('counter'))).toBeNull();
      expect(validateInput(equipIn('nope' as never))).toBeNull();
      expect(validateInput(equipIn(null as never))).toBeNull();
    });
  });

  describe('refusals leave the state untouched', () => {
    const snap = (s: GameState) => JSON.stringify(s);
    it.each([
      ['the day phase', (s: GameState) => void (s.phase = 'day')],
      ['a bot', (s: GameState) => void (s.players[0].bot = true as never)],
      ['a disconnected player', (s: GameState) => void (s.players[0].connected = false)],
    ])('%s', (_n, spoil) => {
      const s = human();
      s.equipment = ['espresso'];
      spoil(s);
      const before = snap(s);
      applySlotInput(s, slotIn(0, null));
      applySlotInput(s, slotIn(5, 'espresso'));
      applyEquipInput(s, equipIn('steamer'));
      expect(snap(s)).toBe(before);
    });
    it('an unknown player', () => {
      const s = human();
      const before = snap(s);
      applySlotInput(s, slotIn(0, null, 'ghost'));
      applyEquipInput(s, equipIn('steamer', 'ghost'));
      expect(snap(s)).toBe(before);
    });
    it('an index out of range (negative, past the tier slot count, fractional)', () => {
      const s = human('stand');
      s.equipment = ['steamer'];
      const before = snap(s);
      for (const i of [-1, 4, 5, 99, 1.5, NaN]) applySlotInput(s, slotIn(i, 'steamer'));
      expect(snap(s)).toBe(before);
      expect(s.stations).toStrictEqual(legacyStations('stand'));
    });
    it("'counter' and unknown kinds", () => {
      const s = human();
      s.equipment = ['espresso'];
      const before = snap(s);
      applySlotInput(s, slotIn(5, 'counter'));
      applySlotInput(s, slotIn(5, 'bogus' as never));
      applyEquipInput(s, equipIn('counter'));
      applyEquipInput(s, equipIn('bogus' as never));
      expect(snap(s)).toBe(before);
    });
    it('placing a kind that is not in equipment leaves the stations unchanged', () => {
      const s = human();
      const before = snap(s);
      applySlotInput(s, slotIn(5, 'espresso'));
      applySlotInput(s, slotIn(0, 'steamer'));
      expect(snap(s)).toBe(before);
      expect(s.stations).toStrictEqual(legacyStations('cafe'));
    });
    it('equip without the cash', () => {
      const s = human();
      s.cash = 39.99;
      const before = snap(s);
      applyEquipInput(s, equipIn('steamer'));
      expect(snap(s)).toBe(before);
    });
  });

  describe('equip', () => {
    it('deducts the price and fills the first empty slot at once', () => {
      const s = human();
      s.cash = 100.1;
      applyEquipInput(s, equipIn('espresso'));
      expect(s.cash).toBe(55.1);
      expect(s.slots).toEqual(['grinder', 'espresso', 'steamer', 'coldBrewTap', 'trash', 'espresso']);
      expect(s.equipment).toEqual([]);
      expect(s.stations.map((x) => x.id)).toEqual(['grinder', 'espresso', 'steamer', 'coldBrewTap', 'trash', 'espresso-2', 'counter']);
      expect(s.equipLog).toEqual([{ station: 'espresso', day: s.day, by: s.players[0].name }]);
    });
    it('lands in equipment when every slot is taken', () => {
      const s = human();
      applyEquipInput(s, equipIn('espresso'));
      applyEquipInput(s, equipIn('trash'));
      expect(s.equipment).toEqual(['trash']);
      expect(s.stations).toHaveLength(7);
      expect(s.cash).toBe(1000 - 45 - 15);
    });
    it('fills the first empty slot, not the last', () => {
      const s = human();
      applySlotInput(s, slotIn(1, null));
      applyEquipInput(s, equipIn('grinder'));
      expect(s.slots).toEqual(['grinder', 'grinder', 'steamer', 'coldBrewTap', 'trash', null]);
      expect(s.equipment).toEqual(['espresso']);
    });
  });

  describe('slot', () => {
    it('null empties the slot into equipment and the station disappears from state.stations at once', () => {
      const s = human();
      applySlotInput(s, slotIn(4, null));
      expect(s.slots![4]).toBeNull();
      expect(s.equipment).toEqual(['trash']);
      expect(s.stations.some((x) => x.kind === 'trash')).toBe(false);
      expect(hasStation(s, 'trash')).toBe(false);
    });
    it('removing the steamer takes the milk drinks off the board', () => {
      const s = human();
      applySlotInput(s, slotIn(2, null));
      expect(canMake(s, 'latte')).toBe(false);
    });
    it('placing from equipment fills an empty slot; the station is back', () => {
      const s = human();
      applySlotInput(s, slotIn(4, null));
      applySlotInput(s, slotIn(5, 'trash'));
      expect(s.slots).toEqual(['grinder', 'espresso', 'steamer', 'coldBrewTap', null, 'trash']);
      expect(s.equipment).toEqual([]);
      expect(s.stations.find((x) => x.kind === 'trash')!.pos).toEqual(SLOT_POSITIONS.cafe[5]);
    });
    it('a swap puts the old kind into equipment', () => {
      const s = human();
      s.equipment = ['espresso'];
      applySlotInput(s, slotIn(2, 'espresso'));
      expect(s.slots![2]).toBe('espresso');
      expect(s.equipment).toEqual(['steamer']);
      expect(s.stations.map((x) => x.id)).toEqual(['grinder', 'espresso', 'espresso-2', 'coldBrewTap', 'trash', 'counter']);
    });
    it('emptying an empty slot, or placing what is already there, changes nothing', () => {
      const s = human();
      const before = JSON.stringify(s);
      applySlotInput(s, slotIn(5, null));
      applySlotInput(s, slotIn(0, 'grinder'));
      expect(JSON.stringify(s)).toBe(before);
    });
    it('leaves the mop alone', () => {
      const s = human();
      const mop = JSON.stringify(s.mop);
      applySlotInput(s, slotIn(0, null));
      applyEquipInput(s, equipIn('grinder'));
      expect(JSON.stringify(s.mop)).toBe(mop);
    });
    it('goes through step() like every night input', () => {
      const s = human();
      const out = step(s, [slotIn(4, null)]);
      expect(out.slots![4]).toBeNull();
    });
  });

  it('two espresso machines get the ids espresso and espresso-2', () => {
    const s = human();
    s.slots = ['grinder', 'espresso', null, 'coldBrewTap', 'trash', null];
    applyEquipInput(s, equipIn('espresso'));
    expect(s.stations.filter((x) => x.kind === 'espresso').map((x) => x.id)).toEqual(['espresso', 'espresso-2']);
  });

  it('fittingsValue grows by half of the equipment spend', () => {
    const s = human();
    const base = fittingsValue(s);
    applyEquipInput(s, equipIn('espresso'));
    applyEquipInput(s, equipIn('trash'));
    expect(equipmentSpent(s)).toBe(60);
    expect(fittingsValue(s)).toBe(base + 30);
  });

  it('a kerbside stand never offers latte; buying a steamer and placing it makes latte makeable', () => {
    const s = human('stand');
    expect(unlockedDrinks(s)).not.toContain('latte');
    expect(menuDrinks(s)).not.toContain('latte');
    s.unlocked = [...unlockedDrinks(s), 'latte'];
    expect(unlockedDrinks(s)).not.toContain('latte');
    applyEquipInput(s, equipIn('steamer'));
    expect(s.equipment).toEqual(['steamer']);
    applySlotInput(s, slotIn(2, 'steamer'));
    expect(s.equipment).toEqual(['coldBrewTap']);
    expect(unlockedDrinks(s)).toContain('latte');
    s.supplies = { beans: 10, milk: 10, concentrate: 10, flavour: 10, pastry: 10 };
    s.menu.latte = true;
    expect(reasonOff(s, 'latte')).toBeNull();
    s.menu.latte = false;
    expect(reasonOff(s, 'latte')).toBe('off');
  });
});

describe('slots determinism', () => {
  /** createRun, scenario forced to 'normal' (after createRun, before startDay), then exactly 900 day ticks. */
  const play = (seed: number, bots: number) => {
    const s = createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots } });
    s.scenario = 'normal';
    let x = startDay(s);
    for (let i = 0; i < 900; i++) x = step(x, []);
    return x;
  };

  it('seed 5, one player, no bots: the rng after 900 ticks is the golden from the base commit (e503518)', () => {
    // golden measured on fb1 @ e503518 (before station slots)
    const s = play(5, 0);
    expect(s.rng).toBe(1798888878);
    expect(s.slots).toEqual(defaultSlots('cafe'));
    expect(s.equipment).toEqual([]);
  });

  it('seed 3, one player, no bots: the rng after 900 ticks is the golden from the base commit (e503518)', () => {
    // golden measured on fb1 @ e503518 (before station slots)
    expect(play(3, 0).rng).toBe(-2058150776);
  });

  it('seed 5, one player, one bot: the rng after 900 ticks is the golden from the base commit (e503518)', () => {
    // golden measured on fb1 @ e503518 (before station slots)
    expect(play(5, 1).rng).toBe(-1928183945);
  });
});
