import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { stationsFromSlots } from './slots';
import { addCustomer, availableDrinks, drawDrink } from './customers';
import { cupsPerArrival, shareWeights } from './capacity';
import { computeModifiers } from './effects';
import { gearPullMul } from './gear';
import { LATTES, milkPush } from './lattes';
import { ORDERS } from './orders';
import { DRINK_IDS, DRINK_INFO } from '../data/drinks';
import { GEAR, type GearId } from '../data/gear';
import type { DrinkId, GameState, SupplyId, TierId } from './types';

type Kit = GearId | 'steamer';

/** A Gear stand on `day` whose slots hold `gear` ('steamer' = a plain steam station, the wand), stocked up. */
function gearDay(day: number, gear: Kit[], seed = 7, tier: TierId = 'cafe'): GameState {
  const s = createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier, gear: true });
  const slots = [...s.slots!];
  const slotGear = [...s.slotGear!];
  gear.forEach((id, i) => {
    slots[i] = id === 'steamer' ? 'steamer' : GEAR[id].station;
    slotGear[i] = id === 'steamer' ? null : id;
  });
  s.slots = slots;
  s.slotGear = slotGear;
  s.stations = stationsFromSlots(s.tier, slots, slotGear);
  s.day = day;
  s.unlocked = [...DRINK_IDS];
  const out = startDay(s);
  for (const k of ['beans', 'milk', 'concentrate'] as SupplyId[]) out.supplies[k] = 99;
  return out;
}

const WAND: Kit[] = ['g1', 'e2', 'steamer', 'c1', 'd1'];
const NO_WAND: Kit[] = ['g1', 'e2', 'c1', 'd1'];
const MILK: DrinkId[] = ['latte', 'cappuccino'];

/** The menu a bar that makes every drink would show (the special is a signature, never drawn). */
const everything = DRINK_IDS.filter((d) => d !== 'special');

function shares(s: GameState, menu: DrinkId[], draws = 6000): Record<string, number> {
  const m = computeModifiers(s);
  const n: Record<string, number> = {};
  for (let i = 0; i < draws; i++) {
    const d = drawDrink(s, menu, m);
    n[d] = (n[d] ?? 0) + 1;
  }
  for (const k of Object.keys(n)) n[k] /= draws;
  return n;
}
const sum = (n: Record<string, number>, ds: DrinkId[]) => ds.reduce((a, d) => a + (n[d] ?? 0), 0);

describe('Round 3 item 1: more lattes (order mix)', () => {
  it('milk drinks are roughly 40-45% of orders at a bar that makes everything', () => {
    const s = gearDay(5, WAND);
    const n = shares(s, everything);
    expect(sum(n, MILK)).toBeGreaterThan(0.38);
    expect(sum(n, MILK)).toBeLessThan(0.48);
  });

  it('the same holds early, with only latte among the milk drinks', () => {
    const s = gearDay(2, WAND);
    const n = shares(s, ['espresso', 'latte', 'coldBrew', 'drip']);
    expect(n.latte).toBeGreaterThan(0.38);
    expect(n.latte).toBeLessThan(0.48);
  });

  it('batch stays a solid share and nothing is mandatory', () => {
    const early = shares(gearDay(2, WAND), ['espresso', 'latte', 'coldBrew', 'drip']);
    expect(sum(early, ['coldBrew', 'drip'])).toBeGreaterThan(0.25);
    expect(early.espresso).toBeGreaterThan(0.1);
    const full = shares(gearDay(5, WAND), everything);
    expect(sum(full, ['coldBrew', 'drip'])).toBeGreaterThan(0.08);
    for (const d of everything.filter((x) => !MILK.includes(x))) expect(full[d] ?? 0).toBeGreaterThan(0.01);
  });

  it('a bar without a wand makes no milk drinks and its weights are unchanged', () => {
    const s = gearDay(5, NO_WAND);
    const menu = availableDrinks(s);
    expect(menu).not.toContain('latte');
    const m = computeModifiers(s);
    expect(milkPush(s, menu, m)).toBe(1);
    expect(shareWeights(s, menu, m)).toEqual(menu.map((d) => m.orderBias[d] * DRINK_INFO[d].bias * gearPullMul(s, d)));
  });

  it('classic runs are never reweighted', () => {
    const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand' });
    expect(milkPush(s, ['espresso', 'latte', 'coldBrew'], computeModifiers(s))).toBe(1);
  });

  it('a menu with only milk drinks (or none) is left alone, and a naturally milky mix is not pushed down', () => {
    const s = gearDay(5, WAND);
    const m = computeModifiers(s);
    expect(milkPush(s, ['latte', 'cappuccino'], m)).toBe(1);
    expect(milkPush(s, ['espresso', 'coldBrew'], m)).toBe(1);
    expect(milkPush(s, ['latte', 'cappuccino', 'espresso'], m)).toBeGreaterThanOrEqual(1);
    expect(milkPush(s, everything, m)).toBeLessThanOrEqual(LATTES.maxPush);
  });

  it('the shop forecast counts the push (shareWeights)', () => {
    const s = gearDay(5, WAND);
    const m = computeModifiers(s);
    const menu = availableDrinks(s);
    const w = shareWeights(s, menu, m);
    const milk = menu.reduce((a, d, i) => a + (MILK.includes(d) ? w[i] : 0), 0);
    expect(milk / w.reduce((a, b) => a + b, 0)).toBeGreaterThan(0.38);
  });
});

