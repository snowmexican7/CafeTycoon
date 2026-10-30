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
});
