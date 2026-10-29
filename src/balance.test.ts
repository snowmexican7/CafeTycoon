import { describe, it, expect } from 'vitest';
import { cardValue, main, summarize, type BalanceReport, type WeekResult } from '../scripts/balanceCore';
import { catalogueById } from './data/catalogue';
import { zeroDrinks } from './sim/tally';
import { createRun } from './sim/run';

describe('balance tester', () => {
  it('runs one short week through the tester entry point, deterministically', () => {
    // One stand-in and no bots keeps this under a second locally; slow CI runners still get headroom from the timeout.
    const args = ['--weeks', '1', '--seed', '3', '--day', '30', '--humans', '1', '--bots', '0', '--json'];
    const a = main(args);
    expect(a.code).toBe(0);
    const r = JSON.parse(a.output) as BalanceReport;
    expect(r.weeks).toHaveLength(1);
    expect(r.weeks[0].days.length).toBeGreaterThan(0);
    expect(r.weeks[0].days.length).toBeLessThanOrEqual(7);
    expect(r.weeks[0].days.reduce((n, d) => n + d.served, 0)).toBeGreaterThan(0);
    expect(main(args).output).toBe(a.output);
  }, 30_000);
  it('rejects bad options with exit code 2 and warns about an empty café', () => {
    expect(main(['--humans', '3', '--bots', '2']).code).toBe(2);
    expect(main(['--frobnicate']).code).toBe(2);
    expect(main(['--weeks', '1', '--day', '30', '--humans', '0', '--bots', '0']).output).toContain('No baristas');
  });
  it('the smart tester buys, re-rolls and reports a policy summary (B11)', () => {
    const args = ['--weeks', '1', '--seed', '3', '--day', '30', '--humans', '1', '--bots', '0', '--json', '--policy', 'smart'];
    const r = JSON.parse(main(args).output) as BalanceReport;
    const w = r.weeks[0];
    expect(w.policy).toBe('smart');
    expect(typeof w.score).toBe('number');
    expect(w.days.every((d) => typeof d.forecast === 'string')).toBe(true);
    expect(main(args).output).toBe(main(args).output);
    expect(main(['--weeks', '1', '--day', '30', '--humans', '1', '--bots', '0', '--policy', 'nope']).code).toBe(2);
  }, 30_000);
  it('values on-path cards and set completions above strays', () => {
    const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
    s.day = 2;
    const tamper = catalogueById.tamperStation;
    const base = cardValue(s, tamper, 'speed');
    expect(base).toBeGreaterThan(cardValue(s, tamper, 'quality'));
    s.owned.push({ itemId: 'shotTimer', effects: catalogueById.shotTimer.effects });
    expect(cardValue(s, tamper, 'speed')).toBeGreaterThan(base);
  });
  it('summarizes weeks per policy with loss by day', () => {
    const week = (policy: 'smart' | 'none', cash: number, lost: number): WeekResult => ({
      seed: 1, menu: [], finalCash: cash, bankrupt: false, drinks: zeroDrinks(), policy, bought: policy === 'smart' ? ['streetSign'] : [], rerolls: 1, score: cash - 100,
      days: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, cash, served: 10, lost, turnedAway: 0, wasted: 0, botMistakes: 0, events: [], challengesWon: 1 })),
    });
    const sum = summarize([week('smart', 300, 2), week('smart', 200, 4), week('none', 250, 5)]);
    const smart = sum.policies.find((p) => p.policy === 'smart')!;
    expect(smart.weeks).toBe(2);
    expect(smart.meanCash).toBe(250);
    expect(smart.dayLoss).toHaveLength(7);
    expect(smart.dayLoss[0]).toBeCloseTo(6 / 26);
    expect(smart.challengesWon).toBe(7);
    expect(sum.cards[0].id).toBe('streetSign');
  });
});
