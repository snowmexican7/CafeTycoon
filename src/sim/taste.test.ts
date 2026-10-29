import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { interact } from './stations';
import { finishDay } from './closing';
import { step } from './step';
import { validateInput } from './validate';
import { DRINK_IDS } from '../data/drinks';
import { applyTwistInput, comboRating, comboStars, knownStars, TASTE, TWISTS } from './taste';
import { menuLines, nightViewModel } from '../ui/viewModels';
import type { GameState, PlayerInput } from './types';

const run = (seed = 1) => createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
const night = (seed = 1) => {
  const s = run(seed);
  s.phase = 'night';
  return s;
};
const twist = (drink: 'latte' | 'espresso', t: (typeof TWISTS)[number] | null): Extract<PlayerInput, { kind: 'twist' }> => ({ kind: 'twist', playerId: 'p1', drink, twist: t });
const serveLatte = (s: GameState) => {
  s.players[0].holding = 'latte';
  s.players[0].pos = { x: 6, y: 5.1 };
  s.customers = [{ id: 1, drink: 'latte', patienceLeft: 500, patienceMax: 1000 }];
  return interact(s, 'p1');
};

describe('taste map (P3 B6)', () => {
  it('gives every drink a seeded permutation of 1..5 stars across the twists', () => {
    for (const seed of [1, 2, 99, 123456]) {
      for (const d of DRINK_IDS) {
        const stars = TWISTS.map((t) => comboStars(seed, d, t));
        expect([...stars].sort()).toEqual([1, 2, 3, 4, 5]);
        expect(TWISTS.map((t) => comboStars(seed, d, t))).toEqual(stars); // pure
      }
    }
    // Different runs hide different best combos.
    const best = (seed: number) => DRINK_IDS.map((d) => TWISTS.find((t) => comboStars(seed, d, t) === 5)).join();
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(best)).size).toBeGreaterThan(1);
  });

  it('sets and clears twists only at night and validates the input', () => {
    const s = night();
    applyTwistInput(s, twist('latte', 'vanilla'));
    expect(s.twists).toEqual({ latte: 'vanilla' });
    applyTwistInput(s, twist('latte', null));
    expect(s.twists).toBeUndefined();
    const d = startDay(run());
    applyTwistInput(d, twist('latte', 'honey'));
    expect(d.twists).toBeUndefined();
    expect(validateInput(twist('latte', 'oat'))).toEqual(twist('latte', 'oat'));
    expect(validateInput({ ...twist('latte', 'oat'), twist: 'gravy' } as never)).toBeNull();
    expect(validateInput({ ...twist('latte', 'oat'), drink: 'soup' } as never)).toBeNull();
  });

  it('discovers a combo on first serve: stars in the notebook, tip scaled, cost charged', () => {
    const seed = 7;
    const t = TWISTS.find((x) => comboStars(seed, 'latte', x) === 5)!;
    let s = startDay(run(seed));
    s.scenario = 'normal';
    s.twists = { latte: t };
    expect(knownStars(s, 'latte', t)).toBeNull();
    s = serveLatte(s);
    expect(knownStars(s, 'latte', t)).toBe(5);
    expect(s.today.combosFound).toEqual([`latte:${t}`]);
    expect(s.today.twistCost).toBe(TASTE.cost);
    // Plain cup tip 0.87 (see customers.test) × 1.45 for a 5★ combo, minus the twist cost.
    expect(s.cash).toBeCloseTo(100 + 4.75 + 1.27 - TASTE.cost, 2);
    s = serveLatte(s);
    expect(s.today.combosFound).toHaveLength(1); // only once
    expect(s.today.comboStarSum).toBe(4);
  });

  it('caps the rating effect and shows the notebook and receipt at night', () => {
    expect(comboRating({ comboStarSum: 1000 } as never)).toBe(TASTE.repCap);
    expect(comboRating({ comboStarSum: -1000 } as never)).toBe(-TASTE.repCap);
    const seed = 3;
    let s = startDay(run(seed));
    s.scenario = 'normal';
    s.twists = { latte: 'cinnamon' };
    s = serveLatte(s);
    s = finishDay(s);
    const line = menuLines(s).find((l) => l.drink === 'latte')!;
    expect(line.twist).toBe('cinnamon');
    expect(line.book.find((b) => b.twist === 'cinnamon')!.stars).toBe(comboStars(seed, 'latte', 'cinnamon'));
    expect(line.book.filter((b) => b.stars === null)).toHaveLength(4);
    const t = nightViewModel(s, 'p1').takings!;
    expect(t.combos).toEqual([{ drink: 'latte', twist: 'cinnamon', stars: comboStars(seed, 'latte', 'cinnamon') }]);
    expect(t.twists).toBeDefined();
  });

  it('leaves a run without twists byte-identical (no RNG draws, no new fields)', () => {
    const a = startDay(run(11));
    const b = startDay(run(11));
    let x = a, y = b;
    for (let i = 0; i < 600; i++) {
      x = step(x, []);
      y = step(y, []);
    }
    expect(JSON.stringify(x)).toBe(JSON.stringify(y));
    expect(x.tasteBook).toBeUndefined();
    expect(x.today.twistCost).toBeUndefined();
  });
});
