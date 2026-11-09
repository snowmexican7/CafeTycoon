import { describe, it, expect } from 'vitest';
import { createRun, startDay, startNight } from './run';
import { step } from './step';
import { validateInput } from './validate';
import { TIERS, applyGrowInput, canMake, floorWidth, growDiff, growthMorning, nextTier, nextTierAffordable, stationsFor, tierSpent } from './growth';
import { blocked } from './movement';
import { isWalkable, walkableNodes } from './path';
import { unlockedDrinks } from './unlocks';
import { queueCapacity } from './customers';
import { computeModifiers, rentForDay } from './effects';
import { fittingsValue } from './score';
import { ECONOMY } from '../data/economy';
import { layoutFor } from '../data/layout';
import { growthVM, nightViewModel } from '../ui/viewModels';
import type { GameState, TierId } from './types';
import { addBots } from '../harness/crew';
import { fridgeGear } from './fridge';

const run = (tier?: TierId, seed = 3) => createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], tier });
const night = (tier?: TierId) => {
  const s = run(tier);
  s.phase = 'night';
  return s;
};
const grow = (s: GameState, tier: TierId, playerId = 'p1') => applyGrowInput(s, { kind: 'grow', playerId, tier });
const playDay = (s: GameState) => {
  s = startDay(s);
  for (let i = 0; i < 60 * 60 * 6 && s.phase === 'day'; i++) s = step(s, []);
  for (let i = 0; i < 60 * 60 && s.phase !== 'night' && s.phase !== 'weekEnd'; i++) s = step(s, []);
  return s;
};

describe('growth path (P3 B13)', () => {
  it('a café run (every old save) has no tier field and runs exactly as an explicit café run', () => {
    const a = run();
    const b = run('cafe');
    expect('tier' in a).toBe(false);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(playDay(a))).toBe(JSON.stringify(playDay(b)));
  });

  it('the cart is 8 tiles: the hoarding blocks walking, pathing and the bots stay inside', () => {
    const s = run('cart');
    expect(floorWidth(s)).toBe(8);
    expect(s.stations.map((x) => x.kind).sort()).toEqual(['coldBrewTap', 'counter', 'espresso', 'grinder', 'trash']);
    expect(s.stations.every((x) => x.pos.x < 8)).toBe(true);
    expect(blocked({ x: 8.4, y: 4 }, s.stations, 8)).toBe(true);
    expect(blocked({ x: 8.4, y: 4 }, s.stations)).toBe(false);
    expect(isWalkable(s, { x: 9, y: 4 })).toBe(false);
    expect(walkableNodes(s).every((n) => n.x < 8)).toBe(true);
    expect(s.mop.pos.x).toBeLessThan(8);
  });

  it('the cart only offers what it can make; the stand brings the steamer drinks back', () => {
    const s = run('cart');
    s.unlocked = ['espresso', 'latte', 'coldBrew', 'icedLatte', 'mocha', 'matcha'];
    expect(unlockedDrinks(s)).toEqual(['espresso', 'coldBrew', 'icedLatte']);
    expect(canMake(s, 'latte')).toBe(false);
    s.tier = 'stand';
    s.stations = stationsFor('stand');
    expect(unlockedDrinks(s)).toEqual(s.unlocked);
    expect(canMake(run(), 'special')).toBe(true);
  });

  it('a whole cart day with bots serves customers, only cart drinks, and never more than 3 in line', () => {
    let s = addBots(createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], tier: 'cart' }), 2);
    s.players[0].connected = false;
    s = startDay(s);
    let maxLine = 0;
    const drinks = new Set<string>();
    for (let i = 0; i < 60 * 60 * 6 && s.phase === 'day'; i++) {
      s = step(s, []);
      maxLine = Math.max(maxLine, s.customers.length);
      s.customers.forEach((c) => drinks.add(c.drink));
      for (const p of s.players) expect(p.pos.x).toBeLessThan(8);
    }
    expect(s.today.served).toBeGreaterThan(0);
    expect(maxLine).toBeLessThanOrEqual(3);
    expect([...drinks].every((d) => ['espresso', 'coldBrew', 'icedLatte'].includes(d))).toBe(true);
  });

  it('queue and rent follow the tier; the café is unchanged', () => {
    const m = computeModifiers(run());
    expect(queueCapacity(m, TIERS.cart.queue)).toBe(3);
    expect(queueCapacity(m, TIERS.stand.queue)).toBe(5);
    expect(queueCapacity(m)).toBe(TIERS.cafe.queue);
    expect(rentForDay(run('cart'))).toBeLessThan(rentForDay(run()));
    const st = computeModifiers(run('cart'));
    expect(st.traffic).toBeCloseTo(m.traffic * TIERS.cart.traffic, 6);
    expect(st.price.espresso).toBeCloseTo(m.price.espresso * TIERS.cart.price, 6);
    expect(TIERS.cafe.price).toBe(1);
    expect(TIERS.cafe.traffic).toBe(1);
  });

  it('grows cart → stand → café in order, at night, by a human with the cash; the new floor is set up', () => {
    const s = night('cart');
    s.cash = 500;
    grow(s, 'cafe'); // can't skip the stand
    expect(s.tier).toBe('cart');
    s.phase = 'day';
    grow(s, 'stand');
    expect(s.tier).toBe('cart');
    s.phase = 'night';
    grow(s, 'stand');
    expect(s.tier).toBe('stand');
    expect(s.cash).toBe(500 - TIERS.stand.cost);
    expect(s.tierLog).toEqual([{ tier: 'stand', day: s.day, by: 'K' }]);
    expect(s.stations.some((x) => x.kind === 'steamer')).toBe(true);
    expect(growthMorning(s)).toContain("we're a stand now (grown by K)");
    grow(s, 'cafe');
    expect(nextTier(s)).toBeNull();
    expect(floorWidth(s)).toBe(12);
    expect(tierSpent(s)).toBe(TIERS.stand.cost + TIERS.cafe.cost);
    const poor = night('cart');
    poor.cash = 10;
    grow(poor, 'stand');
    expect(poor.tier).toBe('cart');
  });

  it('validates the grow input shape', () => {
    expect(validateInput({ kind: 'grow', playerId: 'p1', tier: 'cart' })).toBeTruthy();
    expect(validateInput({ kind: 'grow', playerId: 'p1', tier: 'mansion' } as never)).toBeFalsy();
  });

  it('the growth spend counts in the fittings value', () => {
    const s = night('stand');
    s.cash = 200;
    const before = fittingsValue(s);
    grow(s, 'cart');
    expect(fittingsValue(s)).toBeCloseTo(before + TIERS.cart.cost * ECONOMY.fittingsResale, 2);
  });

  it('the Shopfront board shows the path and the milestone after growing', () => {
    const s = night('cart');
    s.cash = 100;
    let g = growthVM(s);
    expect(g.current.id).toBe('cart');
    expect(g.tiers.find((t) => t.id === 'stand')).toMatchObject({ next: true, affordable: true });
    expect(g.tiers.find((t) => t.id === 'cafe')).toMatchObject({ locked: true, affordable: false });
    grow(s, 'stand');
    g = growthVM(s);
    expect(g.milestone).toBeTruthy();
    expect(nightViewModel(s, 'p1').growth.current.id).toBe('stand');
  });

  it('a played night then day at the cart keeps the cart floor after startNight', () => {
    let s = run('cart');
    s = startNight(startDay(s));
    expect(s.tier).toBe('cart');
    expect(s.stations.length).toBe(stationsFor('cart').length);
  });
});

