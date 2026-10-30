import { describe, expect, it } from 'vitest';
import { createRun } from './run';
import { levelUpOnServe } from './levelUp';
import { recipeFor } from './stations';
import { gearRecipe } from './gear';
import { recipeChain, DRINK_IDS, DRINK_INFO } from '../data/drinks';
import { levelUpVM } from '../ui/gearVM';
import { growthVM } from '../ui/viewModels';
import { itemIcon } from '../ui/icons';
import type { DrinkId, GameState, Station } from './types';
import type { GearId } from '../data/gear';

const run = (gear = true): GameState => createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'P1' }], settings: { bots: 0 }, tier: 'stand', gear });
const serve = (s: GameState, d: DrinkId, n: number) => { const out: DrinkId[] = []; for (let i = 0; i < n; i++) out.push(...levelUpOnServe(s, d)); return out; };
const own = (s: GameState, ...ids: GearId[]) => { s.slotGear = ids; };

describe('G6c: the rest of the level-up drinks', () => {
  it('new drinks are appended to DRINK_IDS (seeds keep their ladders)', () => {
    expect(DRINK_IDS.slice(0, 10)).toEqual(['espresso', 'latte', 'coldBrew', 'icedLatte', 'mocha', 'matcha', 'special', 'drip', 'americano', 'cappuccino']);
    expect(DRINK_IDS.slice(10, 14)).toEqual(['doppio', 'sweetCream', 'cafeAuLait', 'redEye']);
  });

  it('15 cold brews learn sweet cream (any tap)', () => {
    const s = run();
    expect(serve(s, 'coldBrew', 14)).toEqual([]);
    expect(serve(s, 'coldBrew', 1)).toEqual(['sweetCream']);
    expect(s.menu.sweetCream).toBe(true);
  });

  it('30 espressos learn the doppio only with E3+; buying one later learns it on the next shot', () => {
    const s = run();
    own(s, 'e2', 'g2');
    const got = serve(s, 'espresso', 30);
    expect(got).not.toContain('doppio');
    expect(levelUpVM(s).find((l) => l.drink === 'doppio')!.needs).toBe('needs a Sylvia or better');
    own(s, 'e3', 'g2');
    expect(levelUpOnServe(s, 'espresso')).toContain('doppio');
    expect(levelUpVM(s).find((l) => l.drink === 'doppio')!.needs).toBeUndefined();
  });

  it('drips learn café au lait (needs a steamer) at 12 and red-eye (needs E2+) at 20', () => {
    const s = run();
    own(s, 'd1', 's1', 'e2');
    const got = serve(s, 'drip', 20);
    expect(got).toEqual(['cafeAuLait', 'redEye']);
    const t = run();
    own(t, 'd1', 'e1'); // pods only: no red-eye, no steamer
    expect(serve(t, 'drip', 20)).toEqual([]);
  });

  it('recipes: drip at the steamer → au lait, drip at the machine → red-eye, cold brew at the tap → sweet cream', () => {
    const s = run();
    s.unlocked = [...(s.unlocked ?? []), 'drip', 'cafeAuLait', 'redEye', 'sweetCream'];
    expect(recipeFor(s, 'steamer', 'drip')?.gives).toBe('cafeAuLait');
    expect(recipeFor(s, 'espresso', 'drip')?.gives).toBe('redEye');
    expect(recipeFor(s, 'coldBrewTap', 'coldBrew')?.gives).toBe('sweetCream');
    expect(recipeChain('redEye').map((x) => x.station)).toEqual(['drip', 'espresso']);
    expect(recipeChain('doppio').map((x) => x.station)).toEqual(['grinder', 'espresso', 'espresso']);
  });

  it('americano vs doppio at the machine: the oldest waiting ticket decides', () => {
    const s = run();
    s.unlocked = [...(s.unlocked ?? []), 'americano', 'doppio'];
    s.customers = [{ id: 1, drink: 'doppio', upset: false } as never, { id: 2, drink: 'americano', upset: false } as never];
    expect(recipeFor(s, 'espresso', 'espresso')?.gives).toBe('doppio');
    s.customers.reverse();
    expect(recipeFor(s, 'espresso', 'espresso')?.gives).toBe('americano');
  });

  it('no red-eye or doppio on a pod machine', () => {
    const pod = { kind: 'espresso', gear: 'e1' } as Station;
    expect(gearRecipe(pod, 'drip')).toBeNull();
    expect(gearRecipe(pod, 'espresso')).toBeNull();
  });

  it('classic runs never learn them and the growth cards hide Gear-only drinks', () => {
    const c = run(false);
    expect(serve(c, 'coldBrew', 20)).toEqual([]);
    const all = growthVM(c).tiers.map((t) => t.drinks).join(', ');
    for (const d of ['Doppio', 'Sweet cream', 'Au lait', 'Red-eye', 'Americano', 'Drip']) expect(all).not.toContain(d);
  });

  it('every new drink has its own icon', () => {
    const base = itemIcon('coldBrew');
    for (const d of ['doppio', 'sweetCream', 'cafeAuLait', 'redEye'] as DrinkId[]) {
      expect(itemIcon(d)).not.toBe(base);
      expect(DRINK_INFO[d].ticket.length).toBeGreaterThan(1);
    }
  });
});
