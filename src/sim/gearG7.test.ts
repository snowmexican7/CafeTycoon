import { describe, it, expect } from 'vitest';
import { createRun } from './run';
import { areaTipMul, gearArea } from './gear';
import { AREAS } from '../data/areas';
import { DRINK_IDS } from '../data/drinks';
import type { GameState } from './types';

const run = (gear: boolean, seed: number) =>
  createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', ...(gear ? { gear: true } : {}) });

describe('Gear Tree G7a: hidden area tips', () => {
  it('classic runs have no area and every tip multiplier is exactly 1', () => {
    const s = run(false, 5);
    expect(gearArea(s)).toBeNull();
    for (const d of DRINK_IDS) expect(areaTipMul(s, d)).toBe(1);
  });

  it('the area is a pure function of scenario + seed and follows the scenario where one exists', () => {
    const s = run(true, 5);
    expect(gearArea(s)).toBe(gearArea(run(true, 5)));
    const rng = s.rng;
    gearArea(s);
    expect(s.rng).toBe(rng);
    const forced = (scenario: GameState['scenario']) => gearArea({ ...s, scenario });
    expect([forced('campusTown'), forced('rainyWeek'), forced('touristSeason')]).toEqual(['campus', 'drizzleton', 'tourist']);
    const seen = new Set<string>();
    for (let seed = 1; seed < 60; seed++) seen.add(String(gearArea({ ...s, scenario: 'normal', seed })));
    expect([...seen].sort()).toEqual(['arts', 'gym', 'office']);
  });

  it('loved families tip ×1.2, meh ×0.85, tourists tip a bit on everything', () => {
    const s = run(true, 5);
    const at = (scenario: GameState['scenario']) => ({ ...s, scenario }) as GameState;
    expect(areaTipMul(at('campusTown'), 'coldBrew')).toBeCloseTo(1.2);
    expect(areaTipMul(at('campusTown'), 'latte')).toBe(1);
    expect(areaTipMul(at('rainyWeek'), 'latte')).toBeCloseTo(1.2);
    expect(areaTipMul(at('rainyWeek'), 'icedLatte')).toBeCloseTo(0.85);
    expect(areaTipMul(at('touristSeason'), 'espresso')).toBeCloseTo(AREAS.tourist.all!);
    expect(areaTipMul(at('rainyWeek'), 'special')).toBe(1);
  });
});

describe('Gear Tree G7c: asked-for walk-outs', () => {
  it('a loved family you do not serve sends some walk-ins away, and tomorrow says so', async () => {
    const { gearAskedFor, gearMorning } = await import('./gear');
    const s = { ...run(true, 5), scenario: 'campusTown' } as GameState; // campus loves iced
    let left = 0;
    for (let i = 0; i < 400; i++) if (gearAskedFor(s, ['espresso', 'latte'])) left++;
    expect(left).toBeGreaterThan(20);
    expect(left).toBeLessThan(90);
    expect(s.gearAsked).toEqual({ iced: left });
    s.morningNotes = [];
    gearMorning(s);
    expect(s.morningNotes).toContain(`${left} people asked for something iced yesterday and walked on.`);
    expect(s.gearAsked).toBeUndefined();
  });

  it('nobody asks when you serve what the area loves, or in classic runs (no RNG drawn)', async () => {
    const { gearAskedFor } = await import('./gear');
    const s = { ...run(true, 5), scenario: 'campusTown' } as GameState;
    const r = s.rng;
    expect(gearAskedFor(s, ['coldBrew'])).toBe(false);
    expect(s.rng).toBe(r);
    const c = run(false, 5);
    const rc = c.rng;
    expect(gearAskedFor(c, ['espresso'])).toBe(false);
    expect(c.rng).toBe(rc);
  });
});