describe('R3 6: the early growth nudge', () => {
  const nightAt = (cash: number, tier: TierId = 'cart', day = 2) => {
    const s = night(tier);
    s.day = day;
    s.cash = cash;
    return s;
  };
  const nudges = (s: GameState) => s.log.filter((e) => e.kind === 'grow.affordable');

  it('the stand costs $70', () => {
    expect(TIERS.stand.cost).toBe(70);
    expect(TIERS.cart.cost).toBe(0);
  });

  it('nextTierAffordable is the next tier when the cash covers it, else null (the café has none)', () => {
    expect(nextTierAffordable(nightAt(69))).toBeNull();
    expect(nextTierAffordable(nightAt(70))).toBe('stand');
    expect(nextTierAffordable(nightAt(149, 'stand'))).toBeNull();
    expect(nextTierAffordable(nightAt(150, 'stand'))).toBe('cafe');
    expect(nextTierAffordable(nightAt(9999, 'cafe'))).toBeNull();
  });

  it('emits grow.affordable { tier } once per night, the tick the cash first covers the next size', () => {
    let s = nightAt(10);
    for (let i = 0; i < 5; i++) s = step(s, []);
    expect(nudges(s)).toHaveLength(0);
    s.cash = 75; // e.g. a sale of gear
    s = step(s, []);
    expect(nudges(s)).toHaveLength(1);
    expect(nudges(s)[0].data).toEqual({ tier: 'stand' });
    for (let i = 0; i < 5; i++) s = step(s, []);
    expect(nudges(s)).toHaveLength(1); // not every tick
  });

  it('fires at the top of a night that starts affordable, and again on the next night', () => {
    let s = nightAt(200);
    s = step(s, []);
    expect(nudges(s)).toHaveLength(1);
    s = startDay(s);
    s.day = 3;
    s = startNight(s);
    s = step(s, []);
    expect(nudges(s)).toHaveLength(2);
  });

  it('stays quiet when the next size is out of reach, at the café, in the day, and on a Gear run\'s first night', () => {
    let s = nightAt(50);
    for (let i = 0; i < 5; i++) s = step(s, []);
    expect(nudges(s)).toHaveLength(0);
    let c = nightAt(9999, 'cafe');
    c = step(c, []);
    expect(nudges(c)).toHaveLength(0);
    const g = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], tier: 'cart', gear: true });
    g.cash = 500;
    const g1 = step(g, []);
    expect(g1.phase).toBe('night');
    expect(g1.day).toBe(1);
    expect(nudges(g1)).toHaveLength(0);
  });
});

