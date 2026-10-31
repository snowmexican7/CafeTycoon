import { describe, it, expect } from 'vitest';
import { createRun, startDay, startNight } from './run';
import { step } from './step';
import { validateInput } from './validate';
import { TIERS, applyGrowInput, canMake, floorWidth, growDiff, growthMorning, nextTier, nextTierAffordable, stationsFor, tierSpent } from './growth';
import { blocked } from './movement';
import { isWalkable, walkableNodes } from './bots/path';
import { unlockedDrinks } from './unlocks';
import { queueCapacity } from './customers';
import { computeModifiers, rentForDay } from './effects';
import { fittingsValue } from './score';
import { ECONOMY } from '../data/economy';
import { growthVM, nightViewModel } from '../ui/viewModels';
import type { GameState, TierId } from './types';

const run = (tier?: TierId, seed = 3) => createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier });
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

  it('the stand is 8 tiles: the hoarding blocks walking, pathing and the bots stay inside', () => {
    const s = run('stand');
    expect(floorWidth(s)).toBe(8);
    expect(s.stations.map((x) => x.kind).sort()).toEqual(['coldBrewTap', 'counter', 'espresso', 'grinder', 'trash']);
    expect(s.stations.every((x) => x.pos.x < 8)).toBe(true);
    expect(blocked({ x: 8.4, y: 4 }, s.stations, 8)).toBe(true);
    expect(blocked({ x: 8.4, y: 4 }, s.stations)).toBe(false);
    expect(isWalkable(s, { x: 9, y: 4 })).toBe(false);
    expect(walkableNodes(s).every((n) => n.x < 8)).toBe(true);
    expect(s.mop.pos.x).toBeLessThan(8);
  });

  it('the stand only offers what it can make; the cart brings the steamer drinks back', () => {
    const s = run('stand');
    s.unlocked = ['espresso', 'latte', 'coldBrew', 'icedLatte', 'mocha', 'matcha'];
    expect(unlockedDrinks(s)).toEqual(['espresso', 'coldBrew', 'icedLatte']);
    expect(canMake(s, 'latte')).toBe(false);
    s.tier = 'cart';
    s.stations = stationsFor('cart');
    expect(unlockedDrinks(s)).toEqual(s.unlocked);
    expect(canMake(run(), 'special')).toBe(true);
  });

  it('a whole stand day with bots serves customers, only stand drinks, and never more than 3 in line', () => {
    let s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 2 }, tier: 'stand' });
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
    expect(queueCapacity(m, TIERS.stand.queue)).toBe(3);
    expect(queueCapacity(m, TIERS.cart.queue)).toBe(5);
    expect(queueCapacity(m)).toBe(TIERS.cafe.queue);
    expect(rentForDay(run('stand'))).toBeLessThan(rentForDay(run()));
    const st = computeModifiers(run('stand'));
    expect(st.traffic).toBeCloseTo(m.traffic * TIERS.stand.traffic, 6);
    expect(st.price.espresso).toBeCloseTo(m.price.espresso * TIERS.stand.price, 6);
    expect(TIERS.cafe.price).toBe(1);
    expect(TIERS.cafe.traffic).toBe(1);
  });

  it('grows stand → cart → café in order, at night, by a human with the cash; the new floor is set up', () => {
    const s = night('stand');
    s.cash = 500;
    grow(s, 'cafe'); // can't skip the cart
    expect(s.tier).toBe('stand');
    s.phase = 'day';
    grow(s, 'cart');
    expect(s.tier).toBe('stand');
    s.phase = 'night';
    grow(s, 'cart');
    expect(s.tier).toBe('cart');
    expect(s.cash).toBe(500 - TIERS.cart.cost);
    expect(s.tierLog).toEqual([{ tier: 'cart', day: s.day, by: 'K' }]);
    expect(s.stations.some((x) => x.kind === 'steamer')).toBe(true);
    expect(growthMorning(s)).toContain("we're a cart now (grown by K)");
    grow(s, 'cafe');
    expect(nextTier(s)).toBeNull();
    expect(floorWidth(s)).toBe(12);
    expect(tierSpent(s)).toBe(TIERS.cart.cost + TIERS.cafe.cost);
    const poor = night('stand');
    poor.cash = 10;
    grow(poor, 'cart');
    expect(poor.tier).toBe('stand');
    const botty = night('stand');
    botty.cash = 500;
    botty.players.push({ ...botty.players[0], id: 'b1', name: 'Bo', bot: { personality: 'steady' } } as GameState['players'][number]);
    grow(botty, 'cart', 'b1');
    expect(botty.tier).toBe('stand');
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
    const s = night('stand');
    s.cash = 100;
    let g = growthVM(s);
    expect(g.current.id).toBe('stand');
    expect(g.tiers.find((t) => t.id === 'cart')).toMatchObject({ next: true, affordable: true });
    expect(g.tiers.find((t) => t.id === 'cafe')).toMatchObject({ locked: true, affordable: false });
    grow(s, 'cart');
    g = growthVM(s);
    expect(g.milestone).toBeTruthy();
    expect(nightViewModel(s, 'p1').growth.current.id).toBe('cart');
  });

  it('a played night then day at the stand keeps the stand floor after startNight', () => {
    let s = run('stand');
    s = startNight(startDay(s));
    expect(s.tier).toBe('stand');
    expect(s.stations.length).toBe(stationsFor('stand').length);
  });
});

