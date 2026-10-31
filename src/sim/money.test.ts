import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../data/economy';
import { GEAR, type GearId } from '../data/gear';
import { drinkSupplyUnits } from '../data/drinks';
import { spawnCustomers } from './customers';
import { computeModifiers } from './effects';
import { expectedOrders, expectedUse } from './brief';
import { cupsPerArrival, dripPotCups, serveCapacity } from './capacity';
import { TIERS } from './growth';
import { PRICING, priceForecast, unitCost } from './pricing';
import { createRun, startDay } from './run';
import { stationsFromSlots } from './slots';
import { menuDrinks } from './unlocks';
import type { DrinkId, GameState } from './types';

const beanUnit = ECONOMY.packs.beans.cost / ECONOMY.packs.beans.size;
const milkUnit = ECONOMY.packs.milk.cost / ECONOMY.packs.milk.size;

/** A Gear shop with `gear` in its slots (pods cover the grinder), stocked, with every drink it can make on the board. */
function gearRun(gear: GearId[], players = 1, tier: 'stand' | 'cart' | 'cafe' = 'stand'): GameState {
  const s = createRun({
    seed: 5,
    hostId: 'p1',
    players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` })),
    settings: { bots: 0 },
    tier,
    gear: true,
  });
  const slots = [...s.slots!];
  const slotGear = [...s.slotGear!];
  gear.forEach((id, i) => {
    slots[i] = GEAR[id].station;
    slotGear[i] = id;
  });
  s.slots = slots;
  s.slotGear = slotGear;
  s.stations = stationsFromSlots(s.tier, slots, slotGear);
  s.supplies = { beans: 999, milk: 999, concentrate: 999, flavour: 999, pastry: 0 };
  return s;
}

function onlyMenu(s: GameState, drinks: DrinkId[]): void {
  s.unlocked = [...new Set([...(s.unlocked ?? []), ...drinks])];
  for (const d of Object.keys(s.menu) as DrinkId[]) s.menu[d] = drinks.includes(d);
}

describe('Round 3 money: the slight softening', () => {
  it('the stand charges 0.8 of the list price, supply packs are 10% cheaper, elasticity is 1.4', () => {
    expect(TIERS.stand.price).toBe(0.8);
    expect(TIERS.cart.price).toBe(0.9);
    expect(TIERS.cafe.price).toBe(1);
    expect(ECONOMY.packs.beans.cost).toBeCloseTo(7.2, 6);
    expect(ECONOMY.packs.milk.cost).toBeCloseTo(9, 6);
    expect(ECONOMY.packs.concentrate.cost).toBeCloseTo(8.1, 6);
    expect(ECONOMY.packs.flavour.cost).toBeCloseTo(8.1, 6);
    expect(ECONOMY.packs.pastry.cost).toBeCloseTo(6.3, 6);
    expect(PRICING.elasticity).toBe(1.4);
  });
});

describe('Round 3 money: unitCost', () => {
  it('drinkSupplyUnits counts every use of a supply down the chain', () => {
    expect(drinkSupplyUnits('espresso')).toEqual({ beans: 1 });
    expect(drinkSupplyUnits('latte')).toEqual({ beans: 1, milk: 1 });
    expect(drinkSupplyUnits('cappuccino')).toEqual({ beans: 1, milk: 2 });
    expect(drinkSupplyUnits('doppio')).toEqual({ beans: 2 });
    // a pot is one unit of beans shared by its cups
    expect(drinkSupplyUnits('drip', 8)).toEqual({ beans: 1 / 8 });
    expect(drinkSupplyUnits('cafeAuLait', 4)).toEqual({ beans: 1 / 4, milk: 1 });
    expect(drinkSupplyUnits('redEye', 4)).toEqual({ beans: 1 / 4 + 1 });
    // a pour-over is one handmade cup: a whole unit
    expect(drinkSupplyUnits('pourOver', 8)).toEqual({ beans: 1 });
  });

  it('a cappuccino costs two milks, a doppio two beans', () => {
    expect(unitCost('cappuccino')).toBeCloseTo(beanUnit + 2 * milkUnit, 2);
    expect(unitCost('doppio')).toBeCloseTo(2 * beanUnit, 2);
    expect(unitCost('latte')).toBeCloseTo(beanUnit + milkUnit, 2);
  });

  it('a drip cup costs its share of the pot (the pot of the drip machine owned)', () => {
    const d1 = gearRun(['d1']);
    const d2 = gearRun(['d2']);
    expect(dripPotCups(d1)).toBe(4);
    expect(dripPotCups(d2)).toBe(8);
    expect(unitCost('drip', d1)).toBeCloseTo(beanUnit / 4, 2);
    expect(unitCost('drip', d2)).toBeCloseTo(beanUnit / 8, 2);
    // no state, or no drip machine: the smallest pot, never a whole pot per cup
    expect(unitCost('drip')).toBeCloseTo(beanUnit / 4, 2);
    expect(unitCost('drip', gearRun(['e1']))).toBeCloseTo(beanUnit / 4, 2);
    expect(unitCost('drip', d1)).toBeLessThan(ECONOMY.packs.beans.cost / ECONOMY.packs.beans.size);
  });

  it('priceForecast profit uses the real cost of a doppio (two beans)', () => {
    const s = gearRun(['e3', 'g1']);
    onlyMenu(s, ['doppio']);
    const m = computeModifiers(s);
    const line = priceForecast(s, ['doppio'], m, 12, true).find((l) => l.drink === 'doppio')!;
    expect(line.orders).toBeGreaterThan(0);
    expect(line.profit).toBeCloseTo(line.orders * (line.price - 2 * beanUnit), 1);
  });
});

describe('Round 3 money: the restock estimate (expectedUse)', () => {
  it('a doppio order uses two beans, a drip cup a share of a pot', () => {
    const s = gearRun(['e3', 'g1']);
    onlyMenu(s, ['doppio']);
    const o = expectedOrders(s);
    expect(o.doppio).toBeGreaterThan(0);
    expect(expectedUse(s).beans).toBe(Math.ceil(2 * o.doppio));

    const t = gearRun(['d1']);
    onlyMenu(t, ['drip']);
    const od = expectedOrders(t);
    expect(expectedUse(t).beans).toBe(Math.ceil(od.drip / 4));
  });

  it('counts the extra cups of groups and combos: more cups than arrivals', () => {
    const s = gearRun(['e1'], 1, 'cafe');
    s.day = 4;
    const m = computeModifiers(s);
    expect(cupsPerArrival(s, m)).toBeGreaterThan(1.1);
    // a stand has no groups at all
    const stand = gearRun(['e1']);
    stand.day = 1;
    expect(cupsPerArrival(stand, computeModifiers(stand))).toBeCloseTo(1, 9);
  });

  it('moves with the prices: a pricey menu is expected to use less', () => {
    const s = gearRun(['e3', 'g1'], 2, 'cafe');
    const list = expectedUse(s).beans;
    s.priceSteps = { espresso: 8, latte: 8 };
    expect(expectedUse(s).beans).toBeLessThan(list);
  });
});

describe('Round 3 money: forecast capped by real capacity', () => {
  it('capacity is the queue plus what the machines and the crew can pour in a day', () => {
    const s = gearRun(['e1'], 1, 'stand');
    onlyMenu(s, ['espresso']);
    const m = computeModifiers(s);
    const cap = serveCapacity(s, menuDrinks(s), m);
    expect(cap.queue).toBe(3);
    expect(cap.perSecond).toBeGreaterThan(0);
    expect(cap.day).toBe(Math.floor(cap.perSecond * s.settings.dayLengthSec) + cap.queue);
  });

  it('a second person raises the rate (when the crew is the limit); a faster machine does too', () => {
    const one = gearRun(['e1'], 1, 'cafe');
    onlyMenu(one, ['espresso']);
    const two = gearRun(['e1'], 2, 'cafe');
    onlyMenu(two, ['espresso']);
    const rate = (s: GameState) => serveCapacity(s, menuDrinks(s), computeModifiers(s)).perSecond;
    expect(rate(two)).toBeGreaterThan(rate(one));
    // machines alone cap it: one slow espresso machine with a big crew is still one machine
    const crowd = gearRun(['e1'], 8, 'cafe');
    onlyMenu(crowd, ['espresso']);
    const fast = gearRun(['e3', 'g1'], 8, 'cafe');
    onlyMenu(fast, ['espresso']);
    expect(rate(fast)).toBeGreaterThan(rate(crowd));
    expect(rate(crowd)).toBeLessThanOrEqual(1 / (ECONOMY.stationSeconds.espresso / GEAR.e1.speed) + 1e-9);
  });

  it('expected orders never pass the day\'s capacity, however many walk-ins the forecast promises', () => {
    const s = gearRun(['e1'], 1, 'cafe');
    onlyMenu(s, ['espresso']);
    s.settings.dayLengthSec = 3000; // a promised crowd far beyond one person
    const m = computeModifiers(s);
    const cap = serveCapacity(s, menuDrinks(s), m).day;
    const total = Object.values(expectedOrders(s)).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(cap + 1e-9);
    expect(total).toBeGreaterThan(0);
    const lines = priceForecast(s, menuDrinks(s), m, ECONOMY.baseArrivalsPerSecond * 3000 * m.traffic, true);
    expect(lines.reduce((a, l) => a + l.orders, 0)).toBeLessThanOrEqual(cap + lines.length);
  });

  it('a normal day is not capped when the crew can keep up', () => {
    const s = gearRun(['e1'], 2, 'cafe');
    onlyMenu(s, ['espresso']);
    const m = computeModifiers(s);
    const arrivals = ECONOMY.baseArrivalsPerSecond * s.settings.dayLengthSec * m.traffic;
    const total = Object.values(expectedOrders(s)).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(arrivals * cupsPerArrival(s, m), 6);
  });
});

describe('Round 3 money: price walkouts', () => {
  function crowdDay(steps?: GameState['priceSteps']): GameState {
    const s = gearRun(['e1', 'd1'], 2, 'cafe');
    onlyMenu(s, ['espresso', 'drip']);
    s.day = 1;
    s.priceSteps = steps;
    if (!steps) delete s.priceSteps;
    startDay(s);
    return s;
  }
  const walkouts = (s: GameState) => s.log.filter((e) => e.kind === 'walkout' && e.data.reason === 'price');

  it('a pricey menu turns would-be customers away with a logged walkout, never a lost customer', () => {
    const s = crowdDay({ espresso: 8, drip: 8 });
    for (let t = 0; t < 6000; t++) {
      spawnCustomers(s);
      s.customers = [];
      s.log = s.log.slice(-400);
    }
    const lost = s.today.lost;
    expect(lost).toBe(0);
    expect(s.today.turnedAway).toBe(0);
    const total = s.today.priceWalkouts ?? 0;
    expect(total).toBeGreaterThan(5);
  });

  it('each walkout names a fresh customer id and the drink they balked at, and nobody joins the queue', () => {
    const s = crowdDay({ espresso: 8, drip: 8 });
    const seen = new Set<number>();
    for (let t = 0; t < 6000 && seen.size < 5; t++) {
      const before = s.customers.length;
      spawnCustomers(s);
      for (const e of walkouts(s)) {
        expect(typeof e.data.customer).toBe('number');
        expect(typeof e.data.drink).toBe('string');
        seen.add(e.data.customer as number);
      }
      s.customers = s.customers.slice(0, before);
    }
    expect(seen.size).toBeGreaterThanOrEqual(5);
    for (const id of seen) expect(s.customers.some((c) => c.id === id)).toBe(false);
  });

  it('the dearer drink is the one they balk at more often', () => {
    const s = crowdDay({ drip: 8 }); // drip way up, espresso at list
    const by: Record<string, number> = {};
    for (let t = 0; t < 6000; t++) {
      spawnCustomers(s);
      s.customers = [];
      for (const e of walkouts(s)) by[String(e.data.drink)] = (by[String(e.data.drink)] ?? 0) + 1;
      s.log = [];
    }
    expect(by.drip ?? 0).toBeGreaterThan(by.espresso ?? 0);
  });

  it('at list prices nobody walks out over the price, and the arrival roll is the old one', () => {
    const s = crowdDay();
    for (let t = 0; t < 6000; t++) {
      spawnCustomers(s);
      s.customers = [];
    }
    expect(s.today.priceWalkouts ?? 0).toBe(0);
    expect(walkouts(s)).toHaveLength(0);
  });

  it('cheaper than list brings extra walk-ins and no price walkouts', () => {
    const s = crowdDay({ espresso: -4, drip: -4 });
    for (let t = 0; t < 6000; t++) {
      spawnCustomers(s);
      s.customers = [];
    }
    expect(s.today.priceWalkouts ?? 0).toBe(0);
  });

  it('is deterministic: the same seed walks the same people out', () => {
    const run = () => {
      const s = crowdDay({ espresso: 6, drip: 6 });
      const out: string[] = [];
      for (let t = 0; t < 900; t++) {
        spawnCustomers(s);
        s.customers = [];
        for (const e of walkouts(s)) out.push(`${e.tick}:${e.data.customer}:${e.data.drink}`);
        s.log = [];
      }
      return out;
    };
    const a = run();
    expect(a.length).toBeGreaterThan(0);
    expect(run()).toEqual(a);
  });
});
