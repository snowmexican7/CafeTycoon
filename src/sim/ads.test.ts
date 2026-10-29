import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { validateInput } from './validate';
import { AD_EFFECT, AD_IDS, ADS, adOutcome, applyAdInput } from './ads';
import { computeModifiers } from './effects';
import { nightViewModel } from '../ui/viewModels';
import type { AdId, GameState } from './types';

const run = (seed = 1) => {
  const s = createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
  s.phase = 'night';
  return s;
};
const book = (s: GameState, ad: AdId | null) => applyAdInput(s, { kind: 'ad', playerId: 'p1', ad });

describe('parody ads (P3 B10)', () => {
  it('lands each platform roughly at its odds, purely from seed and day', () => {
    for (const id of AD_IDS) {
      const n = { flop: 0, ok: 0, viral: 0 };
      for (let seed = 1; seed <= 40; seed++) for (let day = 1; day <= 10; day++) n[adOutcome(seed, day, id)]++;
      expect(Math.abs(n.flop / 400 - ADS[id].odds.flop / 100)).toBeLessThan(0.08);
      expect(Math.abs(n.viral / 400 - ADS[id].odds.viral / 100)).toBeLessThan(0.08);
      expect(adOutcome(7, 3, id)).toBe(adOutcome(7, 3, id));
    }
  });

  it('books, switches and cancels at night for the right money; humans only', () => {
    const s = run();
    const cash = s.cash;
    book(s, 'palmbook');
    expect(s.cash).toBe(cash - ADS.palmbook.cost);
    expect(s.ad).toEqual({ id: 'palmbook', day: s.day, by: 'K' });
    book(s, 'nextdoorish'); // switch: refund then pay
    expect(s.cash).toBe(cash - ADS.nextdoorish.cost);
    book(s, null);
    expect(s.cash).toBe(cash);
    expect(s.ad).toBeUndefined();
    const vm = nightViewModel(s, 'p1').ads;
    expect(vm.options).toHaveLength(AD_IDS.length);
    expect(vm.booked).toBeUndefined();
    const poor = run();
    poor.cash = 5;
    book(poor, 'glimpse');
    expect(poor.ad).toBeUndefined();
    const bot = run();
    bot.players[0].bot = {} as never;
    book(bot, 'palmbook');
    expect(bot.ad).toBeUndefined();
    expect(book(startDay(run()), 'palmbook').ad).toBeUndefined(); // not by day
    expect(validateInput({ kind: 'ad', playerId: 'p1', ad: 'myspace' as AdId })).toBeNull();
    expect(validateInput({ kind: 'ad', playerId: 'p1', ad: null })).toEqual({ kind: 'ad', playerId: 'p1', ad: null });
  });

  it('stays hidden overnight, then reveals at the door and moves its crowd', () => {
    // find a day where Palm Book goes viral and one where it flops
    const seed = 5;
    const viralDay = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find((d) => adOutcome(seed, d, 'palmbook') === 'viral')!;
    const flopDay = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find((d) => adOutcome(seed, d, 'palmbook') === 'flop')!;
    const plain = run(seed);
    plain.day = viralDay;
    const s = run(seed);
    s.day = viralDay;
    book(s, 'palmbook');
    expect(computeModifiers(s)).toEqual(computeModifiers(plain)); // no peeking at night
    startDay(s);
    startDay(plain);
    expect(s.ad!.outcome).toBe('viral');
    expect(s.today.ad).toEqual({ id: 'palmbook', outcome: 'viral' });
    expect(s.morningNotes.some((n) => n.includes('Palm Book ad went viral'))).toBe(true);
    expect(computeModifiers(s).mix.group).toBeCloseTo(computeModifiers(plain).mix.group * 2.2);
    expect(computeModifiers(s).tipRate).toBeCloseTo(computeModifiers(plain).tipRate + AD_EFFECT.viral.tip); // B11 tune
    const f = run(seed);
    f.day = flopDay;
    book(f, 'palmbook');
    startDay(f);
    expect(f.morningNotes.some((n) => n.includes('flopped'))).toBe(true);
    // the night after: the receipt and the Ads tab say how it went
    s.day += 1;
    s.days = Array.from({ length: s.day - 1 }, () => ({ ...s.today }));
    s.phase = 'night';
    const vm = nightViewModel(s, 'p1');
    expect(vm.takings?.ad).toMatch(/Palm Book ad went viral/);
    expect(vm.ads.last?.outcome).toBe('viral');
    // and it's over: tomorrow's mix is back to normal
    plain.day = s.day;
    plain.phase = 'night';
    expect(computeModifiers(s).mix.group).toBeCloseTo(computeModifiers(plain).mix.group);
  });

  it('leaves runs without an ad on the same RNG stream and shape', () => {
    let a = startDay(run(31));
    let b = startDay(run(31));
    for (let i = 0; i < 600; i++) {
      a = step(a, []);
      b = step(b, []);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.ad).toBeUndefined();
    expect(a.today.ad).toBeUndefined();
  });
});