describe('Round 3 item 1: "and a latte for my friend"', () => {
  const events = (s: GameState, kind: string) => s.log.filter((e) => e.kind === kind).map((e) => e.data);

  it('about 5% of single orders add a latte: a two-item combo ticket, ×1.3 patience, order.addon logged', () => {
    const s = gearDay(2, WAND);
    expect(availableDrinks(s)).toContain('latte');
    let addons = 0;
    let singles = 0;
    const single: Partial<Record<DrinkId, number>> = {};
    let ratio: number | undefined;
    for (let i = 0; i < 1500; i++) {
      s.customers = [];
      s.log = [];
      const c = addCustomer(s, 'normal')!;
      const ev = events(s, 'order.addon');
      if (ev.length === 0) {
        if (c.order !== 'combo') {
          singles += 1;
          single[c.drink] = c.patienceMax;
        }
        continue;
      }
      addons += 1;
      expect(c.order).toBe('combo');
      expect(c.items).toHaveLength(2);
      expect(c.items![1].drink).toBe('latte');
      expect(ev).toEqual([{ customer: c.id, drink: 'latte' }]);
      expect(events(s, 'order.combo')).toHaveLength(0);
      const base = single[c.items![0].drink];
      if (c.items![0].drink === 'latte' && base !== undefined) ratio = c.patienceMax / base;
    }
    expect(ratio).toBeCloseTo(ORDERS.combo.patience, 1);
    const rate = addons / 1500;
    expect(rate).toBeGreaterThan(0.03);
    expect(rate).toBeLessThan(0.07);
    expect(singles).toBeGreaterThan(1000);
  });

  it('never at a bar without a wand, never on day 1, never for groups or regulars', () => {
    const none = gearDay(2, NO_WAND);
    for (let i = 0; i < 600; i++) {
      none.customers = [];
      addCustomer(none, 'normal');
    }
    expect(events(none, 'order.addon')).toHaveLength(0);
    const day1 = gearDay(1, WAND);
    for (let i = 0; i < 600; i++) {
      day1.customers = [];
      addCustomer(day1, 'normal');
    }
    expect(events(day1, 'order.addon')).toHaveLength(0);
    const g = gearDay(2, WAND);
    for (let i = 0; i < 600; i++) {
      g.customers = [];
      addCustomer(g, 'group');
      g.customers = [];
      addCustomer(g, 'regular');
    }
    expect(events(g, 'order.addon')).toHaveLength(0);
  });

  it('cups per arrival counts the add-on in the forecast', () => {
    const withWand = gearDay(2, WAND);
    const without = gearDay(2, NO_WAND);
    expect(cupsPerArrival(withWand, computeModifiers(withWand))).toBeGreaterThan(cupsPerArrival(without, computeModifiers(without)));
  });
});