describe('R3 6: the early growth nudge', () => {
  const nightAt = (cash: number, tier: TierId = 'stand', day = 2) => {
    const s = night(tier);
    s.day = day;
    s.cash = cash;
    return s;
  };
  const nudges = (s: GameState) => s.log.filter((e) => e.kind === 'grow.affordable');

  it('the cart costs $70', () => {
    expect(TIERS.cart.cost).toBe(70);
  });

  it('nextTierAffordable is the next tier when the cash covers it, else null (the café has none)', () => {
    expect(nextTierAffordable(nightAt(69))).toBeNull();
    expect(nextTierAffordable(nightAt(70))).toBe('cart');
    expect(nextTierAffordable(nightAt(149, 'cart'))).toBeNull();
    expect(nextTierAffordable(nightAt(150, 'cart'))).toBe('cafe');
    expect(nextTierAffordable(nightAt(9999, 'cafe'))).toBeNull();
  });

  it('emits grow.affordable { tier } once per night, the tick the cash first covers the next size', () => {
    let s = nightAt(10);
    for (let i = 0; i < 5; i++) s = step(s, []);
    expect(nudges(s)).toHaveLength(0);
    s.cash = 75; // e.g. a sale of gear
    s = step(s, []);
    expect(nudges(s)).toHaveLength(1);
    expect(nudges(s)[0].data).toEqual({ tier: 'cart' });
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
    const g = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear: true });
    g.cash = 500;
    const g1 = step(g, []);
    expect(g1.phase).toBe('night');
    expect(g1.day).toBe(1);
    expect(nudges(g1)).toHaveLength(0);
  });
});

describe('R3 7: the grow diff', () => {
  it('growDiff(stand, cart) is before → after for queue, price, traffic, rent, with the crowd and unlocks', () => {
    const d = growDiff('stand', 'cart');
    expect(d.queue).toEqual({ from: 3, to: 5 });
    expect(d.price).toEqual({ from: 0.75, to: 0.9 });
    expect(d.traffic).toEqual({ from: 0.65, to: 0.85 });
    expect(d.rent).toEqual({ from: 10, to: 17 });
    expect(d.crowd.from).toBe(TIERS.stand.crowd);
    expect(d.crowd.to).toBe(TIERS.cart.crowd);
    expect(d.unlocks.join(' ')).toMatch(/2 more tiles of floor/);
    expect(d.unlocks.join(' ')).toMatch(/back-bar slot/);
    expect(d.unlocks.join(' ')).toMatch(/Pairs of friends/);
    expect(growDiff('cart', 'cafe').unlocks).toContain('Groups come in');
  });

  it('a classic diff names the new stations and drinks instead of back-bar slots', () => {
    const d = growDiff('stand', 'cart', false);
    expect(d.unlocks.join(' ')).toMatch(/New station: steamer/);
    expect(d.unlocks.join(' ')).toMatch(/New drinks:.*Latte/);
    expect(d.unlocks.join(' ')).not.toMatch(/back-bar/);
  });

  it('is pure: the same answer twice, and it does not touch the tier table', () => {
    const before = JSON.stringify(TIERS);
    expect(growDiff('stand', 'cafe')).toEqual(growDiff('stand', 'cafe'));
    expect(JSON.stringify(TIERS)).toBe(before);
  });

  it('a grow emits grow.done { from, to, diff } and a refused grow emits nothing', () => {
    const s = night('stand');
    s.cash = 500;
    grow(s, 'cafe'); // out of order
    expect(s.log.filter((e) => e.kind === 'grow.done')).toHaveLength(0);
    grow(s, 'cart');
    const ev = s.log.filter((e) => e.kind === 'grow.done');
    expect(ev).toHaveLength(1);
    expect(ev[0].data).toEqual({ from: 'stand', to: 'cart', diff: growDiff('stand', 'cart', false) });
    grow(s, 'cafe');
    expect(s.log.filter((e) => e.kind === 'grow.done').map((e) => e.data.to)).toEqual(['cart', 'cafe']);
  });

  it('a Gear run\'s grow.done diff lists back-bar slots', () => {
    const g = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear: true });
    g.phase = 'night';
    g.cash = 500;
    grow(g, 'cart');
    const ev = g.log.find((e) => e.kind === 'grow.done')!;
    expect(JSON.stringify(ev.data.diff)).toMatch(/back-bar/);
  });
});
