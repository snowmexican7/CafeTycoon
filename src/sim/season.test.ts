import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { finishDay } from './closing';
import { step } from './step';
import { beginSeason, SEASON, seasonMedal, seasonNow, seasonTarget, seasonWeekEnd, targetsHit } from './season';
import { scoreRun } from './score';
import { weekEndViewModel } from '../ui/viewModels';
import { nightExtras } from '../ui/live';
import type { GameState } from './types';

const run = (gear = true): GameState => {
  const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
  if (gear) s.gear = true;
  else delete s.gear;
  return s;
};
/** Play day `day` instantly: open, close (no customers), and return the state after closing. */
const closeDay = (s: GameState, day: number): GameState => {
  s.day = day;
  while (s.days.length < day - 1) s.days.push({ ...(s.days[0] ?? (startDay(structuredClone(s)).today as never)), day: s.days.length + 1 });
  s = startDay(s);
  return finishDay(s);
};
const keepGoing = (s: GameState) => step(s, [{ kind: 'weekEnd', playerId: 'p1', choice: 'continue' }]);

describe('seasons (P4 B2)', () => {
  it('scales targets from the week-1 base with a floor, rounded to $5', () => {
    expect(seasonTarget(100, 2)).toBe(100);
    expect(seasonTarget(100, 3)).toBe(115);
    expect(seasonTarget(100, 4)).toBe(130);
    expect(seasonTarget(-50, 2)).toBe(SEASON.floor);
    expect(seasonTarget(0, 4) % 5).toBe(0);
  });

  it('starts on Keep going after week 1 of a Gear run, checkpoints each week, and ends after week 4', () => {
    let s = closeDay(run(), 7);
    expect(s.phase).toBe('weekEnd');
    expect(s.season).toBeUndefined();
    expect(weekEndViewModel(s, 'p1').season?.teaser).toMatch(/4-week season/);
    s = keepGoing(s);
    expect(s.phase).toBe('night');
    expect(s.day).toBe(8);
    expect(s.season?.weeks).toEqual([{ week: 1, target: null, profit: scoreRun(s) }]);
    expect(nightExtras(s, 'p1').season).toMatch(/^Week 2 of 4 · .* of \$/);
    // Mid-week days don't stop the run.
    s = closeDay(s, 10);
    expect(s.phase).toBe('night');
    s.cash += 500; // a big week 2
    s = closeDay(s, 14);
    expect(s.phase).toBe('weekEnd');
    expect(s.season!.weeks[1]).toMatchObject({ week: 2, target: seasonTarget(s.season!.base, 2) });
    expect(s.season!.weeks[1]!.profit).toBeGreaterThanOrEqual(500 - 100);
    const vm = weekEndViewModel(s, 'p1').season!;
    expect(vm.week).toBe(2);
    expect(vm.rows[1]!.hit).toBe(true);
    expect(vm.next).toBeDefined();
    s = keepGoing(s);
    expect(s.day).toBe(15);
    expect(s.season!.weeks).toHaveLength(2); // continuing again doesn't restart the season
    s = closeDay(s, 21);
    expect(s.phase).toBe('weekEnd');
    s = keepGoing(s);
    s = closeDay(s, 28);
    expect(s.phase).toBe('weekEnd');
    expect(s.season!.done).toBe(true);
    expect(weekEndViewModel(s, 'p1').season!.done).toBe(true);
    expect(seasonMedal(s.season!)).toBe(targetsHit(s.season!) >= 3 ? 'gold' : targetsHit(s.season!) === 2 ? 'silver' : targetsHit(s.season!) === 1 ? 'bronze' : null);
    s = keepGoing(s);
    expect(seasonNow(s)).toBeNull();
    s = closeDay(s, 35);
    expect(s.phase).toBe('night'); // endless after the season
  });

  it('leaves classic runs alone: no season, no teaser, no checkpoints', () => {
    let s = closeDay(run(false), 7);
    expect(weekEndViewModel(s, 'p1').season).toBeUndefined();
    s = keepGoing(s);
    expect(s.season).toBeUndefined();
    s = closeDay(s, 14);
    expect(s.phase).toBe('night');
  });

  it('records each week once and ignores a second checkpoint call', () => {
    const s = run();
    for (let d = 1; d <= 7; d++) s.days.push({ day: d } as never);
    beginSeason(s);
    beginSeason(s);
    expect(s.season!.weeks).toHaveLength(1);
    s.day = 14;
    expect(seasonWeekEnd(s)).toBe(true);
    expect(seasonWeekEnd(s)).toBe(false);
    s.day = 13;
    expect(seasonWeekEnd(s)).toBe(false);
  });

  it('old saves without a season still load and play on', () => {
    let s = closeDay(run(), 7);
    s.unlimited = true; // a save from before seasons that was already past week 1
    s.phase = 'night';
    delete s.season;
    s = closeDay(s, 14);
    expect(s.phase).toBe('night');
    expect(weekEndViewModel(s, 'p1').season).toBeUndefined();
  });
});
