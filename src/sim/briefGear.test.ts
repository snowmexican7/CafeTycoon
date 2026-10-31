import { describe, it, expect } from 'vitest';
import { createRun } from './run';
import { stationsFromSlots } from './slots';
import { expectedOrders, expectedUse, nightBrief } from './brief';
import { CONDIMENTS } from './condiments';
import { GEAR, type GearId } from '../data/gear';
import type { GameState } from './types';

function gearNight(gear: GearId[]): GameState {
  const s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear: true });
  const slots = [...s.slots!];
  const slotGear = [...s.slotGear!];
  gear.forEach((id, i) => {
    slots[i] = GEAR[id].station;
    slotGear[i] = id;
  });
  s.slots = slots;
  s.slotGear = slotGear;
  s.stations = stationsFromSlots(s.tier, slots, slotGear);
  return s;
}

const find = (s: GameState, id: string) => nightBrief(s).alerts.find((a) => a.id === id);

describe('expectedUse / expectedOrders', () => {
  it('expectedUse for a classic run, one player: the forecast is capped by what one person can pour (Round 3 money)', () => {
    const c = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
    // Before Round 3 money this was 14 beans, 7 milk, 11 concentrate, 9 pastries (24 arrivals, no cap): one person
    // can pour about 21 cups a day, and the forecast no longer promises more.
    // R4 b: the pastry case sells 35% of the day's cups on the side, so it has a use too (ceil of 0.35 × the day's cups)
    expect(expectedUse(c)).toEqual({ beans: 12, milk: 6, concentrate: 9, flavour: 0, pastry: 8 });
  });

  it('expectedOrders is 0 off the menu and sums to the day\'s arrivals on it', () => {
    const c = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
    c.menu.drip = false;
    const o = expectedOrders(c);
    expect(o.drip).toBe(0);
    expect(o.espresso).toBeGreaterThan(0);
  });
});

describe('night brief: steep', () => {
  it('warns when tomorrow\'s steep can\'t be paid, with a concentrate restock', () => {
    const s = gearNight(['c1']);
    s.cash = 100;
    s.supplies.concentrate = 3;
    const a = find(s, 'steep')!;
    expect(a).toMatchObject({
      id: 'steep',
      kind: 'stock',
      severity: 'warn',
      text: 'Only 3 of 8 cold brews will be ready tomorrow: concentrate is short',
      fix: { kind: 'restock', supply: 'concentrate', packs: 1 },
    });
    s.supplies.concentrate = 0;
    expect(find(s, 'steep')!.severity).toBe('danger');
    s.supplies.concentrate = 10;
    expect(find(s, 'steep')).toBeUndefined();
    for (const have of [0, 3, 10]) {
      s.supplies.concentrate = have;
      expect(nightBrief(s).alerts.some((x) => x.id.startsWith('stock:concentrate'))).toBe(false);
    }
  });

  it('counts leftovers, leaves the fix off with no cash, and says nothing without a tap', () => {
    const s = gearNight(['c1']);
    s.cash = 100;
    s.supplies.concentrate = 3;
    s.coldBrewLeft = 4; // 4 left + 3 paid = 7 of 8, 1 short
    expect(find(s, 'steep')!.text).toBe('Only 7 of 8 cold brews will be ready tomorrow: concentrate is short');
    s.cash = 0;
    expect(find(s, 'steep')!.fix).toBeUndefined();
    s.coldBrewLeft = 8;
    expect(find(s, 'steep')).toBeUndefined();
    const none = gearNight([]);
    none.supplies.concentrate = 0;
    expect(find(none, 'steep')).toBeUndefined();
  });

  it('a classic run still gets the per-supply concentrate alerts and no steep alert', () => {
    const c = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
    c.supplies.concentrate = 0;
    expect(find(c, 'stock:concentrate:out')).toBeDefined();
    expect(find(c, 'steep')).toBeUndefined();
    expect(find(c, 'condiments')).toBeUndefined();
  });
});

describe('night brief: condiments', () => {
  function bar(servings: number, boxes: number): GameState {
    const s = gearNight(['e1', 'c1', 'd1']);
    s.cash = 100;
    s.supplies.concentrate = 10;
    s.condiments = { servings };
    s.condimentBoxes = boxes;
    return s;
  }
  const useOf = (s: GameState) => {
    const o = expectedOrders(s);
    return Math.ceil(CONDIMENTS.share * (o.drip + o.coldBrew));
  };

  it('warns when the bar will run dry, with a box fix', () => {
    const s = bar(2, 0);
    const use = useOf(s);
    expect(use).toBeGreaterThan(2);
    const a = find(s, 'condiments')!;
    expect(a).toMatchObject({
      kind: 'stock',
      severity: 'warn',
      text: `Cream and sugar run out tomorrow: 2 servings for about ${use} drip and cold brew drinkers`,
      fix: { kind: 'condimentBox', boxes: Math.ceil((use - 2) / 20) },
    });
  });

  it('boxes in the corner count; enough of them means no alert; no cash means no fix', () => {
    const s = bar(2, 0);
    const use = useOf(s);
    s.condimentBoxes = Math.ceil((use - 2) / 20);
    expect(find(s, 'condiments')).toBeUndefined();
    const t = bar(2, 0);
    t.cash = 0;
    const a = find(t, 'condiments')!;
    expect(a).toBeDefined();
    expect(a.fix).toBeUndefined();
  });

  it('no alert when there is no bar (classic) or nothing to put cream in', () => {
    const none = gearNight(['c1', 'd1']);
    delete none.condiments;
    expect(find(none, 'condiments')).toBeUndefined();
    const espressoOnly = bar(0, 0);
    espressoOnly.menu.drip = false;
    espressoOnly.menu.coldBrew = false;
    expect(find(espressoOnly, 'condiments')).toBeUndefined();
  });

  it('both alerts sit right after the stock alerts', () => {
    const s = bar(0, 0);
    s.menu.espresso = true;
    s.supplies.concentrate = 3;
    s.supplies.beans = 1; // low, not out: a warn like the other two, so the order shows
    const ids = nightBrief(s).alerts.map((a) => a.id);
    const at = (id: string) => ids.indexOf(id);
    expect(at('stock:beans:low')).toBeGreaterThanOrEqual(0);
    expect(at('steep')).toBe(at('stock:beans:low') + ids.filter((i) => i.startsWith('stock:')).length);
    expect(at('condiments')).toBe(at('steep') + 1);
  });
});
