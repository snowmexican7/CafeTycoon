import { describe, it, expect } from 'vitest';
import { createRun } from '../sim/run';
import { createHistoryStore } from './historyStore';
import { createSettingsStore } from './settingsStore';
import { SNAPSHOT_VERSION, createSnapshotStore } from './snapshotStore';
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
    expect(s.get()).toEqual({ playerName: 'Barista', playerToken: 'tok1', pace: 3, dayLengthSec: 150, nightLengthSec: 60 });
    expect(createSettingsStore(st, () => 'other').get().playerToken).toBe('tok1');
    expect(s.set({ playerName: 'Ken' }).playerName).toBe('Ken');
    expect(s.get().pace).toBe(3);
  });
});

describe('snapshot versioning', () => {
  it('is on version 9', () => {
    expect(SNAPSHOT_VERSION).toBe(17);
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

  it('migrates a version-3 save (no forecast) instead of dropping it', () => {
    const st = memoryStorage();
    const store = createSnapshotStore(st);
    const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
    const old = JSON.parse(JSON.stringify(s));
    delete old.forecast;
    st.setItem('cafetycoon.run', JSON.stringify({ version: 3, state: old }));
    expect(store.load()).toEqual(s);
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
