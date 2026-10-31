import { describe, expect, it } from 'vitest';
import { CHALLENGES, DAY_CURVE, dayCurveFor, dayOfWeekIndex } from '../data/challenges';
import { createRun, startDay, startNight } from './run';
import { dealChallenges, scheduleWeightsForDay, settleChallenges, tickChallenges } from './challenges';
import { computeModifiers } from './effects';
import { step } from './step';
import type { GameState } from './types';

const opts = { seed: 11, hostId: 'p1', players: [{ id: 'p1', name: 'Ana' }], settings: { bots: 0, dayLengthSec: 60 } as const };

function nightOf(day: number, seed = 11): GameState {
  const s = createRun({ ...opts, seed });
  // createRun starts on night of day 1; advance by finishing empty days is heavy — just set day and startNight
  s.day = day;
  return startNight(s);
}

describe('day curve (B7)', () => {
  it('has 7 steps from warm-up to finale', () => {
    expect(DAY_CURVE).toHaveLength(7);
    expect(DAY_CURVE[0]!.traffic).toBeLessThan(1);
    expect(DAY_CURVE[0]!.patience).toBeGreaterThan(1);
    expect(DAY_CURVE[6]!.traffic).toBeGreaterThan(1);
    expect(DAY_CURVE[6]!.patience).toBeLessThan(1);
  });

  it('repeats every 7 days in unlimited mode', () => {
    expect(dayOfWeekIndex(1)).toBe(0);
    expect(dayOfWeekIndex(8)).toBe(0);
    expect(dayCurveFor(7)).toEqual(dayCurveFor(14));
  });

  it('softens day-1 traffic and tightens day-7 vs a mid-week day', () => {
    // Compare the curve itself (forecasts differ by day and would drown the signal).
    expect(dayCurveFor(1).traffic).toBeLessThan(dayCurveFor(4).traffic);
    expect(dayCurveFor(4).traffic).toBeLessThan(dayCurveFor(7).traffic);
    expect(dayCurveFor(1).patience).toBeGreaterThan(dayCurveFor(7).patience);
    // And computeModifiers actually multiplies it in (force night so the forecast shape stays out).
    const d1 = nightOf(1, 21);
    const d7 = nightOf(7, 21);
    for (const s of [d1, d7]) {
      s.reputation = 2.5;
      s.settings.pace = 3;
      s.owned = [];
      s.activeTomorrow = [];
      s.cleanliness = 100;
      s.forecast = 'opening'; // same forecast id so only the curve differs
      s.phase = 'night';
    }
    // opening is day-1 only in the catalogue; if modifiers still read forecast effects, pin both to the same effects by using day curve ratio
    const ratio = computeModifiers(d7).traffic / computeModifiers(d1).traffic;
    const expected = dayCurveFor(7).traffic / dayCurveFor(1).traffic;
    expect(ratio).toBeCloseTo(expected, 5);
  });

  it('shifts event schedule weights toward more events later in the week', () => {
    const early = scheduleWeightsForDay(1);
    const late = scheduleWeightsForDay(7);
    expect(early[0]).toBeGreaterThan(late[0]); // more chance of 0 events early
    expect(late[2]).toBeGreaterThan(early[2]); // more chance of 2 events late
  });
});

describe('daily challenges (B7)', () => {
  it('catalogue covers the briefed goals', () => {
    const kinds = new Set(CHALLENGES.map((c) => c.goal.kind));
    for (const k of ['perfect', 'floor', 'noStorms', 'sellDrink', 'beforeGrace', 'noSpills', 'serve', 'serveInfluencer']) {
      expect(kinds.has(k as never)).toBe(true);
    }
    expect(CHALLENGES.length).toBeGreaterThanOrEqual(12);
  });

  it('deals 1 challenge on day 1 and 1–2 later, deterministically', () => {
    const a = nightOf(1, 5);
    const b = nightOf(1, 5);
    expect(a.challenges?.map((c) => c.id)).toEqual(b.challenges?.map((c) => c.id));
    expect(a.challenges).toHaveLength(1);

    const late = nightOf(5, 9);
    expect(late.challenges!.length).toBeGreaterThanOrEqual(1);
    expect(late.challenges!.length).toBeLessThanOrEqual(2);
  });

  it('puts the challenge on the morning note and the paper', () => {
    const n = nightOf(2, 3);
    expect(n.challenges!.length).toBeGreaterThan(0);
    const day = startDay(n);
    expect(day.morningNotes.some((l) => l.includes('Challenge:'))).toBe(true);
  });

  it('counts perfect serves toward a perfect challenge', () => {
    const s = startDay(nightOf(1, 2));
    s.challenges = [
      { id: 'perfect4', label: '4 perfect serves', blurb: '', need: 4, have: 0, reward: 8, done: false, failed: false },
    ];
    s.today.perfect = 4;
    tickChallenges(s);
    expect(s.challenges![0]!.done).toBe(true);
  });

  it('fails a no-storms challenge when someone walks', () => {
    const s = startDay(nightOf(1, 2));
    s.challenges = [
      { id: 'noStorms', label: 'No storm-outs', blurb: '', need: 1, have: 1, reward: 12, done: false, failed: false },
    ];
    s.today.lost = 1;
    tickChallenges(s);
    expect(s.challenges![0]!.failed).toBe(true);
  });

  it('pays the tip at settle and records the win', () => {
    const s = startDay(nightOf(1, 2));
    const before = s.cash;
    s.challenges = [
      { id: 'perfect4', label: '4 perfect serves', blurb: '', need: 4, have: 4, reward: 8, done: true, failed: false },
    ];
    const { paid, won } = settleChallenges(s);
    expect(paid).toBe(8);
    expect(won).toHaveLength(1);
    expect(s.cash).toBe(before + 8);
    expect(s.today.challengeBonus).toBe(8);
    expect(s.today.challengesWon).toEqual(['perfect4']);
  });

  it('marks beforeGrace when the shop is empty at doors-lock', async () => {
    const { markBeforeGrace } = await import('./challenges');
    const s = startDay(nightOf(3, 4));
    s.challenges = [
      { id: 'beforeGrace', label: 'Clear before close', blurb: '', need: 1, have: 0, reward: 12, done: false, failed: false },
    ];
    s.customers = [];
    s.rogue = null;
    markBeforeGrace(s);
    expect(s.challenges![0]!.done).toBe(true);
  });

});
