import { describe, expect, it } from 'vitest';
import { createRun } from '../run';
import { step } from '../step';
import { unlockedDrinks } from '../unlocks';
import { rentForDay } from '../effects';
import { restockCost } from '../night';
import { billsForDay, wagesForDay } from '../staff';
import { crewTips, planNight, PLAN_PRIORITY } from './planner';
import type { Advice } from './planner';
import { GEAR, type GearId } from '../../data/gear';
import type { DayStats, GameState, TierId } from '../types';

const dayStats = (over: Partial<DayStats> = {}): DayStats => ({ day: 1, served: 23, lost: 2, turnedAway: 0, sales: 40.84, tips: 3, rent: 25, ...over });
const FULL = { beans: 500, milk: 500, concentrate: 500, flavour: 500, pastry: 0 };

/** A Gear run at night with `bots` hired baristas. */
const gearRun = (opts: { bots?: number; tier?: TierId; dayLengthSec?: number; seed?: number } = {}): GameState =>
  createRun({
    seed: opts.seed ?? 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }],
    settings: { bots: opts.bots ?? 0, ...(opts.dayLengthSec ? { dayLengthSec: opts.dayLengthSec } : {}) },
    gear: true, tier: opts.tier ?? 'stand',
  });
/** A Gear run with some machines bought (cash set to `cash` afterwards), at night. */
function equipped(gears: GearId[], opts: Parameters<typeof gearRun>[0] = {}, cash = 300): GameState {
  let s = gearRun(opts);
  s.cash = 5000;
  for (const gear of gears) s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear }]);
  s.cash = cash;
  s.supplies = { ...FULL };
  return s;
}
const classicRun = (bots = 0, tier: TierId = 'stand'): GameState =>
  createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots }, tier });

const find = (s: GameState, id: string): Advice | undefined => planNight(s).find((a) => a.id === id);

describe('item 1: the planner budgets bills (rent + wages), not rent', () => {
  it('in a classic run bills equal rent exactly, with bots or without, on any tier and day', () => {
    for (const bots of [0, 1, 2, 3]) {
      for (const tier of ['stand', 'cart', 'cafe'] as TierId[]) {
        for (const day of [1, 4, 9, 20]) {
          const s = classicRun(bots, tier);
          s.day = day;
          expect(wagesForDay(s)).toBe(0);
          expect(billsForDay(s)).toBe(rentForDay(s));
        }
      }
    }
  });

  it('a classic run with bots plans exactly as without them, to the cent of the rent', () => {
    for (const cash of [0, 20, 33, 60, 140]) {
      const plan = (bots: number) => {
        const s = classicRun(bots);
        s.supplies = { ...FULL, beans: 0, milk: 0 };
        s.cash = rentForDay(s) + cash;
        return planNight(s);
      };
      expect(plan(2)).toEqual(plan(0));
      expect(plan(3)).toEqual(plan(0));
    }
    const s = classicRun(2);
    s.supplies = { ...FULL, beans: 0 };
    s.cash = rentForDay(s) + restockCost(s, 'beans', 1);
    expect(find(s, 'restock:beans')?.input).toMatchObject({ supply: 'beans', packs: 1 });
    s.cash = rentForDay(s) + restockCost(s, 'beans', 1) - 0.01;
    expect(find(s, 'restock:beans')).toBeUndefined();
  });

  it('a Gear run also holds back the wages, by the hour (a 60 s day pays 40%)', () => {
    for (const dayLengthSec of [150, 60]) {
      const s = equipped(['e1'], { bots: 2, dayLengthSec });
      s.supplies = { ...FULL, beans: 0 };
      const wages = wagesForDay(s);
      expect(wages).toBeGreaterThan(0);
      expect(billsForDay(s)).toBe(rentForDay(s) + wages);
      // enough for rent and one pack, but not for the wages as well
      s.cash = rentForDay(s) + restockCost(s, 'beans', 1);
      expect(find(s, 'restock:beans')).toBeUndefined();
      s.cash = billsForDay(s) + restockCost(s, 'beans', 1);
      expect(find(s, 'restock:beans')?.input).toMatchObject({ supply: 'beans', packs: 1 });
      // never more than cash after bills, in total
      for (const cash of [0, 12, 30, 60, 140, 400]) {
        s.cash = cash;
        const spent = planNight(s).reduce((n, x) => n + (x.input.kind === 'restock' ? restockCost(s, x.input.supply, x.input.packs) : 0), 0);
        expect(spent).toBeLessThanOrEqual(Math.max(0, cash - billsForDay(s)) + 1e-9);
      }
    }
  });
});

describe('item 2: no menu advice when nothing can be made', () => {
  it('night 1 of a Gear run with an empty counter: crewTips never suggests taking drinks off the board', () => {
    const s = gearRun({ bots: 2 });
    expect(unlockedDrinks(s)).toEqual([]);
    s.supplies.beans = 0;
    s.cash = 200;
    expect(planNight(s).some((a) => a.kind === 'menu')).toBe(false);
    expect(crewTips(s, 8).some((t) => t.kind === 'menu')).toBe(false);
  });

  it('still switches off a drink the bar cannot make once something can be (and in classic runs)', () => {
    const g = equipped(['e1']);
    expect(unlockedDrinks(g)).toEqual(['espresso']);
    expect(planNight(g).some((a) => a.kind === 'menu')).toBe(true);
    const classic = classicRun();
    classic.slots = ['grinder', null, null, 'trash'];
    expect(planNight(classic).some((a) => a.kind === 'menu')).toBe(true);
  });
});

