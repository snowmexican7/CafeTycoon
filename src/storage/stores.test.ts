import { describe, it, expect } from 'vitest';
import { createRun, startDay } from '../sim/run';
import { applyGearInput } from '../sim/gear';
import { tillNext } from '../sim/till';
import type { GameState } from '../sim/types';
import { defaultSlots } from '../sim/slots';
import { createHistoryStore } from './historyStore';
import { createSettingsStore } from './settingsStore';
import { SNAPSHOT_VERSION, createSnapshotStore, migrateSnapshot } from './snapshotStore';
import { memoryStorage } from './storageLike';

describe('stores', () => {
  it('round-trips a snapshot and survives garbage', () => {
    const st = memoryStorage();
    const store = createSnapshotStore(st);
    const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
    store.save(s);
    expect(store.load()).toEqual(s);
    st.setItem('cafetycoon.run', '{not json');
    expect(store.load()).toBeNull();
    store.clear();
    expect(store.load()).toBeNull();
  });

  it('keeps history newest first, capped at 50', () => {
    const h = createHistoryStore(memoryStorage());
    for (let i = 0; i < 55; i++) {
      h.append({ date: `d${i}`, seed: i, scenario: 'normal', players: ['K'], daysCompleted: 7, score: i, itemsBought: [] });
    }
    expect(h.list()).toHaveLength(50);
    expect(h.list()[0].seed).toBe(54);
    expect(h.list()[49].seed).toBe(5);
  });

  it('generates a token once and merges settings', () => {
    const st = memoryStorage();
    let n = 0;
    const s = createSettingsStore(st, () => `tok${++n}`);
    expect(s.get()).toEqual({ playerName: 'Barista', playerToken: 'tok1', pace: 3, dayLengthSec: 150, nightLengthSec: 120, bots: 'auto' });
    expect(createSettingsStore(st, () => 'other').get().playerToken).toBe('tok1');
    expect(s.set({ playerName: 'Ken' }).playerName).toBe('Ken');
    expect(s.get().pace).toBe(3);
  });

  it('bots defaults to auto, persists a choice, and ignores garbage', () => {
    const st = memoryStorage();
    const s = createSettingsStore(st, () => 'tok');
    expect(s.get().bots).toBe('auto');
    expect(s.set({ bots: 0 }).bots).toBe(0);
    expect(createSettingsStore(st, () => 'x').get().bots).toBe(0);
    for (const bad of ['lots', -1, 7, 1.5, null]) {
      st.setItem('cafetycoon.settings', JSON.stringify({ playerToken: 'tok', bots: bad }));
      expect(s.get().bots).toBe('auto');
    }
    st.setItem('cafetycoon.settings', JSON.stringify({ playerToken: 'tok', bots: 2 }));
    expect(s.get().bots).toBe(2);
  });
});

