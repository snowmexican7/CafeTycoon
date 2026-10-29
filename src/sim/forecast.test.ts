import { describe, it, expect } from 'vitest';
import { FORECASTS, forecastById, type ForecastId } from '../data/forecasts';
import { computeModifiers } from './effects';
import { scheduleEvents } from './events';
import { queueCapacity } from './customers';
import { dayProgress, forecastFor, forecastName, forecastOf, shapeAt, weekPlan } from './forecast';
import { createRun, startDay, startNight } from './run';
import type { GameState } from './types';

const run = (seed = 1): GameState => createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });

describe('neighbourhood forecasts', () => {
  it('plans the same week for the same seed, and different weeks for different seeds', () => {
    expect(weekPlan(5, 2)).toEqual(weekPlan(5, 2));
    const distinct = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => weekPlan(s, 2).join()));
    expect(distinct.size).toBeGreaterThan(5);
  });

  it('opens every run on the grand opening, and never again', () => {
    for (let seed = 1; seed <= 50; seed++) {
      expect(forecastFor(seed, 1)).toBe('opening');
      for (let day = 2; day <= 28; day++) expect(forecastFor(seed, day)).not.toBe('opening');
    }
  });

  it('weights the week so no two days feel alike', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (let week = 1; week <= 4; week++) {
        const plan = weekPlan(seed, week);
        expect(new Set(plan).size).toBe(7);
        for (let i = 1; i < 7; i++) expect(forecastById[plan[i]].family).not.toBe(forecastById[plan[i - 1]].family);
        if (week > 1) expect(forecastById[plan[0]].family).not.toBe(forecastById[weekPlan(seed, week - 1)[6]].family);
      }
    }
  });

  it('keeps weekday forecasts on their weekdays and uses every drawable forecast', () => {
    const seen = new Set<ForecastId>();
    for (let seed = 1; seed <= 100; seed++) {
      for (let day = 1; day <= 28; day++) {
        const f = forecastById[forecastFor(seed, day)];
        seen.add(f.id);
        if (f.days) expect(f.days).toContain((day - 1) % 7);
      }
    }
    for (const f of FORECASTS) if (f.weight > 0 || f.firstDayOnly) expect(seen.has(f.id)).toBe(true);
    expect(seen.has('ordinary')).toBe(false);
  });

  it('sets tomorrow’s forecast at night without touching the run rng', () => {
    const s = run(3);
    s.day = 9;
    const before = s.rng;
    const f = forecastFor(3, 9);
    startNight(s);
    expect(s.forecast).toBe(f);
    // dealHand draws from the rng; the forecast must not add draws on top.
    const t = run(3);
    t.day = 9;
    t.forecast = f;
    startNight(t);
    expect(s.rng).toBe(t.rng);
    expect(before).toBe(run(3).rng);
  });

  it('names the weekday', () => {
    expect(forecastName(forecastById.rainy, 1)).toBe('Rainy Monday');
    expect(forecastName(forecastById.rainy, 10)).toBe('Rainy Wednesday');
  });

  it('tilts hot and iced orders', () => {
    const s = run();
    s.forecast = 'ordinary';
    const base = computeModifiers(s).orderBias;
    s.forecast = 'rainy';
    const wet = computeModifiers(s).orderBias;
    expect(wet.latte / base.latte).toBeGreaterThan(1);
    expect(wet.coldBrew / base.coldBrew).toBeLessThan(1);
    s.forecast = 'heatWave';
    const hot = computeModifiers(s).orderBias;
    expect(hot.coldBrew / base.coldBrew).toBeGreaterThan(2);
    expect(hot.espresso / base.espresso).toBeLessThan(1);
  });

  it('applies payday tips, exam-week campers, and market crowds', () => {
    const s = run();
    s.forecast = 'ordinary';
    const base = computeModifiers(s);
    s.forecast = 'payday';
    expect(computeModifiers(s).tipRate).toBeGreaterThan(base.tipRate);
    s.forecast = 'examWeek';
    expect(queueCapacity(computeModifiers(s))).toBe(queueCapacity(base) - 1);
    s.forecast = 'market';
    expect(computeModifiers(s).mix.impatient).toBeGreaterThan(1);
    expect(computeModifiers(s).traffic).toBeGreaterThan(base.traffic);
    s.forecast = 'officeClosed';
    expect(computeModifiers(s).traffic).toBeLessThan(base.traffic);
  });

  it('shapes traffic through the day, averaging about 1', () => {
    for (const shape of ['flat', 'slowStart', 'lateCrowd', 'lunchPeak', 'morningRush'] as const) {
      let sum = 0;
      for (let i = 0; i < 1000; i++) sum += shapeAt(shape, (i + 0.5) / 1000);
      expect(sum / 1000).toBeGreaterThan(0.9);
      expect(sum / 1000).toBeLessThan(1.1);
    }
    expect(shapeAt('morningRush', 0.1)).toBeGreaterThan(shapeAt('morningRush', 0.8));
    expect(shapeAt('lateCrowd', 0.1)).toBeLessThan(shapeAt('lateCrowd', 0.8));
  });

  it('only shapes traffic while the doors are open (night stock warnings see the day average)', () => {
    const s = run();
    s.forecast = 'commuterRush';
    const night = computeModifiers(s).traffic;
    s.day = 2;
    startDay(s);
    s.forecast = 'commuterRush';
    expect(dayProgress(s)).toBeCloseTo(0);
    expect(computeModifiers(s).traffic).toBeGreaterThan(night);
  });

  it('makes forecast events likelier but keeps an even day’s draws identical', () => {
    const count = (forecast: ForecastId) => {
      let flickers = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const s = run(seed);
        s.day = 4;
        s.phase = 'day';
        s.forecast = forecast;
        scheduleEvents(s);
        flickers += s.eventSchedule.filter((e) => e.kind === 'powerFlicker').length;
      }
      return flickers;
    };
    expect(count('heatWave')).toBeGreaterThan(count('ordinary') * 1.5);
    const a = run(9);
    a.day = 4;
    a.forecast = 'ordinary';
    const b = structuredClone(a);
    b.forecast = 'payday'; // no event odds
    expect(scheduleEvents(a).eventSchedule).toEqual(scheduleEvents(b).eventSchedule);
  });

  it('falls back to the forecast table when a state has none', () => {
    const s = run(4);
    s.day = 12;
    (s as Partial<GameState>).forecast = undefined;
    expect(forecastOf(s).id).toBe(forecastFor(4, 12));
  });
});
