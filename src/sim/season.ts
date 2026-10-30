/**
 * P4 B2: seasons. In a Gear run, Keep going after week 1 starts a four-week season. Weeks 2–4 each
 * get a profit target that scales from the crew's own week-1 score (with a floor, so a weak start
 * still has a goal), and every week ends on the week-end screen with how the week went. After week 4
 * the season is over: the screen shows the medal, and Keep going plays on with no more checkpoints.
 * Week profit is the change in the run score (cash plus fittings at half price), so buying gear is
 * not punished twice. Pure bookkeeping: no RNG, and nothing here changes the day's sim.
 */
import { ECONOMY } from '../data/economy';
import { scoreRun } from './score';
import type { GameState, Season, SeasonWeek } from './types';

export const SEASON = {
  weeks: 4,
  /** The smallest week-1 base a target scales from. */
  floor: 30,
  /** Each later week's target grows by this share of the base. */
  growth: 0.15,
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The profit target for `week` (2+) of a season with this base, rounded to $5. */
export function seasonTarget(base: number, week: number): number {
  return Math.round((Math.max(SEASON.floor, base) * (1 + SEASON.growth * (week - 2))) / 5) * 5;
}

/** Which week of the run a day is in (1-based). */
export const weekOfDay = (day: number) => Math.ceil(day / ECONOMY.scoredWeekDays);

/** Host chose Keep going on the week-end screen: start the season after week 1 (Gear runs), then play on. */
export function beginSeason(state: GameState): void {
  if (!state.gear || state.season || state.days.length < ECONOMY.scoredWeekDays) return;
  const score = scoreRun(state);
  state.season = { base: r2(Math.max(SEASON.floor, score)), startScore: score, weeks: [{ week: 1, target: null, profit: score }] };
}

/** At closing: true when today ends a season week (it records the week and the run stops at the week-end screen). */
export function seasonWeekEnd(state: GameState): boolean {
  const s = state.season;
  if (!s || s.done || state.day % ECONOMY.scoredWeekDays !== 0) return false;
  const week = weekOfDay(state.day);
  if (s.weeks.some((w) => w.week === week)) return false;
  const score = scoreRun(state);
  const row: SeasonWeek = { week, target: seasonTarget(s.base, week), profit: r2(score - s.startScore) };
  s.weeks.push(row);
  s.startScore = score;
  if (week >= SEASON.weeks) s.done = true;
  return true;
}

/** Targets hit so far (weeks 2+). */
export function targetsHit(season: Season): number {
  return season.weeks.filter((w) => w.target !== null && w.profit >= w.target).length;
}

export type Medal = 'gold' | 'silver' | 'bronze' | null;
/** The season medal: all three targets gold, two silver, one bronze. */
export function seasonMedal(season: Season): Medal {
  const n = targetsHit(season);
  return n >= 3 ? 'gold' : n === 2 ? 'silver' : n === 1 ? 'bronze' : null;
}

/** The running week of a season (at night: the coming day's week), its target and the profit so far. */
export function seasonNow(state: GameState): { week: number; of: number; target: number; soFar: number } | null {
  const s = state.season;
  if (!s || s.done) return null;
  const week = weekOfDay(state.day);
  if (week < 2 || week > SEASON.weeks) return null;
  return { week, of: SEASON.weeks, target: seasonTarget(s.base, week), soFar: r2(scoreRun(state) - s.startScore) };
}
