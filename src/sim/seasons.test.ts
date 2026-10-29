import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { interact } from './stations';
import { DRINK_IDS } from '../data/drinks';
import { comboStars, knownStale, knownStars, risingTwist, seasonOf, seasonStarts, TWISTS } from './taste';
import { forecastViewModel, menuLines } from '../ui/viewModels';
import type { GameState } from './types';

const run = (seed = 1) => createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
const serveLatte = (s: GameState) => {
  s.players[0].holding = 'latte';
  s.players[0].pos = { x: 6, y: 5.1 };
  s.customers = [{ id: 1, drink: 'latte', patienceLeft: 500, patienceMax: 1000 }];
  return interact(s, 'p1');
};

describe('taste seasons (P3 B8)', () => {
  it('splits the run into 3-day seasons', () => {
    expect([1, 2, 3, 4, 6, 7].map(seasonOf)).toEqual([0, 0, 0, 1, 1, 2]);
    expect([1, 2, 3, 4, 5, 7].map(seasonStarts)).toEqual([false, false, false, true, false, true]);
  });

  it('keeps one 5★ and one 1★ per drink each season, moves the 5★, and leaves the flop alone', () => {
    for (const seed of [1, 2, 99, 4242]) {
      for (const d of DRINK_IDS) {
        const top = (day: number) => TWISTS.find((t) => comboStars(seed, d, t, day) === 5);
        const flop = (day: number) => TWISTS.find((t) => comboStars(seed, d, t, day) === 1);
        for (const day of [1, 4, 7, 10]) expect(TWISTS.map((t) => comboStars(seed, d, t, day)).sort()).toEqual([1, 2, 3, 4, 5]);
        expect(top(4)).not.toBe(top(1));
        expect(top(7)).not.toBe(top(4));
        expect(top(4)).toBe(risingTwist(seed, d, 4));
        expect(flop(7)).toBe(flop(1));
        // Day 1 matches B6's map exactly, so season 0 is unchanged.
        expect(TWISTS.map((t) => comboStars(seed, d, t, 2))).toEqual(TWISTS.map((t) => comboStars(seed, d, t)));
        // The old hit only slips to 4★ or 3★: a drift, not a crash.
        expect([3, 4]).toContain(comboStars(seed, d, top(1)!, 4));
      }
    }
  });

  it('marks last season\'s notebook stale and re-learns it on the next serve', () => {
    const seed = 5;
    const old = TWISTS.find((t) => comboStars(seed, 'latte', t) === 5)!;
    // Learned in season 0 (no tasteSeason record), now planning day 4.
    const r = run(seed);
    r.tasteBook = { [`latte:${old}`]: 5 };
    r.day = 4;
    expect(knownStale(r, 'latte', old)).toBe(true);
    expect(menuLines(r).find((l) => l.drink === 'latte')!.book.find((b) => b.twist === old)!.stale).toBe(true);
    let s = startDay(r);
    expect(s.day).toBe(4);
    s.scenario = 'normal';
    s.twists = { latte: old };
    s = serveLatte(s);
    const now = comboStars(seed, 'latte', old, 4);
    expect(knownStars(s, 'latte', old)).toBe(now);
    expect(now).toBeLessThan(5);
    expect(knownStale(s, 'latte', old)).toBe(false);
    expect(s.tasteSeason).toEqual({ [`latte:${old}`]: 1 });
    expect(s.today.combosFound).toEqual([`latte:${old}`]);
  });

  it('hints the turn in the paper the night before and two nights out', () => {
    const s = run(9);
    s.phase = 'night';
    s.day = 3;
    expect(forecastViewModel(s).taste).toMatch(/day after tomorrow/);
    s.day = 4;
    const line = forecastViewModel(s).taste!;
    expect(line).toMatch(/tastes are turning/);
    s.day = 5;
    expect(forecastViewModel(s).taste).toBeUndefined();
    expect(line.length).toBeGreaterThan(20);
  });
});
