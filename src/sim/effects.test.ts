import { describe, it, expect } from 'vitest';
import { computeModifiers, itemModifiers, rentForDay, resolveGamble } from './effects';
import { createRun } from './run';
import { seedRng } from './rng';
import type { Effect, GameState } from './types';

describe('effects', () => {
  it('composes item effects', () => {
    const m = itemModifiers([
      { kind: 'stationSpeed', station: 'espresso', mul: 1.3 },
      { kind: 'stationSpeed', station: 'espresso', mul: 1.55 },
      { kind: 'price', mul: 1.08 },
      { kind: 'tipRate', add: 0.05 },
      { kind: 'tipRate', add: 0.2 },
      { kind: 'orderBias', drink: 'latte', mul: 2 },
    ]);
    expect(m.stationSpeed.espresso).toBeCloseTo(1.3 * 1.55);
    expect(m.price).toEqual({ espresso: 1.08, latte: 1.08, coldBrew: 1.08 });
    expect(m.tipRate).toBeCloseTo(0.25);
    expect(m.orderBias.latte).toBe(2);
    expect(m.orderBias.espresso).toBe(1);
  });

  it('applies reputation, pace, and week ramp', () => {
    const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
    s.scenario = 'normal';
    expect(computeModifiers(s).traffic).toBeCloseTo(0.7 + 0.12 * 2.5); // 1.0 at 2.5 stars, pace 3
    s.settings.pace = 5;
    expect(computeModifiers(s).traffic).toBeCloseTo(1.65);
    expect(computeModifiers(s).patience).toBeCloseTo(0.7);
    s.day = 8;
    s.settings.pace = 3;
    expect(computeModifiers(s).traffic).toBeCloseTo(1.15);
    expect(computeModifiers(s).patience).toBeCloseTo(0.95);
    expect(rentForDay(s)).toBeCloseTo(31.25);
  });

  it('resolves gambles with the state rng', () => {
    const g: Effect = { kind: 'gamble', chance: 1, win: [{ kind: 'traffic', mul: 2 }], lose: [] };
    expect(resolveGamble(g, { rng: seedRng(1) } as GameState)).toEqual([{ kind: 'traffic', mul: 2 }]);
    expect(resolveGamble({ ...g, chance: 0 }, { rng: seedRng(1) } as GameState)).toEqual([]);
  });
});
