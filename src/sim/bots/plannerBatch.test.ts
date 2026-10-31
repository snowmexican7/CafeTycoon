import { describe, expect, it } from 'vitest';
import { createRun } from '../run';
import { step } from '../step';
import { computeModifiers } from '../effects';
import { ECONOMY } from '../../data/economy';
import { DRINK_INFO, TAP_DRINKS } from '../../data/drinks';
import { menuDrinks, unlockDrink } from '../unlocks';
import { billsForDay } from '../staff';
import { steepTarget } from '../steep';
import { PLAN_PRIORITY, planNight, STEEP_MARGIN } from './planner';
import type { Advice } from './planner';
import type { GearId } from '../../data/gear';
import type { DrinkId, GameState, PlayerInput } from '../types';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A Gear stand at night with the given machines bought, cash after the buying set to `cash`. */
function gearNight(gears: GearId[], cash: number, dayLengthSec = 150): GameState {
  let s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec }, gear: true, tier: 'stand' });
  s.cash = 5000;
  for (const gear of gears) s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear }]);
  s.cash = cash;
  s.supplies = { beans: 500, milk: 500, concentrate: 500, flavour: 500, pastry: 500 };
  return s;
}
const find = (s: GameState, id: string): Advice | undefined => planNight(s).find((a) => a.id === id);

/** Expected orders per drink, worked out from the spec (arrivals split over the menu by order bias). */
function orders(s: GameState): Record<string, number> {
  const m = computeModifiers(s);
  const arrivals = ECONOMY.baseArrivalsPerSecond * s.settings.dayLengthSec * m.traffic;
  const menu = menuDrinks(s);
  const w = (d: DrinkId) => m.orderBias[d] * DRINK_INFO[d].bias;
  const total = menu.reduce((sum, d) => sum + w(d), 0) || 1;
  return Object.fromEntries(menu.map((d) => [d, (arrivals * w(d)) / total]));
}
const tapOrders = (s: GameState) => TAP_DRINKS.reduce((sum, d) => sum + (orders(s)[d] ?? 0), 0);

