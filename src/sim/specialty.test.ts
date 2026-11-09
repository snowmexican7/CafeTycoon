import { describe, expect, it } from 'vitest';
import { DRINK_FAMILY } from '../data/areas';
import { DRINK_IDS } from '../data/drinks';
import { GEAR, type GearId } from '../data/gear';
import { ECONOMY } from '../data/economy';
import { computeModifiers } from './effects';
import { finishDay } from './closing';
import { spawnCustomers, drawDrink, oneOffLeave } from './customers';
import { priceForecast } from './pricing';
import { milkPush } from './lattes';
import { morningNotes } from './describe';
import { rngNext } from './rng';
import { createRun, startDay, startNight } from './run';
import { stationsFromSlots } from './slots';
import { chooseShopIdentity, lightDrinks, shopFacing, SPECIALTY } from './specialty';
import type { DayStats, DrinkId, GameState, SoldDay, SupplyId, TierId } from './types';

type Kit = GearId | 'steamer';

function gearDay(day: number, gear: Kit[], seed = 7, tier: TierId = 'cafe'): GameState {
  const s = createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], tier, gear: true });
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
  s.scenario = 'touristSeason';
  s.forecast = 'ordinary';
  const out = startDay(s);
  out.scenario = 'touristSeason';
  out.forecast = 'ordinary';
  for (const k of ['beans', 'milk', 'concentrate'] as SupplyId[]) out.supplies[k] = 99;
  return out;
}

const WAND: Kit[] = ['g1', 'e2', 'steamer', 'c1', 'd1'];
const EARLY: DrinkId[] = ['espresso', 'latte', 'coldBrew', 'drip'];
const WIDE: DrinkId[] = ['espresso', 'latte', 'cappuccino', 'drip', 'cafeAuLait', 'coldBrew'];

function sold(day: number, drinks: Partial<Record<DrinkId, number>>): SoldDay {
  return { day, drinks };
}

function scored(day: number, drinks: Partial<Record<DrinkId, number>>): DayStats {
  const served = Object.values(drinks).reduce((a, n) => a + (n ?? 0), 0);
  return { day, served, lost: 0, turnedAway: 0, sales: served * 4, tips: 1, rent: 10, drinks: { ...drinks } as Record<DrinkId, number> };
}

function gearNight(): GameState {
  return createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], gear: true });
}

/** Cups in the identity's families, as a share of `draws` (same RNG start if the caller resets `state.rng`). */
function familyShare(s: GameState, menu: DrinkId[], want: 'milky' | 'espresso' | 'filter', draws = 8000): number {
  const m = computeModifiers(s);
  let n = 0;
  for (let i = 0; i < draws; i++) {
    if (DRINK_FAMILY[drawDrink(s, menu, m)] === want) n++;
  }
  return n / draws;
}

/** Put the generator back so the next `rngNext` is below `p`. */
function primeNextBelow(s: GameState, p: number): void {
  for (;;) {
    const saved = s.rng;
    if (rngNext(s) < p) {
      s.rng = saved;
      return;
    }
  }
}

