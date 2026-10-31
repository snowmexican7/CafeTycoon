import { describe, it, expect } from 'vitest';
import { createRun } from '../sim/run';
import type { GameState } from '../sim/types';
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
    expect(s.get()).toEqual({ playerName: 'Barista', playerToken: 'tok1', pace: 3, dayLengthSec: 150, nightLengthSec: 120, bots: 'auto', soloBots: 1 });
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

  it('soloBots defaults to 1, even for saved settings that predate it, and round-trips 0', () => {
    const st = memoryStorage();
    const s = createSettingsStore(st, () => 'tok');
    expect(s.get().soloBots).toBe(1);
    st.setItem('cafetycoon.settings', JSON.stringify({ playerToken: 'tok', playerName: 'K', bots: 'auto' }));
    expect(s.get().soloBots).toBe(1);
    expect(s.get().bots).toBe('auto');
    for (const bad of ['lots', -1, 7, 1.5, null]) {
      st.setItem('cafetycoon.settings', JSON.stringify({ playerToken: 'tok', soloBots: bad }));
      expect(s.get().soloBots).toBe(1);
    }
    expect(s.set({ soloBots: 0 }).soloBots).toBe(0);
    expect(createSettingsStore(st, () => 'x').get().soloBots).toBe(0);
    expect(s.set({ soloBots: 'auto' }).soloBots).toBe('auto');
    expect(s.get().soloBots).toBe('auto');
  });
});

describe('snapshot versioning', () => {
  it('pins the snapshot version', () => {
    expect(SNAPSHOT_VERSION).toBe(30);
  });

  it('FB2 C9 (no save compatibility): every older save is turned away, a current one loads with its fixed spots', () => {
    const st = memoryStorage();
    const store = createSnapshotStore(st);
    const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear: true });
    for (const v of [3, 22, 27, 28]) {
      st.setItem('cafetycoon.run', JSON.stringify({ version: v, state: s }));
      expect(store.load(), `v${v}`).toBeNull();
    }
    expect(migrateSnapshot(28, JSON.parse(JSON.stringify(s)))).toBeNull();
    const old = JSON.parse(JSON.stringify(s)) as GameState;
    old.stations = old.stations.filter((x) => x.id !== 'pickup' && x.id !== 'condiments');
    const m = migrateSnapshot(SNAPSHOT_VERSION, old)!;
    expect(m.stations.filter((x) => x.id === 'pickup')).toHaveLength(1);
    expect(m.stations.filter((x) => x.id === 'condiments')).toHaveLength(1);
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