describe('snapshot versioning', () => {
  it('pins the snapshot version', () => {
    expect(SNAPSHOT_VERSION).toBe(28);
  });

  /** A Gear day as a v3.x build saved it: no pickup/condiment spots, no condiment state, a customer already rung. */
  const oldGearDay = (gear: boolean): GameState => {
    const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear });
    if (gear) applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'c1' });
    startDay(s);
    s.customers = [{ id: 1, drink: 'latte', patienceLeft: 500, patienceMax: 900, rungAt: 3 }];
    delete (s as { condiments?: unknown }).condiments;
    delete (s as { condimentBoxes?: unknown }).condimentBoxes;
    delete (s as { steep?: unknown }).steep;
    s.stations = s.stations.filter((x) => x.id !== 'pickup' && x.id !== 'condiments');
    return s;
  };

  it('a mid-day v27 Gear save puts rung customers back in line (Review Focus 5)', () => {
    const s = oldGearDay(true);
    const m = migrateSnapshot(27, s)!;
    expect(m.customers[0]).toMatchObject({ stage: 'order' });
    expect(m.customers[0].rungAt).toBeUndefined();
    expect(tillNext(m)?.id).toBe(1);
    expect([m.condiments, m.condimentBoxes, m.steep]).toEqual([{ servings: 20 }, 0, undefined]);
    expect(m.stations.map((x) => x.id)).toEqual(expect.arrayContaining(['pickup', 'condiments']));
    expect(m.stations.filter((x) => x.id === 'pickup')).toHaveLength(1);
  });

  it('a v27 Gear save keeps condiment state it already has', () => {
    const s = oldGearDay(true);
    s.condiments = { servings: 7 };
    s.condimentBoxes = 2;
    const m = migrateSnapshot(27, s)!;
    expect([m.condiments, m.condimentBoxes]).toEqual([{ servings: 7 }, 2]);
  });

  it('a v27 classic save gains nothing', () => {
    const s = oldGearDay(false);
    const before = JSON.stringify(s);
    const m = migrateSnapshot(27, s)!;
    expect(JSON.stringify(m)).toBe(before);
    expect(m.condiments).toBeUndefined();
    expect(m.condimentBoxes).toBeUndefined();
    expect(m.stations.some((x) => x.id === 'pickup' || x.id === 'condiments')).toBe(false);
    expect(m.customers[0]).toEqual({ id: 1, drink: 'latte', patienceLeft: 500, patienceMax: 900, rungAt: 3 });
  });

  it('migrates a version-23 save: lastCall stays absent', () => {
    const old = createRun({ seed: 2, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
    const out = migrateSnapshot(23, old)!;
    expect(out).not.toBeNull();
    expect(out.lastCall).toBeUndefined();
  });

  it('migrates a version-22 save through 22 -> 23 -> 24 -> 25: walkouts at 0, lastCall absent', () => {
    const old = createRun({ seed: 2, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
    delete (old.today as { soldOutWalkouts?: number }).soldOutWalkouts;
    delete (old as { slots?: unknown }).slots;
    delete (old as { equipment?: unknown }).equipment;
    const out = migrateSnapshot(22, old)!;
    expect(out).not.toBeNull();
    expect(out.today.soldOutWalkouts).toBe(0);
    expect(out.lastCall).toBeUndefined();
    expect(out.slots).toEqual(defaultSlots('cafe'));
    expect(out.equipment).toEqual([]);
  });

  it('migrates a version-4 save (three drinks, no flavours) to the B5 menu', () => {
    const st = memoryStorage();
    const store = createSnapshotStore(st);
    const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
    s.day = 4;
    const old = JSON.parse(JSON.stringify(s));
    delete old.unlocked;
    delete old.freshDrinks;
    delete old.supplies.flavour;
    old.menu = { espresso: true, latte: false, coldBrew: true };
    old.today.drinks = { espresso: 2, latte: 0, coldBrew: 1 };
    st.setItem('cafetycoon.run', JSON.stringify({ version: 4, state: old }));
    const got = store.load()!;
    expect(got.unlocked).toEqual(['espresso', 'latte', 'coldBrew', 'icedLatte']);
    expect(got.menu).toMatchObject({ latte: false, icedLatte: true, mocha: true });
    expect(got.supplies.flavour).toBe(0);
    expect(got.today.drinks?.mocha).toBe(0);
  });

  it('migrates a version-21 save (P3 B13): the run counts as the full café, stations untouched', () => {
    const st = memoryStorage();
    const store = createSnapshotStore(st);
    const s = createRun({ seed: 9, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
    const old = JSON.parse(JSON.stringify(s));
    st.setItem('cafetycoon.run', JSON.stringify({ version: 21, state: old }));
    const back = store.load()!;
    expect(back.tier).toBe('cafe');
    expect(back.stations).toEqual(s.stations);
    expect(back.stations.map((x) => x.kind)).toContain('steamer');
  });

  it('migrates a version-3 save (no forecast) instead of dropping it', () => {
    const st = memoryStorage();
    const store = createSnapshotStore(st);
    const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
    const old = JSON.parse(JSON.stringify(s));
    delete old.forecast;
    st.setItem('cafetycoon.run', JSON.stringify({ version: 3, state: old }));
    expect(store.load()).toEqual({ ...s, tier: 'cafe', today: { ...s.today, soldOutWalkouts: 0 } }); // P3 B13: every old run is the café; FB1 WP4: walkouts start at 0
    st.setItem('cafetycoon.run', JSON.stringify({ version: 2, state: old }));
    expect(store.load()).toBeNull();
    st.setItem('cafetycoon.run', JSON.stringify({ version: SNAPSHOT_VERSION + 1, state: s }));
    expect(store.load()).toBeNull();
  });

  it('stamps saves with the schema version and refuses other versions', () => {
    const st = memoryStorage();
    const store = createSnapshotStore(st);
    const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
    store.save(s);
    expect(JSON.parse(st.getItem('cafetycoon.run')!).version).toBe(SNAPSHOT_VERSION);
    st.setItem('cafetycoon.run', JSON.stringify({ version: 2, state: s }));
    expect(store.load()).toBeNull();
    st.setItem('cafetycoon.run', JSON.stringify(s)); // legacy unversioned blob
    expect(store.load()).toBeNull();
    st.setItem('cafetycoon.run', JSON.stringify({ version: SNAPSHOT_VERSION, state: null }));
    expect(store.load()).toBeNull();
  });
});