describe('Task 12: the planner suggests the steep number', () => {
  it('has its priorities in the table', () => {
    expect(PLAN_PRIORITY.steep).toBe(86);
    expect(PLAN_PRIORITY.condimentBox).toBe(84);
    expect(STEEP_MARGIN).toBe(1.2);
  });

  it('advice equals ceil(expected tap orders x 1.2) (priority 86)', () => {
    const s = gearNight(['c1', 'd1'], 300, 60);
    const want = Math.min(8, Math.ceil(tapOrders(s) * STEEP_MARGIN));
    expect(want).toBeGreaterThan(0);
    expect(want).toBeLessThan(8); // a short day: the formula, not the cap, decides
    const a = find(s, 'steep')!;
    expect(a).toMatchObject({ id: 'steep', kind: 'restock', priority: 86, input: { kind: 'steep', cups: want } });
    expect(a.text).toBe(`Steep ${want} cold brews for tomorrow (about ${Math.round(tapOrders(s))} cold brew orders expected)`);
  });

  it('counts every recipe that takes cold brew from the tap, not only plain cold brew', () => {
    const s = gearNight(['c1', 'e1'], 300, 600);
    unlockDrink(s, 'icedLatte');
    unlockDrink(s, 'sweetCream');
    const withTaps = tapOrders(s);
    expect(orders(s).icedLatte ?? 0).toBeGreaterThan(0);
    expect(withTaps).toBeGreaterThan(orders(s).coldBrew ?? 0);
    s.steep = 1;
    const a = find(s, 'steep');
    expect(a?.input).toEqual({ kind: 'steep', cups: Math.min(8, Math.ceil(withTaps * STEEP_MARGIN)) });
  });

  it('is capped at the taps (8 for a C1)', () => {
    const s = gearNight(['c1'], 300, 900);
    s.steep = 3;
    expect(Math.ceil(tapOrders(s) * STEEP_MARGIN)).toBeGreaterThan(8);
    expect(find(s, 'steep')?.input).toEqual({ kind: 'steep', cups: 8 });
    const two = gearNight(['c1', 'c1'], 300, 900);
    two.steep = 3;
    expect(find(two, 'steep')?.input).toEqual({ kind: 'steep', cups: 16 });
  });

  it('says nothing when the target already matches', () => {
    const s = gearNight(['c1', 'd1'], 300, 60);
    const want = Math.min(8, Math.ceil(tapOrders(s) * STEEP_MARGIN));
    s.steep = want;
    expect(steepTarget(s)).toBe(want);
    expect(find(s, 'steep')).toBeUndefined();
  });

  it('no tap, no steep advice', () => {
    expect(find(gearNight(['d1'], 300), 'steep')).toBeUndefined();
    // A C4 now has a steep cap too (60 cups, batch-steep), so it does get a steep number.
    expect(find(gearNight(['c4'], 300), 'steep')).toBeDefined();
  });

  it('with only the bills in the till and no concentrate: leftovers only', () => {
    const s = gearNight(['c1'], 0, 900);
    s.cash = billsForDay(s);
    s.supplies.concentrate = 0;
    s.coldBrewLeft = 3;
    expect(find(s, 'restock:concentrate')).toBeUndefined();
    expect(find(s, 'steep')?.input).toEqual({ kind: 'steep', cups: 3 });
  });

  it('with only the bills in the till: n = leftover + the concentrate in stock', () => {
    const s = gearNight(['c1'], 0, 900);
    s.cash = billsForDay(s);
    s.supplies.concentrate = 3;
    s.coldBrewLeft = 2;
    expect(find(s, 'steep')?.input).toEqual({ kind: 'steep', cups: 5 });
  });

  it('restock asks for the top-up only: leftovers cover part of the want', () => {
    const s = gearNight(['c1'], 300, 900); // want = 8
    s.supplies.concentrate = 0;
    s.coldBrewLeft = 3;
    const r = find(s, 'restock:concentrate')!;
    expect(r.input).toEqual({ kind: 'restock', supply: 'concentrate', packs: 1 }); // 5 fresh cups = 1 pack, not 8 x 1.25
    expect(find(s, 'steep')).toBeUndefined(); // 3 + 10 >= 8: n = 8 = the target
    s.steep = 4;
    expect(find(s, 'steep')?.input).toEqual({ kind: 'steep', cups: 8 });
  });

  it('enough leftovers: no concentrate is bought', () => {
    const s = gearNight(['c1'], 300, 900);
    s.supplies.concentrate = 0;
    s.coldBrewLeft = 8;
    expect(find(s, 'restock:concentrate')).toBeUndefined();
  });

  it('counts the packs the restock advice buys (10 cups a pack)', () => {
    const s = gearNight(['c1', 'c1'], 300, 900); // cap 16
    s.supplies.concentrate = 4;
    s.steep = 2;
    const packs = (find(s, 'restock:concentrate')!.input as Extract<PlayerInput, { kind: 'restock' }>).packs;
    expect(packs).toBe(2); // 16 wanted, 4 in stock: 12 more = 2 packs
    expect(find(s, 'steep')?.input).toEqual({ kind: 'steep', cups: 16 });
  });

  it('a classic run has neither steep nor condiment advice', () => {
    const s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand' });
    s.cash = 300;
    const ids = planNight(s).map((a) => a.id);
    expect(ids).not.toContain('steep');
    expect(ids).not.toContain('condimentBox');
  });
});

