import { describe, expect, it } from 'vitest';
import { createRun } from '../run';
import { step } from '../step';
import { expectedUse, nightBrief } from '../brief';
import { fridgeCapacity } from '../fridge';
import { planNight, PLAN_PRIORITY, RESTOCK_MARGIN } from './planner';
import { GEAR, type GearId } from '../../data/gear';
import type { GameState } from '../types';

/** A Gear stand at night with `gears` bought, $`cash`, `dayLengthSec` long days, and an empty pantry. */
function night(gears: GearId[], cash = 300, dayLengthSec = 150): GameState {
  let s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec }, gear: true, tier: 'stand' });
  s.cash = 5000;
  for (const gear of gears) s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear }]);
  s.cash = cash;
  return s;
}
const restockOf = (s: GameState, id: string) => planNight(s).find((a) => a.id === id);

describe('FB2 A4: the planner and the brief know the fridge', () => {
  it('milk restock advice never buys more than the fridge holds', () => {
    const s = night(['e1', 's2'], 300, 600);
    expect(expectedUse(s).milk * RESTOCK_MARGIN).toBeGreaterThan(fridgeCapacity(s));
    const a = restockOf(s, 'restock:milk');
    expect(a?.input).toEqual({ kind: 'restock', supply: 'milk', packs: 2 });
    s.supplies.milk = 20; // nothing more fits in the cube
    expect(restockOf(s, 'restock:milk')).toBeUndefined();
  });

  it('a fridge too small for tomorrow: the planner suggests the next one that holds it, the brief warns', () => {
    const s = night(['e1', 's2'], 300, 600);
    const need = Math.ceil(expectedUse(s).milk * RESTOCK_MARGIN);
    const want = (['f2', 'f3', 'f4'] as const).find((id) => GEAR[id].fridge!.holds >= need) ?? 'f4';
    const a = restockOf(s, `gear:${want}`);
    expect(a).toMatchObject({ kind: 'equip', input: { kind: 'gear', action: 'buy', gear: want }, priority: PLAN_PRIORITY.fridge });
    const alert = nightBrief(s).alerts.find((x) => x.id === 'fridge');
    expect(alert).toMatchObject({ kind: 'stock', severity: 'warn', fix: { kind: 'gear', action: 'buy', gear: want } });
    // too poor tonight: no advice, the warning stays (without a fix)
    const poor = night(['e1', 's2'], 20, 600);
    expect(planNight(poor).some((x) => x.id.startsWith('gear:f'))).toBe(false);
    expect(nightBrief(poor).alerts.find((x) => x.id === 'fridge')?.fix).toBeUndefined();
  });

  it('a fridge that holds tomorrow\'s milk: no fridge advice, no warning', () => {
    const s = night(['e1', 's2']);
    expect(Math.ceil(expectedUse(s).milk * RESTOCK_MARGIN)).toBeLessThanOrEqual(fridgeCapacity(s));
    expect(planNight(s).some((x) => x.id.startsWith('gear:f'))).toBe(false);
    expect(nightBrief(s).alerts.some((x) => x.id === 'fridge')).toBe(false);
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
