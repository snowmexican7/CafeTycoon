import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { validateInput } from './validate';
import { applyRivalCounterInput, copyAfter, countered, isPromoDay, promoLevel, RIVAL } from './rival';
import { computeModifiers } from './effects';
import { nightBrief } from './brief';
import { nightViewModel } from '../ui/viewModels';
import type { GameState } from './types';

const run = (seed = 1, gear = true): GameState => {
  const s = createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
  if (gear) s.gear = true;
  return s;
};
const promoDays = (s: GameState, week: number) => [1, 2, 3, 4, 5, 6, 7].map((k) => (week - 1) * 7 + k).filter((d) => isPromoDay(s, d));

describe('rival escalation (P4 B1)', () => {
  it('runs no promos in week 1 or classic runs, one in week 2, two a week from week 3, never on day 1 of a week', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const s = run(seed);
      expect(promoDays(s, 1)).toEqual([]);
      expect(promoDays(s, 2)).toHaveLength(1);
      expect(promoDays(s, 3)).toHaveLength(2);
      expect(promoDays(s, 5)).toHaveLength(2);
      for (const w of [2, 3, 4]) for (const d of promoDays(s, w)) expect((d - 1) % 7).not.toBe(0);
      expect(promoDays(run(seed, false), 3)).toEqual([]);
    }
    const s = run();
    expect([promoLevel(s, 1), promoLevel(s, 8), promoLevel(s, 15), promoLevel(s, 40)]).toEqual([0, 1, 2, 2]);
    expect(promoDays(run(1), 2)).toEqual(promoDays(run(1), 2)); // pure
  });

  it('a promo day costs walk-ins; countering keeps them and cuts prices instead', () => {
    const s = run();
    s.phase = 'night';
    const promo = promoDays(s, 2)[0];
    s.day = promo;
    const quiet = run();
    quiet.phase = 'night';
    quiet.day = promo;
    quiet.gear = undefined; // no promo, same day otherwise
    delete (quiet as { gear?: true }).gear;
    const base = computeModifiers(quiet);
    const hit = computeModifiers(s);
    expect(hit.traffic).toBeCloseTo(base.traffic * RIVAL.promoTraffic, 6);
    expect(hit.price.latte).toBeCloseTo(base.price.latte, 6);
    applyRivalCounterInput(s, { kind: 'rivalCounter', playerId: 'p1' });
    expect(s.rival?.counter).toBe(promo);
    expect(countered(s)).toBe(true);
    const c = computeModifiers(s);
    expect(c.traffic).toBeCloseTo(base.traffic, 6);
    expect(c.price.latte).toBeCloseTo(base.price.latte * RIVAL.counterPrice, 6);
    // undo
    applyRivalCounterInput(s, { kind: 'rivalCounter', playerId: 'p1', on: false });
    expect(s.rival?.counter).toBeUndefined();
  });

  it('counter is night only, humans only, and only before a promo day', () => {
    const s = run();
    s.phase = 'night';
    s.day = promoDays(s, 2)[0];
    const notPromo = [8, 9, 10, 11, 12, 13, 14].find((d) => !isPromoDay(s, d))!;
    const n = run();
    n.phase = 'night';
    n.day = notPromo;
    applyRivalCounterInput(n, { kind: 'rivalCounter', playerId: 'p1' });
    expect(n.rival).toBeUndefined();
    const b = run();
    b.phase = 'night';
    b.day = s.day;
    b.players[0].bot = {} as never;
    applyRivalCounterInput(b, { kind: 'rivalCounter', playerId: 'p1' });
    expect(b.rival).toBeUndefined();
    const d = run();
    d.phase = 'day';
    d.day = s.day;
    applyRivalCounterInput(d, { kind: 'rivalCounter', playerId: 'p1' });
    expect(d.rival).toBeUndefined();
    expect(validateInput({ kind: 'rivalCounter', playerId: 'p1' })).toEqual({ kind: 'rivalCounter', playerId: 'p1' });
    expect(validateInput({ kind: 'rivalCounter', playerId: 'p1', on: false })).toEqual({ kind: 'rivalCounter', playerId: 'p1', on: false });
    expect(validateInput({ kind: 'rivalCounter', playerId: 'p1', on: 'yes' } as never)).toBeNull();
  });

  it('warns in the night brief with a Match it button, and notes the promo in the morning', () => {
    const s = run();
    s.phase = 'night';
    s.day = promoDays(s, 2)[0];
    const a = nightBrief(s).alerts.find((x) => x.id === 'rival:promo')!;
    expect(a.severity).toBe('warn');
    expect(a.fix).toEqual({ kind: 'rivalCounter' });
    const row = nightViewModel(s, 'p1').brief.alerts.find((x) => x.id === 'rival:promo')!;
    expect(row.fix?.label).toMatch(/Match it/);
    expect(row.fix?.input).toEqual({ kind: 'rivalCounter' });
    applyRivalCounterInput(s, { kind: 'rivalCounter', playerId: 'p1' });
    expect(nightBrief(s).alerts.find((x) => x.id === 'rival:promo')!.fix).toEqual({ kind: 'rivalCounter', on: false });
    const morning = startDay(s);
    expect(morning.morningNotes.join(' ')).toMatch(/happy hour today, and we matched it/);
    const t = run();
    t.phase = 'night';
    t.day = promoDays(t, 2)[0];
    expect(startDay(t).morningNotes.join(' ')).toMatch(/fewer walk-ins/);
  });

  it('copies a signature faster from week 3 of a Gear run', () => {
    const s = run();
    s.day = 3;
    expect(copyAfter(s)).toBe(RIVAL.copyAfter);
    s.day = 15;
    expect(copyAfter(s)).toBe(RIVAL.copyAfterLate);
    const c = run(1, false);
    c.day = 15;
    expect(copyAfter(c)).toBe(RIVAL.copyAfter);
  });

  it('old saves (no counter) load and play the same', () => {
    const s = run();
    s.day = 3;
    const json = JSON.parse(JSON.stringify(s)) as GameState;
    expect(countered(json)).toBe(false);
    expect(computeModifiers(json).traffic).toBeCloseTo(computeModifiers(s).traffic, 9);
  });
});

describe('review M10: the promo-day memo changes no result', () => {
  const digest = (seeds: number[], days: number[]) => {
    const bySeed = new Map<number, string>();
    for (const d of days) {
      for (const seed of seeds) bySeed.set(seed, (bySeed.get(seed) ?? '') + (isPromoDay(run(seed), d) ? '1' : '0'));
    }
    return bySeed;
  };

  it('matches the unmemoised answers (golden), whatever order seeds and days are asked in', () => {
    const seeds = Array.from({ length: 25 }, (_, i) => i + 1);
    const days = Array.from({ length: 42 }, (_, i) => i + 1);
    const forward = digest(seeds, days);
    // Same days per seed, but asked backwards and interleaved across seeds (a memo must not leak between seeds or weeks).
    const backward = digest([...seeds].reverse(), [...days].reverse());
    for (const seed of seeds) expect([...backward.get(seed)!].reverse().join('')).toBe(forward.get(seed));
    // Golden, taken from the unmemoised code: 9 promo days per seed over six weeks (1 in week 2, 2 in weeks 3-6).
    const all = seeds.map((s) => forward.get(s)!).join('');
    let h = 0;
    for (const c of all) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
    expect(all.split('1').length - 1).toBe(225);
    expect(h).toBe(-199029481);
  });
});
