import { describe, expect, it } from 'vitest';
import { createRun } from '../run';
import { step } from '../step';
import { expectedUse, nightBrief } from '../brief';
import { applyGrowInput } from '../growth';
import { fridgeCapacity } from '../fridge';
import { planNight, PLAN_PRIORITY } from './planner';
import type { GearId } from '../../data/gear';
import type { GameState } from '../types';

/** A Gear stand at night with `gears` bought, $`cash`, `dayLengthSec` long days, the cube when `cube`, and an empty pantry. */
function night(gears: GearId[], cash = 300, dayLengthSec = 150, cube = true): GameState {
  let s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec }, gear: true, tier: 'stand' });
  s.cash = 5000;
  for (const gear of gears) s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear }]);
  if (cube) s = step(s, [{ kind: 'fridge', playerId: 'p1', fridge: 'f1' }]);
  s.cash = cash;
  return s;
}
const adviceOf = (s: GameState, id: string) => planNight(s).find((a) => a.id === id);

describe('FB2 A4: the planner and the brief know the fridge', () => {
  it('milk restock advice never buys more than the fridge holds, and none with no fridge', () => {
    const s = night(['g1', 'e5'], 300, 600);
    expect(expectedUse(s).milk).toBeGreaterThan(fridgeCapacity(s));
    expect(adviceOf(s, 'restock:milk')?.input).toEqual({ kind: 'restock', supply: 'milk', packs: 2 });
    s.supplies.milk = 20; // nothing more fits in the cube
    expect(adviceOf(s, 'restock:milk')).toBeUndefined();
    expect(adviceOf(night(['g1', 'e5'], 300, 150, false), 'restock:milk')).toBeUndefined();
  });

  it('a stand with a steam wand (E5) and no fridge: the planner suggests the cube, the brief warns (with a fix when affordable)', () => {
    const s = night(['g1', 'e5'], 300, 150, false);
    expect(adviceOf(s, 'fridge:f1')).toMatchObject({ kind: 'equip', input: { kind: 'fridge', fridge: 'f1' }, priority: PLAN_PRIORITY.fridge });
    expect(nightBrief(s).alerts.find((x) => x.id === 'fridge')).toMatchObject({ kind: 'stock', severity: 'warn', fix: { kind: 'fridge', fridge: 'f1' } });
    const poor = night(['g1', 'e5'], 10, 150, false);
    expect(adviceOf(poor, 'fridge:f1')).toBeUndefined();
    expect(nightBrief(poor).alerts.find((x) => x.id === 'fridge')?.fix).toBeUndefined();
    // no milk station and the bar kept nothing to lose: no nudge yet
    const bare = night(['c1'], 300, 150, false);
    expect(adviceOf(bare, 'fridge:f1')).toBeUndefined();
    bare.days.push({ day: 1, served: 0, lost: 0, turnedAway: 0, sales: 0, tips: 0, rent: 0, spoiledBar: 12 });
    expect(adviceOf(bare, 'fridge:f1')).toBeDefined();
  });

  it('the café suggests the Udder-Matic only when a day\'s milk won\'t fit in the Chrome Reach-In', () => {
    const s = night(['g1', 'e5'], 10_000, 150, false);
    applyGrowInput(s, { kind: 'grow', playerId: 'p1', tier: 'cart' });
    applyGrowInput(s, { kind: 'grow', playerId: 'p1', tier: 'cafe' });
    s.cash = 1000;
    expect(expectedUse(s).milk).toBeLessThanOrEqual(fridgeCapacity(s));
    expect(planNight(s).some((x) => x.id.startsWith('fridge:'))).toBe(false);
    expect(nightBrief(s).alerts.some((x) => x.id === 'fridge')).toBe(false);
    s.settings.dayLengthSec = 3000;
    s.supplies.pastry = 1e6; // R4 b: a case stocked for the day, so a 3000-second day's pastries don't eat the till first
    expect(expectedUse(s).milk).toBeGreaterThan(fridgeCapacity(s));
    expect(adviceOf(s, 'fridge:f4')?.input).toEqual({ kind: 'fridge', fridge: 'f4' });
  });

  it('servings put away in the fridge count as the bar\'s for the box advice and the brief', () => {
    const s = night(['c2', 'd2'], 300, 600);
    s.condiments = { servings: 0 };
    s.condimentBoxes = 0;
    expect(planNight(s).some((x) => x.id === 'condimentBox')).toBe(true);
    s.barAway = 500;
    expect(planNight(s).some((x) => x.id === 'condimentBox')).toBe(false);
    expect(nightBrief(s).alerts.some((x) => x.id === 'condiments')).toBe(false);
  });
});
