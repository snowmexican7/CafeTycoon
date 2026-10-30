import { describe, it, expect } from 'vitest';
import { createRun } from './run';
import { applyGearInput, gearPriceMul, gearRecipe, gearRequiresMet } from './gear';
import { DRINK_IDS, GEAR_ONLY_DRINKS } from '../data/drinks';
import { GEAR, treeTiers, type GearId } from '../data/gear';
import { gearVM, gearStats } from '../ui/gearVM';
import { gearBoard } from '../ui/night';
import { itemIcon } from '../ui/icons';
import { growthVM, nightViewModel } from '../ui/viewModels';
import { stationMenuNote } from '../ui/stationsVM';
import { planNight } from './bots/planner';
import type { GameState, Station } from './types';

const run = (gear = true): GameState => {
  const s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'Kay' }], settings: { bots: 0 }, tier: 'stand', gear });
  s.phase = 'night';
  s.cash = 1000;
  return s;
};
const buy = (s: GameState, gear: GearId) => applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear });
const owns = (s: GameState, id: GearId) => (s.slotGear ?? []).includes(id);
const st = (gear: GearId): Station => ({ id: 'x', kind: 'drip', gear } as unknown as Station);

describe('G10a: the pour-over branch (D4b / D5b)', () => {
  it('pour-over is appended to DRINK_IDS and Gear-only', () => {
    expect(DRINK_IDS[14]).toBe('pourOver');
    expect(GEAR_ONLY_DRINKS).toContain('pourOver');
    expect(treeTiers('pourOver').map((g) => g.id)).toEqual(['d4b', 'd5b']);
    expect(GEAR.d4b.price).toBe(70);
    expect(GEAR.d5b.priceMul).toBe(1.15);
  });

  it('D4b needs an Office Urn (D3) or better first', () => {
    const s = run();
    buy(s, 'd4b');
    buy(s, 'd5b');
    expect(owns(s, 'd4b') || owns(s, 'd5b')).toBe(false);
    const row = gearVM(s).trees.find((t) => t.id === 'pourOver')!;
    expect(row.tiers[0].state).toBe('needs');
    expect(row.tiers[0].needs).toBe('Office Urn');
    expect(gearBoard(gearVM(s))).toContain('Needs Office Urn');
    buy(s, 'd3');
    expect(gearRequiresMet(s, 'd4b')).toBe(true);
    buy(s, 'd4b');
    expect(owns(s, 'd4b')).toBe(true);
    expect(owns(s, 'd3')).toBe(true); // its own slot, no trade-in of the drip machine
  });

  it('buying it puts the pour-over on the menu; the lab trades the bar in', () => {
    const s = run();
    buy(s, 'd3');
    buy(s, 'd4b');
    expect(s.unlocked).toContain('pourOver');
    expect(s.menu.pourOver).toBe(true);
    const cash = s.cash;
    buy(s, 'd5b');
    expect(owns(s, 'd5b')).toBe(true);
    expect(owns(s, 'd4b')).toBe(false);
    expect(s.cash).toBe(cash + GEAR.d4b.sell - GEAR.d5b.price);
  });

  it('owning the bar keeps the lab open even after the drip machine is sold', () => {
    const s = run();
    buy(s, 'd3');
    buy(s, 'd4b');
    const i = s.slotGear!.indexOf('d3');
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'sell', index: i });
    expect(gearRequiresMet(s, 'd5b')).toBe(true);
  });

  it('the station makes one handmade cup from empty hands, slow on the bar and fast in the lab', () => {
    expect(gearRecipe(st('d4b'), null)).toMatchObject({ gives: 'pourOver', consumes: ['beans'], seconds: 8 });
    expect(gearRecipe(st('d5b'), null)!.seconds).toBeLessThan(3);
    expect(gearRecipe(st('d4b'), 'drip')).toBeNull();
    expect(gearRecipe(st('d3'), null)).toBeUndefined(); // the drip pot is unchanged
  });

  it('only the lab raises the pour-over price, and drip pots do not', () => {
    const s = run();
    buy(s, 'd3');
    buy(s, 'd4b');
    expect(gearPriceMul(s, 'pourOver')).toBe(1);
    buy(s, 'd5b');
    expect(gearPriceMul(s, 'pourOver')).toBe(1.15);
    expect(gearPriceMul(s, 'drip')).toBe(1);
  });

  it('stats, icon and classic runs', () => {
    expect(gearStats('d4b')).toContain('Slow: one cup, 8 s');
    expect(itemIcon('pourOver')).toContain('#8a4a22');
    const c = run(false);
    expect(growthVM(c).tiers.map((t) => t.drinks).join(', ')).not.toContain('Pour-over');
  });

  it('regression: selling the only drip machine with drip on the menu no longer crashes the night screen', () => {
    const s = run();
    buy(s, 'd1');
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'sell', index: s.slotGear!.indexOf('d1') });
    expect(() => nightViewModel(s, 'p1')).not.toThrow();
    expect(stationMenuNote(s) ?? '').not.toContain('undefined');
    for (const d of Object.keys(s.menu) as (keyof typeof s.menu)[]) s.menu[d] = false;
    s.menu.drip = true;
    s.menu.coldBrew = true;
    s.unlocked = ['drip', 'coldBrew'];
    const tips = planNight(s).map((a) => a.text).join(' | ');
    expect(tips).not.toContain('undefined');
    expect(tips).toContain('drip machine');
  });

  it('the "nothing to sell" note knows drip and pour-over machines sell drinks', () => {
    const s = run();
    expect(gearVM(s).note).toContain('Nothing to sell yet');
    buy(s, 'd1');
    expect(gearVM(s).note ?? '').not.toContain('Nothing to sell yet');
  });
});
