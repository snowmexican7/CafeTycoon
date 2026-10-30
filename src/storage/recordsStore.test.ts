import { describe, it, expect } from 'vitest';
import { createRun } from '../sim/run';
import { createRecordsStore, foldRecords, emptyRecords, splitRecords, type Records } from './recordsStore';
import { recordsHtml, recordsViewModel } from '../ui/records';
import { memoryStorage } from './storageLike';
import type { Award } from '../sim/awards';
import type { GameState } from '../sim/types';

const day = (n: number, served: number, lost = 2) => ({ day: n, served, lost, turnedAway: 0, sales: served * 5, tips: 3, rent: 25 });
const mvp: Award = { id: 'mvp', title: 'Crew MVP', icon: '🏆', winner: 'K', bot: false, stat: '', line: '', tone: 'mvp' };
const slip: Award = { id: 'slip', title: 'Slip King', icon: '🍌', winner: 'S', bot: false, stat: '', line: '', tone: 'chaos' };

function week(seed: number, days: number[], gear = true): GameState {
  const s = createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }], settings: { bots: 0 }, ...(gear ? { gear: true } : {}) });
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

  describe('G11 records split', () => {
    const v2: Records = (() => {
      const r = foldRecords(emptyRecords(), week(1, [10, 30, 20], false), [mvp], '2026-10-01', 120);
      // What a v2.2 browser wrote: no split marker, classic bests at the top level.
      const { split: _s, classic: _c, ...old } = { ...r, bestWeek: { score: 120, seed: 1, date: 'd', crew: ['K'], days: 3 }, bestDay: { served: 30, day: 2, seed: 1, date: 'd' } };
      return old as Records;
    })();

    it('an old (v2) records blob loads: its bests move to Classic (retired), totals and hall stay', () => {
      const st = memoryStorage();
      st.setItem('cafetycoon.records', JSON.stringify(v2));
      const r = createRecordsStore(st).get();
      expect(r.split).toBe(true);
      expect(r.bestWeek).toBeNull();
      expect(r.bestDay).toBeNull();
      expect(r.classic?.bestWeek?.score).toBe(120);
      expect(r.classic?.bestDay?.served).toBe(30);
      expect(r.weeks).toBe(1);
      expect(r.totals.served).toBe(60);
      expect(r.hall.K.mvp).toBe(1);
      expect(splitRecords(r)).toBe(r);
    });

    it('a Gear week sets the headline bests; a classic run (old save) only touches Classic', () => {
      let r = splitRecords(v2);
      r = foldRecords(r, week(5, [8, 9]), [], 'd', 40);
      expect(r.bestWeek?.score).toBe(40);
      expect(r.bestDay?.served).toBe(9);
      expect(r.classic?.bestWeek?.score).toBe(120);
      r = foldRecords(r, week(6, [50], false), [], 'd', 500);
      expect(r.bestWeek?.score).toBe(40);
      expect(r.classic?.bestWeek?.score).toBe(500);
      expect(r.classic?.bestDay?.served).toBe(50);
      expect(r.weeks).toBe(3);
    });

    it('the records dialog shows the retired classic bests in one line', () => {
      const vm = recordsViewModel(foldRecords(splitRecords(v2), week(5, [8]), [], 'd', 40));
      expect(vm.tiles[0].value).toBe('$40');
      expect(vm.classic).toEqual(['Best week $120', 'Busiest day 30 served']);
      expect(recordsHtml(vm)).toContain('Classic (retired):');
      expect(recordsViewModel(emptyRecords()).classic).toEqual([]);
      expect(recordsHtml(recordsViewModel(emptyRecords()))).not.toContain('Classic (retired)');
    });
  });
});
