import { describe, expect, it } from 'vitest';
import { createRun } from './run';
import { levelUpOnServe, LEVEL_UPS } from './levelUp';
import { unlockForDay } from './unlocks';
import { recipeFor } from './stations';
import { canMake } from './growth';
import { gearRecipe, podsOnly } from './gear';
import { applyGearInput } from './gear';
import { recipeChain, DRINK_IDS } from '../data/drinks';
import { levelUpVM } from '../ui/gearVM';
import type { CreateRunOptions, GameState } from './types';

const opts = (gear: boolean): CreateRunOptions => ({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'P1' }], settings: { bots: 0 }, tier: 'stand', gear });
const gearRun = (): GameState => createRun(opts(true));
const classicRun = (): GameState => createRun(opts(false));

describe('G6 drinks level up with use', () => {
  it('12 espressos learn the americano (on the menu at once, toast + morning note)', () => {
    const s = gearRun();
    s.slotGear = ['e2', ...(s.slotGear ?? []).slice(1)]; // review I3: the americano needs a real espresso machine (E2+)
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

describe('Gear G6b: level-ups replace the day-3/day-5 unlocks', () => {
  const mk = (gear: boolean) =>
    createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', ...(gear ? { gear: true } : {}) });
  it('Gear runs get nothing from the calendar; classic runs still do', () => {
    const g = mk(true); g.day = 5;
    expect(unlockForDay(g)).toEqual([]);
    const c = mk(false); c.day = 5;
    expect(unlockForDay(c)).toEqual(expect.arrayContaining(['icedLatte', 'mocha']));
  });
  it('iced latte needs both 10 espressos and 10 cold brews; mocha needs 25 lattes', () => {
    const g = mk(true);
    for (let i = 0; i < 10; i++) levelUpOnServe(g, 'coldBrew');
    for (let i = 0; i < 9; i++) levelUpOnServe(g, 'espresso');
    expect(g.unlocked).not.toContain('icedLatte');
    expect(levelUpOnServe(g, 'espresso')).toEqual(['icedLatte']);
    for (let i = 0; i < 24; i++) levelUpOnServe(g, 'latte');
    expect(g.unlocked).not.toContain('mocha');
    expect(levelUpOnServe(g, 'latte')).toEqual(['mocha']);
    expect(levelUpVM(g).find((l) => l.drink === 'icedLatte')?.also).toBe('10/10 cold brews');
  });
});

describe('review I3: americano, doppio and red-eye need a real espresso machine, not pods', () => {
  const withPods = (): GameState => {
    const s = gearRun();
    s.phase = 'night';
    s.cash = 900;
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'e1' });
    expect(podsOnly(s)).toBe(true);
    return s;
  };

  it('12 espressos on a pods-only bar do not learn the americano until an E2+ arrives', () => {
    const s = withPods();
    for (let i = 0; i < 13; i++) expect(levelUpOnServe(s, 'espresso')).toEqual([]);
    expect(s.unlocked ?? []).not.toContain('americano');
    expect(LEVEL_UPS.find((l) => l.unlocks === 'americano')!.needs).toMatchObject({ tree: 'espresso', tier: 2 });
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'e2' });
    expect(levelUpOnServe(s, 'espresso')).toContain('americano');
  });

  it('a sold-down pod bar takes americano, doppio and red-eye off the board', () => {
    const s = withPods();
    s.unlocked = [...(s.unlocked ?? []), 'americano', 'doppio', 'redEye'];
    for (const d of ['americano', 'doppio', 'redEye'] as const) expect(canMake(s, d)).toBe(false);
    expect(canMake(s, 'espresso')).toBe(true);
    // with a real machine in the bar it all comes back
    const real = withPods();
    real.unlocked = [...(real.unlocked ?? []), 'americano', 'doppio', 'redEye'];
    applyGearInput(real, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'e3' });
    applyGearInput(real, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'g1' }); // the real machine's beans are ground
    applyGearInput(real, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'd1' }); // red-eye walks the drip station too
    expect(podsOnly(real)).toBe(false);
    for (const d of ['americano', 'doppio', 'redEye'] as const) expect(canMake(real, d)).toBe(true);
  });
});