describe('specialty shops: identity from the cups actually served', () => {
  it('forms a latte bar, a quick cup, or a neighbourhood café from the window', () => {
    const latte = gearNight();
    latte.days = [scored(1, { latte: 40, espresso: 10, drip: 5, coldBrew: 5 })];
    startNight(latte);
    expect(latte.shopIdentity).toBe('specialty');
    expect(shopFacing(latte)?.badge).toBe('Latte bar');

    const espresso = gearNight();
    espresso.days = [scored(1, { espresso: 50, latte: 10, drip: 20, coldBrew: 20 })];
    startNight(espresso);
    expect(espresso.shopIdentity).toBe('specialty');
    expect(shopFacing(espresso)?.badge).toBe('Espresso bar');

    const drip = gearNight();
    drip.days = [scored(1, { drip: 60, latte: 20, espresso: 10, coldBrew: 10 })];
    startNight(drip);
    expect(drip.shopIdentity).toBe('fastCasual');
    expect(shopFacing(drip)?.badge).toBe('Quick cup');

    const mixed = gearNight();
    mixed.days = [scored(1, { latte: 28, espresso: 22, drip: 28, coldBrew: 22 })];
    startNight(mixed);
    expect(mixed.shopIdentity).toBe('neighbourhood');
    expect(shopFacing(mixed)?.badge).toBe('Neighbourhood café');

    const iced = gearNight();
    iced.days = [scored(1, { coldBrew: 70, latte: 20, drip: 10 })];
    startNight(iced);
    expect(iced.shopIdentity).toBe('neighbourhood');
  });

  it('stays unsigned until a day has been scored, and a classic run never takes a name', () => {
    const fresh = gearNight();
    expect(fresh.shopIdentity).toBeUndefined();
    expect(shopFacing(fresh)).toBeNull();
    startNight(fresh);
    expect(fresh.shopIdentity).toBeUndefined();

    const classic = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
    classic.days = [scored(1, { latte: 40, espresso: 20, drip: 2 })];
    startNight(classic);
    expect(classic.shopIdentity).toBeUndefined();
    expect(classic.soldWindow).toBeUndefined();
  });

  it('keeps only the last three scored days', () => {
    const s = gearNight();
    s.days = [
      scored(1, { drip: 200 }),
      scored(2, { drip: 200 }),
      scored(3, { latte: 80, espresso: 10, drip: 5 }),
      scored(4, { latte: 80, espresso: 10, drip: 5 }),
      scored(5, { latte: 80, espresso: 10, drip: 5 }),
    ];
    startNight(s);
    expect(s.soldWindow?.map((d) => d.day)).toEqual([3, 4, 5]);
    expect(s.shopIdentity).toBe('specialty');
  });

  it('holds through a near miss, and switches when the window really changes', () => {
    // 48% espresso+milky and 52% filter would form a quick cup. A latte bar holds.
    expect(chooseShopIdentity('specialty', [sold(1, { latte: 38, espresso: 10, drip: 52 })])).toBe('specialty');
    const held = gearNight();
    held.shopIdentity = 'specialty';
    held.days = [scored(1, { latte: 38, espresso: 10, drip: 52 })];
    startNight(held);
    expect(held.shopIdentity).toBe('specialty');

    // 42% filter and 58% lattes would form a latte bar. A quick cup holds.
    const heldFast = gearNight();
    heldFast.shopIdentity = 'fastCasual';
    heldFast.days = [scored(1, { drip: 42, latte: 50, espresso: 8 })];
    startNight(heldFast);
    expect(heldFast.shopIdentity).toBe('fastCasual');

    const toFast = gearNight();
    toFast.shopIdentity = 'specialty';
    toFast.days = [scored(1, { drip: 70, latte: 20, espresso: 10 })];
    startNight(toFast);
    expect(toFast.shopIdentity).toBe('fastCasual');

    const toLatte = gearNight();
    toLatte.shopIdentity = 'fastCasual';
    toLatte.days = [scored(1, { latte: 60, espresso: 15, drip: 25 })];
    startNight(toLatte);
    expect(toLatte.shopIdentity).toBe('specialty');
  });

  it('a week that ends still records the identity', () => {
    const s = gearNight();
    s.cash = 5000;
    s.day = ECONOMY.scoredWeekDays;
    s.today = scored(ECONOMY.scoredWeekDays, { latte: 40, espresso: 12, drip: 4 });
    finishDay(s);
    expect(s.phase).toBe('weekEnd');
    expect(s.shopIdentity).toBe('specialty');
    expect(s.soldWindow?.at(-1)?.day).toBe(ECONOMY.scoredWeekDays);
  });
});