describe('Task 12: the planner suggests condiment boxes', () => {
  const drinkers = (s: GameState) => Math.ceil(0.6 * ((orders(s).drip ?? 0) + (orders(s).coldBrew ?? 0)));

  it('a low bar gets boxes (60% of drip and cold brew orders against servings + boxes x 20)', () => {
    const s = gearNight(['c1', 'd1'], 300, 600);
    s.condiments = { servings: 2 };
    s.condimentBoxes = 0;
    const use = drinkers(s);
    const n = Math.ceil((use - 2) / 20);
    expect(n).toBeGreaterThan(0);
    const a = find(s, 'condimentBox')!;
    expect(a).toMatchObject({ id: 'condimentBox', kind: 'restock', priority: 84, input: { kind: 'condimentBox', boxes: n } });
    expect(a.text).toBe(`Buy ${n} condiment ${n === 1 ? 'box' : 'boxes'} ($${round2(6 * n).toFixed(2).replace(/\.00$/, '')}): the bar runs dry tomorrow`);
  });

  it('boxes already waiting in the corner count', () => {
    const s = gearNight(['c1', 'd1'], 300, 600);
    s.condiments = { servings: 0 };
    s.condimentBoxes = 0;
    const need = Math.ceil(drinkers(s) / 20);
    expect(need).toBeGreaterThan(1);
    s.condimentBoxes = need - 1;
    expect(find(s, 'condimentBox')?.input).toEqual({ kind: 'condimentBox', boxes: 1 });
    s.condimentBoxes = need;
    expect(find(s, 'condimentBox')).toBeUndefined();
  });

  it('a covered bar gets none', () => {
    const s = gearNight(['c1', 'd1'], 300);
    s.condiments = { servings: 500 };
    s.condimentBoxes = 0;
    expect(find(s, 'condimentBox')).toBeUndefined();
  });

  it('no drip or cold brew on the menu: no boxes', () => {
    const s = gearNight(['e1'], 300);
    s.condiments = { servings: 0 };
    expect(find(s, 'condimentBox')).toBeUndefined();
  });

  it('boxes are bought within the budget, never on credit', () => {
    const s = gearNight(['c1', 'd1'], 0, 900);
    s.condiments = { servings: 0 };
    s.condimentBoxes = 0;
    s.cash = billsForDay(s);
    expect(find(s, 'condimentBox')).toBeUndefined();
    s.cash = billsForDay(s) + 6; // exactly one box
    expect(Math.ceil(drinkers(s) / 20)).toBeGreaterThan(1);
    expect(find(s, 'condimentBox')?.input).toEqual({ kind: 'condimentBox', boxes: 1 });
    expect(find(s, 'condimentBox')?.text).toContain('Buy 1 condiment box ($6)');
  });
});

describe('Task 12: the shared budget', () => {
  it('applying every advice never spends more than cash minus the bills', () => {
    for (const cash of [0, 12, 30, 45, 60, 90, 140, 300]) {
      for (const dayLengthSec of [150, 600]) {
        const s = gearNight(['c1', 'd1'], 0, dayLengthSec);
        s.supplies = { beans: 0, milk: 0, concentrate: 1, flavour: 0, pastry: 0 };
        s.condiments = { servings: 0 };
        s.condimentBoxes = 0;
        s.cash = billsForDay(s) + cash;
        const spare = round2(s.cash - billsForDay(s));
        const inputs: PlayerInput[] = planNight(s).map((a) => ({ ...a.input, playerId: 'p1' }) as PlayerInput);
        let after = s;
        for (const i of inputs) after = step(after, [i]);
        expect(round2(s.cash - after.cash), `cash ${cash} day ${dayLengthSec}`).toBeLessThanOrEqual(spare + 0.0001);
        expect(after.cash).toBeGreaterThanOrEqual(billsForDay(s) - 0.0001);
      }
    }
  });

  it('restock draws first: with cash for one thing, the pack beats the box', () => {
    const s = gearNight(['c1', 'd1'], 0, 900);
    s.supplies = { beans: 500, milk: 500, concentrate: 0, flavour: 500, pastry: 500 };
    s.condiments = { servings: 0 };
    s.condimentBoxes = 0;
    s.cash = billsForDay(s) + 9; // one concentrate pack, nothing left for a box
    expect(find(s, 'restock:concentrate')).toBeDefined();
    expect(find(s, 'condimentBox')).toBeUndefined();
  });
});
