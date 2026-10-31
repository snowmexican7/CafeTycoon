import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../data/economy';
import { addCustomer, drawDrink, serveCustomer, spawnCustomers } from './customers';
import { computeModifiers } from './effects';
import { PRICING, demandFactor, menuPrice, priceForecast, pricePatience, priceTraffic, unitCost } from './pricing';
import { createRun, startDay } from './run';
import { step } from './step';
import type { GameState } from './types';
import { validateInput } from './validate';
import { menuLines } from '../ui/viewModels';

const run2 = (seed = 1) => createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }], settings: { bots: 0 } });
const price = (s: GameState, drink: 'espresso' | 'latte' | 'coldBrew', n: number) => step(s, [{ kind: 'price', playerId: 'p1', drink, step: n }]);

describe('per-item pricing (P3 B2)', () => {
  it('sets a drink price in $0.25 steps at night only, clamped, and clears back to list', () => {
    let s = run2();
    s = price(s, 'latte', 2);
    expect(menuPrice(s, 'latte')).toBe(ECONOMY.prices.latte + 0.5);
    s = price(s, 'latte', 15);
    expect(s.priceSteps?.latte).toBe(PRICING.maxStep);
    s = price(s, 'latte', 0);
    expect(s.priceSteps).toBeUndefined();
    startDay(s);
    s = price(s, 'latte', 2);
    expect(s.priceSteps).toBeUndefined();
    expect(validateInput({ kind: 'price', playerId: 'p1', drink: 'latte', step: 1.5 })).toBeNull();
    expect(validateInput({ kind: 'price', playerId: 'p1', drink: 'nope', step: 1 } as never)).toBeNull();
  });

  it('leaves everything exactly as before at list prices', () => {
    const s = run2();
    const m = computeModifiers(s);
    expect(demandFactor(s, 'latte')).toBe(1);
    expect(pricePatience(s, 'latte')).toBe(1);
    expect(priceTraffic(s, ['espresso', 'latte', 'coldBrew'], m)).toBe(1);
  });

  it('pricier drinks get fewer orders and less patience; cheaper ones more', () => {
    const s = run2();
    s.priceSteps = { latte: 4, espresso: -2 };
    expect(demandFactor(s, 'latte')).toBeLessThan(0.8);
    expect(demandFactor(s, 'espresso')).toBeGreaterThan(1.2);
    expect(pricePatience(s, 'latte')).toBeLessThan(1);
    expect(pricePatience(s, 'espresso')).toBeGreaterThan(1);
    // more of the order mix goes to the cheap espresso
    const count = (st: GameState) => {
      const m = computeModifiers(st);
      let e = 0;
      for (let i = 0; i < 2000; i++) if (drawDrink(st, ['espresso', 'latte', 'coldBrew'], m) === 'espresso') e++;
      return e;
    };
    expect(count(s)).toBeGreaterThan(count(run2()) * 1.2);
  });

  it('charges the new price when a drink is served', () => {
    const s = run2();
    s.priceSteps = { espresso: 4, latte: 4, coldBrew: 4 };
    startDay(s);
    const c = addCustomer(s, 'normal')!;
    const before = s.today.sales;
    serveCustomer(s, c, c.drink, 'p1');
    const m = computeModifiers(s);
    expect(s.today.sales - before).toBeCloseTo(Math.round((ECONOMY.prices[c.drink] + 1) * m.price[c.drink] * 100) / 100, 2);
  });

  it('a pricey menu brings fewer walk-ins over a day (seeded, deterministic)', () => {
    const arrivals = (steps?: GameState['priceSteps']) => {
      const s = run2(3);
      if (steps) s.priceSteps = steps;
      startDay(s);
      let n = 0;
      for (let t = 0; t < 12000; t++) {
        spawnCustomers(s);
        n += s.customers.length; // price walkouts take an id too, so count who actually joined the line
        s.customers = [];
      }
      return n;
    };
    expect(arrivals({ espresso: 8, latte: 8, coldBrew: 8 })).toBeLessThan(arrivals());
    expect(arrivals({ espresso: 6, latte: 6, coldBrew: 6 })).toBe(arrivals({ espresso: 6, latte: 6, coldBrew: 6 }));
  });

  it('shows the night forecast: orders, change and profit per drink', () => {
    const s = run2();
    const listLines = menuLines(s);
    s.priceSteps = { latte: 4 };
    const lines = menuLines(s);
    const latte = lines.find((l) => l.drink === 'latte')!;
    const baseLatte = listLines.find((l) => l.drink === 'latte')!;
    expect(latte.price).toBeGreaterThan(baseLatte.price);
    expect(latte.demandPct).toBeLessThan(0);
    expect(latte.orders).toBeLessThanOrEqual(baseLatte.orders!);
    expect(baseLatte.profit).toBeCloseTo(baseLatte.orders! * (baseLatte.price - unitCost('latte')), 1);
    const m = computeModifiers(s);
    const sum = priceForecast(s, ['espresso', 'latte', 'coldBrew'], m, 20).reduce((a, l) => a + l.orders, 0);
    expect(sum).toBeLessThanOrEqual(20);
  });
});