describe('R3 7: the grow diff', () => {
  it('growDiff(cart, stand) is before → after for queue, price, traffic, rent, with the crowd and unlocks', () => {
    const d = growDiff('cart', 'stand');
    expect(d.queue).toEqual({ from: 3, to: 5 });
    expect(d.price).toEqual({ from: 0.8, to: 0.9 });
    expect(d.traffic).toEqual({ from: 0.65, to: 0.85 });
    expect(d.rent).toEqual({ from: 10, to: 17 });
    expect(d.crowd.from).toBe(TIERS.cart.crowd);
    expect(d.crowd.to).toBe(TIERS.stand.crowd);
    expect(d.unlocks.join(' ')).toMatch(/2 more tiles of floor/);
    expect(d.unlocks.join(' ')).toMatch(/back-bar slot/);
    expect(d.unlocks.join(' ')).toMatch(/Pairs of friends/);
    expect(growDiff('stand', 'cafe').unlocks).toContain('Groups come in');
  });

  it('a classic diff names the new stations and drinks instead of back-bar slots', () => {
    const d = growDiff('cart', 'stand', false);
    expect(d.unlocks.join(' ')).toMatch(/New station: steamer/);
    expect(d.unlocks.join(' ')).toMatch(/New drinks:.*Latte/);
    expect(d.unlocks.join(' ')).not.toMatch(/back-bar/);
  });

  it('is pure: the same answer twice, and it does not touch the tier table', () => {
    const before = JSON.stringify(TIERS);
    expect(growDiff('cart', 'cafe')).toEqual(growDiff('cart', 'cafe'));
    expect(JSON.stringify(TIERS)).toBe(before);
  });

  it('a grow emits grow.done { from, to, diff } and a refused grow emits nothing', () => {
    const s = night('cart');
    s.cash = 500;
    grow(s, 'cafe'); // out of order
    expect(s.log.filter((e) => e.kind === 'grow.done')).toHaveLength(0);
    grow(s, 'stand');
    const ev = s.log.filter((e) => e.kind === 'grow.done');
    expect(ev).toHaveLength(1);
    expect(ev[0].data).toEqual({ from: 'cart', to: 'stand', diff: growDiff('cart', 'stand', false) });
    grow(s, 'cafe');
    expect(s.log.filter((e) => e.kind === 'grow.done').map((e) => e.data.to)).toEqual(['stand', 'cafe']);
  });

  it('a Gear run\'s grow.done diff lists back-bar slots', () => {
    const g = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], tier: 'cart', gear: true });
    g.phase = 'night';
    g.cash = 500;
    grow(g, 'stand');
    const ev = g.log.find((e) => e.kind === 'grow.done')!;
    expect(JSON.stringify(ev.data.diff)).toMatch(/back-bar/);
  });
});

describe('playthrough: cart → stand → café', () => {
  const front = (s: GameState) => {
    const till = s.stations.find((x) => x.id === 'counter')!;
    const pick = s.stations.find((x) => x.id === 'pickup');
    if (pick) expect(pick.pos).toEqual({ x: till.pos.x - 1, y: till.pos.y });
    expect(till.pos).toEqual({ x: 6, y: 6 });
  };

  it('a Gear shop opens on the sidewalk cart, then grows into the stand and the café', () => {
    let s = createRun({
      seed: 4,
      hostId: 'p1',
      players: [{ id: 'p1', name: 'K' }],
      tier: 'cart',
      gear: true,
      settings: { dayLengthSec: 20, nightLengthSec: 2 },
    });
    expect(s.tier).toBe('cart');
    expect(floorWidth(s)).toBe(8);
    expect(fridgeGear(s)).toBeNull();
    expect(layoutFor('cart').width).toBe(8);
    expect(layoutFor('stand').width).toBe(10);
    front(s);

    s.cash = 500;
    s = playDay(s);
    expect(s.phase).toBe('night');
    expect(s.tier).toBe('cart');
    grow(s, 'stand');
    expect(s.tier).toBe('stand');
    expect(floorWidth(s)).toBe(10);
    expect(fridgeGear(s)).toBe('f2');
    expect(s.tierLog?.map((e) => e.tier)).toEqual(['stand']);
    front(s);
    expect(growthMorning(s)).toContain("we're a stand now");

    s.cash = 500;
    s = playDay(s);
    expect(s.tier).toBe('stand');
    grow(s, 'cafe');
    expect(s.tier).toBe('cafe');
    expect(floorWidth(s)).toBe(12);
    expect(fridgeGear(s)).toBe('f3');
    expect(s.tierLog?.map((e) => e.tier)).toEqual(['stand', 'cafe']);
    front(s);
    expect(nextTier(s)).toBeNull();
    // The register and the pickup stay the front pair on every footprint.
    for (const tier of ['cart', 'stand', 'cafe'] as const) {
      expect(layoutFor(tier).pickup).toEqual({ x: 5, y: 6 });
      const till = layoutFor(tier).stations.find((x) => x.id === 'counter')!;
      expect(till.pos).toEqual({ x: 6, y: 6 });
    }
  });
});
