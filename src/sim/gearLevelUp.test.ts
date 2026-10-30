import { describe, expect, it } from 'vitest';
import { createRun } from './run';
import { levelUpOnServe, LEVEL_UPS } from './levelUp';
import { recipeFor } from './stations';
import { gearRecipe } from './gear';
import { recipeChain, DRINK_IDS } from '../data/drinks';
import { levelUpVM } from '../ui/gearVM';
import type { CreateRunOptions, GameState } from './types';

const opts = (gear: boolean): CreateRunOptions => ({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'P1' }], settings: { bots: 0 }, tier: 'stand', gear });
const gearRun = (): GameState => createRun(opts(true));
const classicRun = (): GameState => createRun(opts(false));

describe('G6 drinks level up with use', () => {
  it('12 espressos learn the americano (on the menu at once, toast + morning note)', () => {
    const s = gearRun();
    for (let i = 0; i < 11; i++) expect(levelUpOnServe(s, 'espresso')).toEqual([]);
    expect(s.unlocked).not.toContain('americano');
    expect(levelUpOnServe(s, 'espresso')).toEqual(['americano']);
    expect(s.unlocked).toContain('americano');
    expect(s.menu.americano).toBe(true);
    expect(s.gearLearned?.[0]).toMatch(/Americano unlocked/);
    expect(s.log.some((e) => e.kind === 'gear.quirk' && JSON.stringify(e.data).includes('Americano unlocked'))).toBe(true);
    expect(levelUpOnServe(s, 'espresso')).toEqual([]); // only once
  });

  it('12 lattes learn the cappuccino; classic runs never count', () => {
    const s = gearRun();
    for (let i = 0; i < 12; i++) levelUpOnServe(s, 'latte');
    expect(s.unlocked).toContain('cappuccino');
    const c = classicRun();
    for (let i = 0; i < 30; i++) levelUpOnServe(c, 'latte');
    expect(c.unlocked ?? []).not.toContain('cappuccino');
    expect(c.gearServed).toBeUndefined();
  });

  it('recipes: espresso at the machine → americano, latte at the steamer → cappuccino, only once learned', () => {
    const s = gearRun();
    expect(recipeFor(s, 'espresso', 'espresso')).toBeNull();
    s.unlocked = [...(s.unlocked ?? []), 'americano', 'cappuccino'];
    expect(recipeFor(s, 'espresso', 'espresso')?.gives).toBe('americano');
    expect(recipeFor(s, 'steamer', 'latte')?.gives).toBe('cappuccino');
    expect(recipeChain('americano').map((x) => x.station)).toEqual(['grinder', 'espresso', 'espresso']);
    expect(recipeChain('cappuccino').map((x) => x.station)).toEqual(['grinder', 'espresso', 'steamer', 'steamer']);
    // Pod machine: no hot-water tap.
    expect(gearRecipe({ gear: 'e1' } as never, 'espresso')).toBeNull();
  });

  it('mocha/cappuccino clash: the oldest waiting ticket decides', () => {
    const s = gearRun();
    s.unlocked = [...(s.unlocked ?? []), 'mocha', 'cappuccino'];
    s.customers = [{ drink: 'cappuccino' } as never, { drink: 'mocha' } as never];
    expect(recipeFor(s, 'steamer', 'latte')?.gives).toBe('cappuccino');
    s.customers = [{ drink: 'mocha' } as never, { drink: 'cappuccino' } as never];
    expect(recipeFor(s, 'steamer', 'latte')?.gives).toBe('mocha');
    s.customers = [];
    expect(recipeFor(s, 'steamer', 'latte')?.gives).toBe('mocha'); // first match
  });

  it('new drinks are appended (seed taste map unchanged) and the board shows progress', () => {
    expect(DRINK_IDS.slice(0, 8)).toEqual(['espresso', 'latte', 'coldBrew', 'icedLatte', 'mocha', 'matcha', 'special', 'drip']);
    const s = gearRun();
    for (let i = 0; i < 5; i++) levelUpOnServe(s, 'espresso');
    const vm = levelUpVM(s);
    expect(vm).toHaveLength(LEVEL_UPS.length);
    expect(vm[0]).toMatchObject({ drink: 'americano', served: 5, count: 12, learned: false });
  });
});
