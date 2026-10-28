import { describe, it, expect } from 'vitest';
import { createRun } from '../sim/run';
import { createHistoryStore } from './historyStore';
import { createSettingsStore } from './settingsStore';
import { createSnapshotStore } from './snapshotStore';
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
