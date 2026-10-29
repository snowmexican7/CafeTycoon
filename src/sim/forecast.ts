import { ECONOMY } from '../data/economy';
import { FORECASTS, forecastById, type Forecast, type ForecastId, type TrafficShape } from '../data/forecasts';
import { secondsToTicks } from './constants';
import { rngNext, seedRng } from './rng';
import type { GameState } from './types';

export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** 0 = Monday. Day 1 of every run is a Monday. */
export function weekdayOf(day: number): number {
  return (day - 1) % 7;
}

const plans = new Map<string, ForecastId[]>();

/**
 * One week of forecasts, drawn from its own seeded stream (run seed and week number), so it never
 * shifts the run's main rng. No forecast twice in a week, no two days of one family back to back,
 * (not even across Sunday into Monday), weekday-only forecasts on their weekdays, and the run opens
 * on its gentle first day.
 */
export function weekPlan(seed: number, week: number): ForecastId[] {
  const key = `${seed}:${week}`;
  const cached = plans.get(key);
  if (cached) return cached;
  const r = { rng: seedRng((Math.imul(seed >>> 0, 0x2c1b3c6d) ^ Math.imul(week, 0x297a2d39) ^ 0x5eed) >>> 0) };
  const lastWeek = week > 1 ? forecastById[weekPlan(seed, week - 1)[6]].family : null;
  // Each weekday's candidates in a weighted-random order (drawn up front, so the stream is fixed),
  // then a depth-first search takes the first order that satisfies every rule.
  const orders: Forecast[][] = [];
  for (let wd = 0; wd < 7; wd++) {
    if (week === 1 && wd === 0) {
      orders.push([forecastById.opening]);
      continue;
    }
    const pool = FORECASTS.filter((f) => !f.firstDayOnly && f.weight > 0 && (!f.days || f.days.includes(wd)));
    const order: Forecast[] = [];
    while (pool.length) {
      const total = pool.reduce((s, f) => s + f.weight, 0);
      let roll = rngNext(r) * total;
      let at = pool.length - 1;
      for (let i = 0; i < pool.length; i++) {
        roll -= pool[i].weight;
        if (roll < 0) {
          at = i;
          break;
        }
      }
      order.push(pool.splice(at, 1)[0]);
    }
    orders.push(order);
  }
  const picked: Forecast[] = [];
  const search = (wd: number, strict: boolean): boolean => {
    if (wd === 7) return true;
    const prevFamily = wd > 0 ? picked[wd - 1].family : lastWeek;
    for (const f of orders[wd]) {
      if (strict && (picked.includes(f) || f.family === prevFamily)) continue;
      picked.push(f);
      if (search(wd + 1, strict)) return true;
      picked.pop();
    }
    return false;
  };
  if (!search(0, true)) search(0, false);
  const plan = picked.map((f) => f.id);
  if (plans.size > 64) plans.clear();
  plans.set(key, plan);
  return plan;
}

/** The forecast for `day` of a run on `seed`. */
export function forecastFor(seed: number, day: number): ForecastId {
  return weekPlan(seed, Math.ceil(day / ECONOMY.scoredWeekDays))[weekdayOf(day)];
}

/** Today's forecast (at night, tomorrow's: state.day is already the coming day). */
export function forecastOf(state: GameState): Forecast {
  return forecastById[state.forecast ?? forecastFor(state.seed, state.day)] ?? forecastById.opening;
}

/** "Rainy {day}" with the weekday filled in. */
export function forecastName(f: Forecast, day: number): string {
  return f.name.replace('{day}', WEEKDAY_NAMES[weekdayOf(day)]);
}

/** Arrival multiplier at `progress` (0 = doors open, 1 = doors lock) for a traffic shape. Each averages about 1. */
export function shapeAt(shape: TrafficShape, progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  switch (shape) {
    case 'flat':
      return 1;
    case 'slowStart':
      return 0.5 + 1.0 * p;
    case 'lateCrowd':
      return p < 0.45 ? 0.65 : 1.3;
    case 'lunchPeak':
      return 0.8 + 1.0 * Math.max(0, 1 - Math.abs(p - 0.5) / 0.2);
    case 'morningRush':
      return p < 0.3 ? 1.6 : 0.78;
  }
}

/** How far through the open day we are (0 at night). */
export function dayProgress(state: GameState): number {
  if (state.phase !== 'day') return 0;
  const total = secondsToTicks(state.settings.dayLengthSec);
  return total > 0 ? 1 - state.phaseTicksLeft / total : 0;
}
