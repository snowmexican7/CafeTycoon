import { describe, it, expect } from 'vitest';
import { addStandIns } from '../sim/bots/roster';
import { createRun } from '../sim/run';
import { step } from '../sim/step';
import { applyPatch, diff, roundFloats, type Patch } from './delta';

const wire = (p: Patch | null): Patch | null => (p ? JSON.parse(JSON.stringify(p)) : p);

describe('snapshot deltas', () => {
  it('rounds floats to 3 decimals and leaves integers alone', () => {
    expect(roundFloats({ a: 1.23456, b: [2, 0.0004], c: 'x', d: null, e: undefined })).toEqual({ a: 1.235, b: [2, 0], c: 'x', d: null });
  });

  it('sends nothing when nothing changed, or when only sub-millimetre jitter did', () => {
    const base = roundFloats({ pos: { x: 1.5, y: 2 }, list: [1, 2] });
    expect(diff(base, { pos: { x: 1.5, y: 2 }, list: [1, 2] })).toBeNull();
    expect(diff(base, { pos: { x: 1.5001, y: 2 }, list: [1, 2] })).toBeNull();
  });

  it('patches objects, arrays that grow and shrink, deletions and type changes', () => {
    const cases: [unknown, unknown][] = [
      [{ a: 1, b: { c: 2 } }, { a: 1, b: { c: 3 }, d: 'new' }],
      [{ a: 1, gone: true }, { a: 1 }],
      [{ l: [1, 2, 3, 4, 5] }, { l: [1, 2, 9] }],
      [{ l: [1] }, { l: [1, { x: 2 }, 3] }],
      [{ v: null }, { v: { x: 1 } }],
      [{ v: [1] }, { v: { 0: 1 } }],
      [[{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }]],
    ];
    for (const [a, b] of cases) {
      const before = JSON.stringify(a);
      expect(applyPatch(a, wire(diff(a, b))!)).toEqual(b);
      expect(JSON.stringify(a)).toBe(before);
    }
  });

  it('rejects malformed patches instead of corrupting state', () => {
    expect(() => applyPatch({}, ['a', [], 0])).toThrow();
    expect(() => applyPatch([1], ['a', [[5, ['r', 1]]], 1])).toThrow();
    expect(() => applyPatch({}, ['o', { __proto__: ['r', {}] } as never])).not.toThrow(); // literal __proto__ is not an own key
    expect(() => applyPatch({}, JSON.parse('["o", {"__proto__": ["r", {"polluted": 1}]}]'))).toThrow();
    expect(() => applyPatch({}, ['x'] as never)).toThrow();
  });

  it('rebuilds a whole 4-barista day exactly, at a fraction of the full size', () => {
    let s = createRun({ seed: 11, hostId: 'h', players: [], settings: { bots: 0, botSkill: 3, pace: 3, dayLengthSec: 30, nightLengthSec: 5 } as never });
    addStandIns(s, 4);
    let held: unknown = roundFloats(s);
    let full = 0, delta = 0;
    for (let t = 0; t <= 2400; t++) {
      s = step(s, []);
      if (t % 3) continue;
      const p = wire(diff(held, s));
      if (p) held = applyPatch(held, p);
      full += JSON.stringify(s).length;
      delta += p ? JSON.stringify(p).length : 0;
      if (t % 300 === 0) expect(held).toEqual(roundFloats(s));
    }
    expect(held).toEqual(roundFloats(s));
    expect(delta).toBeLessThan(full / 5);
  });
});