describe('specialty shops: orders follow the identity, and the wand push steps aside', () => {
  it('a neighbourhood café keeps the wand push; a named shop does not', () => {
    const s = gearDay(5, WAND);
    const m = computeModifiers(s);
    expect(milkPush(s, WIDE, m)).toBeGreaterThan(1);
    s.shopIdentity = 'neighbourhood';
    expect(milkPush(s, WIDE, m)).toBeGreaterThan(1);
    s.shopIdentity = 'specialty';
    expect(milkPush(s, WIDE, m)).toBe(1);
    s.shopIdentity = 'fastCasual';
    expect(milkPush(s, WIDE, m)).toBe(1);
  });

  it('a latte bar sells more lattes, and an espresso bar more espresso, on a short menu and a wide one', () => {
    for (const menu of [EARLY, WIDE]) {
      const latteShop = gearDay(5, WAND);
      const rng = latteShop.rng;
      const beforeMilk = familyShare(latteShop, menu, 'milky');
      latteShop.rng = rng;
      latteShop.shopIdentity = 'specialty';
      latteShop.soldWindow = [sold(1, { latte: 70, espresso: 10, drip: 10, coldBrew: 10 })];
      const afterMilk = familyShare(latteShop, menu, 'milky');
      const milkDelta = afterMilk - beforeMilk;
      expect(milkDelta, `${menu.join(',')} milky ${beforeMilk.toFixed(3)} -> ${afterMilk.toFixed(3)}`).toBeGreaterThan(0.08);
      expect(milkDelta).toBeLessThan(0.12);

      const espressoShop = gearDay(5, WAND);
      const rngE = espressoShop.rng;
      const beforeEsp = familyShare(espressoShop, menu, 'espresso');
      espressoShop.rng = rngE;
      espressoShop.shopIdentity = 'specialty';
      espressoShop.soldWindow = [sold(1, { espresso: 60, latte: 8, drip: 16, coldBrew: 16 })];
      const afterEsp = familyShare(espressoShop, menu, 'espresso');
      const espDelta = afterEsp - beforeEsp;
      expect(espDelta, `${menu.join(',')} espresso ${beforeEsp.toFixed(3)} -> ${afterEsp.toFixed(3)}`).toBeGreaterThan(0.08);
      expect(espDelta).toBeLessThan(0.12);
    }
  });

  it('sells more drip once it is a quick cup, about 13 points', () => {
    for (const menu of [EARLY, WIDE]) {
      const s = gearDay(5, WAND);
      const rng = s.rng;
      const before = familyShare(s, menu, 'filter');
      s.rng = rng;
      s.shopIdentity = 'fastCasual';
      s.soldWindow = [sold(1, { drip: 70, latte: 15, espresso: 10, coldBrew: 5 })];
      const after = familyShare(s, menu, 'filter');
      const delta = after - before;
      expect(delta, `${menu.join(',')} filter ${before.toFixed(3)} -> ${after.toFixed(3)}`).toBeGreaterThan(0.11);
      expect(delta).toBeLessThan(0.15);
    }
  });

  it('the night forecast, rough guess included, gives the named drink more orders', () => {
    const s = gearDay(5, WAND);
    // One barista pours so few cups that rounding the guess to 5 hides a real lift. A full crew does not.
    for (const [id, name] of [['p2', 'A'], ['p3', 'B'], ['p4', 'C']] as const) {
      s.players.push({ ...s.players[0]!, id, name, connected: true });
    }
    const menu = EARLY;
    const m = computeModifiers(s);
    const walkIns = ECONOMY.baseArrivalsPerSecond * s.settings.dayLengthSec * m.traffic;
    const beforeExact = priceForecast(s, menu, m, walkIns, true);
    const beforeRough = priceForecast(s, menu, m, walkIns, false);
    s.shopIdentity = 'specialty';
    s.soldWindow = [sold(1, { latte: 70, espresso: 10, drip: 10, coldBrew: 10 })];
    const afterExact = priceForecast(s, menu, m, walkIns, true);
    const afterRough = priceForecast(s, menu, m, walkIns, false);
    const orders = (lines: { drink: DrinkId; orders: number }[], drink: DrinkId) => lines.find((l) => l.drink === drink)!.orders;
    expect(orders(afterExact, 'latte')).toBeGreaterThan(orders(beforeExact, 'latte'));
    expect(orders(afterExact, 'latte')).toBeGreaterThan(orders(afterExact, 'coldBrew'));
    expect(orders(afterRough, 'latte')).toBeGreaterThan(orders(beforeRough, 'latte'));
    expect(afterRough.every((l) => l.rough)).toBe(true);
  });

  it('a neighbourhood name does not move the mix', () => {
    const s = gearDay(5, WAND);
    const rng = s.rng;
    const before = familyShare(s, WIDE, 'milky', 2000);
    s.rng = rng;
    s.shopIdentity = 'neighbourhood';
    s.soldWindow = [sold(1, { latte: 28, espresso: 22, drip: 28, coldBrew: 22 })];
    const after = familyShare(s, WIDE, 'milky', 2000);
    expect(after).toBeCloseTo(before, 5);
  });
});

