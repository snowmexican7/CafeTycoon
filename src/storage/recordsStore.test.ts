import { describe, it, expect } from 'vitest';
import { createRun } from '../sim/run';
import { createRecordsStore, foldRecords, emptyRecords } from './recordsStore';
import { memoryStorage } from './storageLike';
import type { Award } from '../sim/awards';
import type { GameState } from '../sim/types';

const day = (n: number, served: number, lost = 2) => ({ day: n, served, lost, turnedAway: 0, sales: served * 5, tips: 3, rent: 25 });
const mvp: Award = { id: 'mvp', title: 'Crew MVP', icon: '🏆', winner: 'K', bot: false, stat: '', line: '', tone: 'mvp' };
const slip: Award = { id: 'slip', title: 'Slip King', icon: '🍌', winner: 'S', bot: false, stat: '', line: '', tone: 'chaos' };

function week(seed: number, days: number[]): GameState {
  const s = createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }], settings: { bots: 0 } });
  s.days = days.map((served, i) => day(i + 1, served));
  return s;
}

describe('records', () => {
  it('folds a week: totals, best week, busiest day and the hall of fame', () => {
    const r = foldRecords(emptyRecords(), week(1, [10, 30, 20]), [mvp, slip], '2026-10-29', 120);
    expect(r.weeks).toBe(1);
    expect(r.totals).toMatchObject({ days: 3, served: 60, lost: 6 });
    expect(r.bestWeek).toMatchObject({ score: 120, seed: 1, crew: ['K', 'S'] });
    expect(r.bestDay).toMatchObject({ served: 30, day: 2 });
    expect(r.hall).toEqual({ K: { mvp: 1, awards: 0 }, S: { mvp: 0, awards: 1 } });
    expect(r.mvps[0]).toMatchObject({ name: 'K' });
  });

  it('counts a run once; a later stop adds only the new days', () => {
    let r = foldRecords(emptyRecords(), week(1, [10, 10]), [mvp], 'd', 50);
    r = foldRecords(r, week(1, [10, 10]), [mvp], 'd', 50);
    expect(r.weeks).toBe(1);
    expect(r.totals.served).toBe(20);
    expect(r.hall.K.mvp).toBe(1);
    r = foldRecords(r, week(1, [10, 10, 40]), [mvp], 'd', 90);
    expect(r.totals.served).toBe(60);
    expect(r.longestRun?.days).toBe(3);
    expect(r.bestWeek?.score).toBe(90);
    r = foldRecords(r, week(2, [5]), [], 'd', 10);
    expect(r.weeks).toBe(2);
    expect(r.bestWeek?.score).toBe(90);
  });

  it('persists, and survives junk in storage', () => {
    const st = memoryStorage();
    const store = createRecordsStore(st);
    expect(store.get()).toEqual(emptyRecords());
    store.record(week(1, [10]), [mvp], 'd', 30);
    expect(createRecordsStore(st).get().weeks).toBe(1);
    st.setItem('cafetycoon.records', '{"version":1,"weeks":3,"totals":{"served":9}}');
    expect(store.get()).toMatchObject({ weeks: 3, totals: { served: 9, days: 0 }, hall: {} });
    st.setItem('cafetycoon.records', 'nope');
    expect(store.get()).toEqual(emptyRecords());
  });
});
