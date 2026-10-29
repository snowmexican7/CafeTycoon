import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { interact, stepStations } from './stations';
import { ACCURACY, accuracyRating, accuracyTip, averageStars, starsFor } from './accuracy';
import { finishDay } from './closing';
import { TICK_RATE } from './constants';
import { nightViewModel } from '../ui/viewModels';
import type { GameState } from './types';

const at = (s: GameState, x: number, y: number) => {
  s.players[0].pos = { x, y };
  return s;
};
const day = () => {
  const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
  s.scenario = 'normal';
  return startDay(s);
};
const finish = (s: GameState) => {
  while (s.stations[1].busyTicksLeft > 0) {
    s = stepStations(s);
    s.tick += 1;
  }
  return s;
};

describe('recipe accuracy (P3 B5)', () => {
  it('scores stars from sloppy marks, scales tips, and only ever costs rating', () => {
    expect([0, 1, 2, 3, 9].map(starsFor)).toEqual([3, 2, 1, 0, 0]);
    expect(accuracyTip(3)).toBeGreaterThan(accuracyTip(2));
    expect(accuracyTip(1)).toBeGreaterThan(accuracyTip(0));
    expect(accuracyRating({ served: 0 } as never)).toBe(0);
    expect(accuracyRating({ cups: 4, cupStars: 12 } as never)).toBeCloseTo(0, 6);
    expect(accuracyRating({ cups: 2, cupStars: 4 } as never)).toBeCloseTo(-ACCURACY.repPerStar, 6);
    expect(averageStars({ cups: 2, cupStars: 5 } as never)).toBe(2.5);
  });

  it('a careful espresso, taken when ready and served, is a perfect cup', () => {
    let s = at(day(), 3, 2);
    s.players[0].holding = 'grounds';
    s = interact(s, 'p1');
    s = finish(s);
    s = interact(s, 'p1');
    expect(s.players[0].holding).toBe('espresso');
    expect(s.players[0].cupSlips).toBeUndefined();
    s.customers = [{ id: 1, drink: 'espresso', patienceLeft: 100, patienceMax: 100 }];
    s = interact(at(s, 6, 5.1), 'p1');
    expect(s.today.cups).toBe(1);
    expect(s.today.perfectCups).toBe(1);
    expect(s.log.find((e) => e.kind === 'served')!.data.stars).toBe(3);
  });

  it('rush: empty hands pull the drink early near the end of its run, one star off', () => {
    let s = at(day(), 3, 2);
    s.players[0].holding = 'grounds';
    s = interact(s, 'p1');
    const total = s.stations[1].busyTicksLeft;
    expect(s.stations[1].busyTotal).toBe(total);
    for (let i = 0; i < total * 0.5; i++) s = stepStations(s);
    s = interact(s, 'p1'); // too early: nothing happens
    expect(s.players[0].holding).toBeNull();
    expect(s.stations[1].making).toBe('espresso');
    for (let i = 0; i < total * 0.15; i++) s = stepStations(s);
    s = interact(s, 'p1');
    expect(s.players[0].holding).toBe('espresso');
    expect(s.players[0].cupSlips).toBe(1);
    expect(s.stations[1].busyTicksLeft).toBe(0);
    expect(s.stations[1].output).toBeNull();
    expect(s.log.some((e) => e.kind === 'cup.early')).toBe(true);
    // The machine is free again and gives nothing more.
    s = stepStations(s);
    expect(s.stations[1].output).toBeNull();
  });

  it('a drink left sitting on the machine loses a star; marks follow the cup into the next machine', () => {
    let s = at(day(), 3, 2);
    s.players[0].holding = 'grounds';
    s.players[0].cupSlips = 1; // a rushed grind
    s = interact(s, 'p1');
    expect(s.players[0].cupSlips).toBeUndefined();
    expect(s.stations[1].cupSlips).toBe(1);
    s = finish(s);
    s.tick += ACCURACY.sitSeconds * TICK_RATE + 1;
    s = interact(s, 'p1');
    expect(s.players[0].cupSlips).toBe(2);
    expect(s.stations[1].cupSlips).toBeUndefined();
    s = interact(at(s, 5, 2), 'p1'); // into the steamer
    expect(s.stations[2].cupSlips).toBe(2);
  });

  it('wrong order: a cup offered to a station with no step for it is fumbled', () => {
    let s = at(day(), 1, 2);
    s.players[0].holding = 'espresso';
    s = interact(s, 'p1'); // espresso at the grinder
    expect(s.players[0].holding).toBe('espresso');
    expect(s.players[0].cupSlips).toBe(1);
    expect(s.log.some((e) => e.kind === 'cup.fumble')).toBe(true);
    // Grounds or empty hands are never a fumble.
    s.players[0].holding = 'grounds';
    delete s.players[0].cupSlips;
    s = interact(at(s, 5, 2), 'p1');
    expect(s.players[0].cupSlips).toBeUndefined();
  });

  it('marks ride the pass, a sloppy cup tips less, and the night receipt shows the stars', () => {
    const serve = (slips: number) => {
      let s = at(day(), 6, 5.1);
      s.players[0].holding = 'latte';
      s.players[0].cupSlips = slips;
      s = interact(s, 'p1'); // nobody wants it: onto the pass
      expect(s.pass[0].slips).toBe(slips || undefined);
      expect(s.players[0].cupSlips).toBeUndefined();
      s.customers = [{ id: 1, drink: 'latte', patienceLeft: 100, patienceMax: 100 }];
      s = interact(s, 'p1'); // serve from the pass
      return s;
    };
    const clean = serve(0);
    const sloppy = serve(2);
    expect(sloppy.log.find((e) => e.kind === 'served')!.data.stars).toBe(1);
    expect(Number(sloppy.log.find((e) => e.kind === 'served')!.data.amount)).toBeLessThan(Number(clean.log.find((e) => e.kind === 'served')!.data.amount));
    const repBefore = sloppy.reputation;
    const closed = finishDay(structuredClone(sloppy));
    const cleanClosed = finishDay(structuredClone(clean));
    expect(closed.reputation - repBefore).toBeLessThan(cleanClosed.reputation - clean.reputation);
    const t = nightViewModel(closed, 'p1').takings!;
    expect(t.cupStars).toBe('1.0');
    expect(t.cupsPerfect).toBe(0);
    expect(t.cupsRating).toBe('-0.30');
  });
});

describe('accuracy save migration (v13 -> v14)', () => {
  it('gives a machine mid-run a run length so it can still be pulled early', async () => {
    const { migrateSnapshot } = await import('../storage/snapshotStore');
    const s = day();
    s.stations[1].busyTicksLeft = 90;
    s.stations[1].making = 'espresso';
    delete s.stations[1].busyTotal;
    const st = migrateSnapshot(13, structuredClone(s))!;
    expect(st.stations[1].busyTotal).toBe(90);
  });
});
