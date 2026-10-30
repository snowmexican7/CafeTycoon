import { describe, expect, it } from 'vitest';
import { p4Run } from '../scripts/p4Smoke';

// P4 B8: a short headless Gear run with the Phase 4 crew moves (counter promos, stamp card,
// branch, calls, stock) must stay finite, round-trip its save and be deterministic.
// The full 28-day × 3-seed run is `npx tsx scripts/p4Smoke.ts`.
describe('Phase 4 integration smoke (short)', () => {
  it('a 6-day two-player Gear run has no problems and repeats exactly', () => {
    const a = p4Run(203, 2, 6);
    expect(a.problems).toEqual([]);
    expect(a.days).toBeGreaterThan(0);
    expect(p4Run(203, 2, 6)).toEqual(a);
  }, 120_000);

  // P6-6: the stand-tier crew rarely reaches the café in a short run, so start one at the café with
  // $500 and check the second shop, its phone calls and stock runs go through the real night/day loop.
  it('a café-start run opens the second shop, answers its calls and stays finite', () => {
    const a = p4Run(302, 2, 6, { tier: 'cafe', cash: 500 });
    expect(a.problems).toEqual([]);
    expect(a.tier).toBe('cafe');
    expect(a.branchDay).toBe(1);
    expect(Number.isFinite(a.branchProfit)).toBe(true);
    expect(a.calls).toBeGreaterThan(0);
    expect(a.bankrupt).toBeFalsy();
    expect(p4Run(302, 2, 6, { tier: 'cafe', cash: 500 })).toEqual(a);
  }, 120_000);
});
