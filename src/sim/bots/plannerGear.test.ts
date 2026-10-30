import { describe, expect, it } from 'vitest';
import { createRun } from '../run';
import { step } from '../step';
import { unlockedDrinks } from '../unlocks';
import { rentForDay } from '../effects';
import { restockCost } from '../night';
import { billsForDay, wagesForDay } from '../staff';
import { crewTips, planNight } from './planner';
import type { Advice } from './planner';
import type { GearId } from '../../data/gear';
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