describe('item 3: Gear buying hints', () => {
  const gearAd = (s: GameState) => planNight(s).filter((a) => a.id.startsWith('gear:'));
  const withYesterday = (s: GameState, cups: number, cupStars: number): GameState => {
    s.days.push(dayStats({ cups, cupStars }));
    return s;
  };

  it('opening night: the first machine on the upgrade path, as the plain gear buy input, priority 58', () => {
    const s = gearRun();
    s.cash = 120;
    const ads = gearAd(s);
    expect(ads).toHaveLength(1);
    expect(ads[0]).toMatchObject({ id: 'gear:c1', kind: 'equip', priority: PLAN_PRIORITY.gear, input: { kind: 'gear', action: 'buy', gear: 'c1' } });
    expect(PLAN_PRIORITY.gear).toBeGreaterThan(PLAN_PRIORITY.slot);
    expect(PLAN_PRIORITY.gear).toBeLessThan(PLAN_PRIORITY.checkout);
  });

  it('walks the path: owned and better machines are skipped, a trade-in lowers the price', () => {
    const s = equipped(['c1', 'e1'], {}, 400);
    expect(gearAd(s).map((a) => a.id)).toEqual(['gear:s1']);
    const t = equipped(['c1', 'e1', 's1'], {}, 400); // the stand has 4 slots, all full: c2 trades c1 in
    const ad = gearAd(t)[0];
    expect(ad?.id).toBe('gear:c2');
    expect(ad?.text).toContain('back on');
  });

  it('is silent in a classic run, and while a crew vote is open, and when it cannot pay', () => {
    expect(planNight(classicRun()).some((a) => a.input.kind === 'gear')).toBe(false);
    const open = equipped(['c1', 'e1'], {}, 400);
    open.gearVote = { by: 'p1', byName: 'K', action: 'buy', gear: 's1', amount: 10, yes: ['p1'], no: [] };
    expect(gearAd(open)).toEqual([]);
    const poor = equipped(['c1', 'e1'], {}, 5);
    expect(gearAd(poor)).toEqual([]);
  });

  it('never trades the E1 pods for E2+ while no grinder is in a slot (a full stand)', () => {
    // [b0, e1, c5, s3]: no free slot for a grinder, no grinder: the E2 trade-in would be the next buy
    const s = equipped(['e1', 'c5', 's3'], {}, 5000);
    expect(s.stations.some((x) => x.kind === 'grinder')).toBe(false);
    expect(s.slots!.every((x) => x !== null)).toBe(true);
    expect(planNight(s).filter((a) => a.input.kind === 'gear' && a.input.action === 'buy' && ['e2', 'e3', 'e4', 'e5', 'e6'].includes(a.input.gear))).toEqual([]);
    // with a grinder in a slot the trade is fine
    const g = equipped(['e1', 'c5', 'g1'], {}, 5000);
    expect(gearAd(g).map((a) => a.id)).toEqual(['gear:e2']);
  });

  it('prefers the polished C5 when yesterday’s cups averaged under 3★ and it is affordable', () => {
    const base = () => equipped(['e1', 'c4', 'g1'], {}, 1000);
    expect(gearAd(withYesterday(base(), 20, 40)).map((a) => a.id)).toEqual(['gear:c5']); // 2.0★
    const text = gearAd(withYesterday(base(), 20, 40))[0]!.text;
    expect(text).toContain('2.0★');
    expect(gearAd(withYesterday(base(), 20, 60)).map((a) => a.id)).toEqual(['gear:e2']); // a perfect 3.0★
    expect(gearAd(base()).map((a) => a.id)).toEqual(['gear:e2']); // no day on the books
    expect(gearAd(withYesterday(base(), 0, 0)).map((a) => a.id)).toEqual(['gear:e2']); // no cup scored
    // too dear: falls back to the normal path rather than waiting for it
    const poor = withYesterday(equipped(['e1', 'c4', 'g1'], {}, 85), 20, 40);
    poor.checkout = { owned: ['register', 'kiosk', 'squarely'], active: 'squarely', since: 1, by: 'K' }; // nothing else asks for the till
    expect(gearAd(poor).map((a) => a.id)).toEqual(['gear:e2']);
  });

  it('draws on the shared budget with the restock first, and never overdraws after bills', () => {
    for (const cash of [0, 20, 60, 90, 140, 200, 400, 1000]) {
      const s = equipped(['c1', 'e1'], { bots: 2 }, cash);
      s.supplies = { ...FULL, beans: 0 };
      const plan = planNight(s);
      const total = plan.reduce((n, a) => {
        if (a.input.kind === 'restock') return n + restockCost(s, a.input.supply, a.input.packs);
        if (a.input.kind === 'gear' && a.input.action === 'buy') return n + GEAR[a.input.gear].price;
        return n;
      }, 0);
      expect(total).toBeLessThanOrEqual(Math.max(0, cash - billsForDay(s)) + 1e-9);
    }
  });

  it('says a co-op buy needs a crew vote when two humans are connected and it costs $50 or more', () => {
    const s = equipped(['e1', 'c4', 'g1'], {}, 1000);
    s.players.push({ ...s.players[0]!, id: 'p2', name: 'L' });
    const ad = gearAd(withYesterday(s, 20, 40))[0]!;
    expect(ad.id).toBe('gear:c5');
    expect(ad.text).toContain('vote');
    const solo = gearAd(withYesterday(equipped(['e1', 'c4', 'g1'], {}, 1000), 20, 40))[0]!;
    expect(solo.text).not.toContain('vote');
  });
});
