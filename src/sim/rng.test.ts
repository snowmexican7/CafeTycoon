import { describe, it, expect } from 'vitest';
import { seedRng, rngNext, rngInt } from './rng';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = { rng: seedRng(42) };
    const b = { rng: seedRng(42) };
    const seqA = Array.from({ length: 5 }, () => rngNext(a));
    const seqB = Array.from({ length: 5 }, () => rngNext(b));
    expect(seqA).toEqual(seqB);
  });

  it('differs across seeds and stays in [0,1)', () => {
    const a = { rng: seedRng(1) };
    const b = { rng: seedRng(2) };
    expect(rngNext(a)).not.toBe(rngNext(b));
    for (let i = 0; i < 1000; i++) {
      const v = rngNext(a);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('rngInt covers the range', () => {
    const s = { rng: seedRng(7) };
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rngInt(s, 4));
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });
});