describe('specialty shops: the off-menu customer leaves politely', () => {
  const menu: DrinkId[] = ['latte', 'espresso', 'drip'];
  const window = [sold(1, { latte: 70, espresso: 20, drip: 5, coldBrew: 5 })];

  function ready(): GameState {
    const s = gearDay(4, WAND);
    s.shopIdentity = 'specialty';
    s.soldWindow = window;
    return s;
  }

  it('asks for the drink the shop barely sells, and does not join the queue or cost reputation', () => {
    const s = ready();
    expect(lightDrinks(s, menu)).toEqual(['drip']);
    primeNextBelow(s, SPECIALTY.oneOff);
    const rep = s.reputation;
    const lost = s.today.lost;
    const id = s.nextCustomerId;
    expect(oneOffLeave(s, menu)).toBe(true);
    expect(s.customers).toHaveLength(0);
    expect(s.today.lost).toBe(lost);
    expect(s.today.turnedAway).toBe(0);
    expect(s.today.oneOffLeft).toBe(1);
    expect(s.reputation).toBe(rep);
    expect(s.nextCustomerId).toBe(id + 1);
    const left = s.log.filter((e) => e.kind === 'walkout' && e.data.reason === 'oneOff');
    expect(left).toHaveLength(1);
    expect(left[0]?.data.drink).toBe('drip');
  });

  it('is quiet when the roll misses, when nothing on the menu is rare, and before an identity', () => {
    const miss = ready();
    for (;;) {
      const saved = miss.rng;
      const roll = rngNext(miss);
      if (roll >= SPECIALTY.oneOff) {
        miss.rng = saved;
        break;
      }
    }
    expect(oneOffLeave(miss, menu)).toBe(false);
    expect(miss.today.oneOffLeft).toBeUndefined();
    expect(miss.log.some((e) => e.kind === 'walkout')).toBe(false);

    const full = ready();
    const before = full.rng;
    expect(lightDrinks(full, ['latte', 'espresso'])).toEqual([]);
    expect(oneOffLeave(full, ['latte', 'espresso'])).toBe(false);
    expect(full.rng).toBe(before);

    const unnamed = gearDay(4, WAND);
    const held = unnamed.rng;
    expect(oneOffLeave(unnamed, menu)).toBe(false);
    expect(unnamed.rng).toBe(held);
  });

  it('about 8% of arrivals who reach the order leave this way, and the same seed agrees', () => {
    const run = () => {
      const s = ready();
      let left = 0;
      for (let i = 0; i < 4000; i++) if (oneOffLeave(s, menu)) left++;
      return { left, drinks: s.log.filter((e) => e.data.reason === 'oneOff').map((e) => e.data.drink) };
    };
    const a = run();
    const b = run();
    expect(a.left / 4000).toBeGreaterThan(0.06);
    expect(a.left / 4000).toBeLessThan(0.1);
    expect(a.drinks.every((d) => d === 'drip')).toBe(true);
    expect(b).toEqual(a);
  });

  it('shows up on the morning note, in plain words', () => {
    const s = gearNight();
    s.days = [{ ...scored(1, { latte: 10 }), oneOffLeft: 2 }];
    const notes = morningNotes(s).join(' ');
    expect(notes).toContain('2 people asked for a drink this shop rarely makes, and left politely.');
    expect(notes.toLowerCase()).not.toContain('tap');
    const face = shopFacing({ ...s, gear: true, shopIdentity: 'specialty', soldWindow: [sold(1, { latte: 10 })] });
    expect(face?.line.toLowerCase()).not.toContain('tap');
    expect(SPECIALTY.oneOffLines.join(' ').toLowerCase()).not.toContain('tap');
  });

  it('a busy day still lets them leave without counting as lost', () => {
    const s = ready();
    s.unlocked = [...DRINK_IDS];
    for (const d of DRINK_IDS) s.menu[d] = d === 'latte' || d === 'espresso' || d === 'drip';
    const prev = ECONOMY.baseArrivalsPerSecond;
    (ECONOMY as { baseArrivalsPerSecond: number }).baseArrivalsPerSecond = 60;
    try {
      for (let i = 0; i < 120; i++) spawnCustomers(s);
    } finally {
      (ECONOMY as { baseArrivalsPerSecond: number }).baseArrivalsPerSecond = prev;
    }
    expect(s.today.oneOffLeft ?? 0).toBeGreaterThan(0);
    expect(s.today.lost).toBe(0);
    expect(s.log.filter((e) => e.data.reason === 'oneOff').every((e) => {
      const fam = DRINK_FAMILY[e.data.drink as DrinkId];
      return fam === 'filter' || fam === 'iced';
    })).toBe(true);
  });
});
