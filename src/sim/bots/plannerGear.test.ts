import { describe, expect, it } from 'vitest';
import { createRun } from '../run';
import { step } from '../step';
import { menuDrinks, unlockedDrinks } from '../unlocks';
import { expectedUse } from '../brief';
import { countered, hasStamps, isPromoDay, RIVAL } from '../rival';
import { ECONOMY } from '../../data/economy';
import { BRANCH, branchAreas, branchDay, branchExpectedLoss } from '../branch';
import { profitOf } from '../profit';
import { TIERS } from '../growth';
import { CHECKOUT } from '../checkout';
import { rentForDay } from '../effects';
import { restockCost } from '../night';
import { billsForDay, wagesForDay } from '../staff';
import { crewTips, planNight, PLAN_PRIORITY } from './planner';
import type { Advice } from './planner';
import { GEAR, WANDS, type GearId } from '../../data/gear';
import { stationsFromSlots } from '../slots';
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

const round2 = (n: number) => Math.round(n * 100) / 100;
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
    const t = equipped(['c1', 'e1'], {}, 400); // c2 trades c1 in
    const ad = gearAd(t)[0];
    expect(ad?.id).toBe('gear:c2');
    expect(ad?.text).toContain('back on');
    expect(gearAd(equipped(['c1', 'e1', 'c2'], {}, 400)).map((a) => a.id)).toEqual(['gear:g1']);
    // FB2 C9: the Sylvia comes with its little wand (milk drinks need it), E1 traded in
    const e3 = gearAd(equipped(['c2', 'e1', 'g1'], {}, 400))[0]!;
    expect(e3).toMatchObject({ id: 'gear:e3', input: { kind: 'gear', action: 'buy', gear: 'e3', wand: 'weak' } });
    expect(e3.text).toContain('$175');
  });

  it('is silent in a classic run, and while a crew vote is open, and when it cannot pay', () => {
    expect(planNight(classicRun()).some((a) => a.input.kind === 'gear')).toBe(false);
    const open = equipped(['c1', 'e1'], {}, 400);
    open.gearVote = { by: 'p1', byName: 'K', action: 'buy', gear: 'c2', amount: 25, yes: ['p1'], no: [] };
    expect(gearAd(open)).toEqual([]);
    const poor = equipped(['c1', 'e1'], {}, 5);
    expect(gearAd(poor)).toEqual([]);
  });

  it('never trades the E1 pods for E2+ while no grinder is in a slot (a full stand)', () => {
    // [e1, c5, d1, b0]: no free slot for a grinder, no grinder: the E3 trade-in would be the next buy
    const s = equipped(['e1', 'c5', 'd1'], {}, 5000);
    expect(s.stations.some((x) => x.kind === 'grinder')).toBe(false);
    expect(s.slots!.every((x) => x !== null)).toBe(true);
    expect(planNight(s).filter((a) => a.input.kind === 'gear' && a.input.action === 'buy' && ['e2', 'e3', 'e4', 'e5', 'e6'].includes(a.input.gear))).toEqual([]);
    // with a grinder in a slot the trade is fine
    const g = equipped(['e1', 'c5', 'g1'], {}, 5000);
    expect(gearAd(g).map((a) => a.id)).toEqual(['gear:e3']);
  });

  it('prefers the polished C5 when yesterday’s cups averaged under 3★ and it is affordable', () => {
    const base = () => equipped(['e1', 'c4', 'g1'], {}, 300); // C5 in reach, the polished E5 (FB2 C9) not
    expect(gearAd(withYesterday(base(), 20, 40)).map((a) => a.id)).toEqual(['gear:c5']); // 2.0★
    const text = gearAd(withYesterday(base(), 20, 40))[0]!.text;
    expect(text).toContain('2.0★');
    expect(gearAd(withYesterday(base(), 20, 60)).map((a) => a.id)).toEqual(['gear:e3']); // a perfect 3.0★
    expect(gearAd(base()).map((a) => a.id)).toEqual(['gear:e3']); // no day on the books
    expect(gearAd(withYesterday(base(), 0, 0)).map((a) => a.id)).toEqual(['gear:e3']); // no cup scored
    // too dear: falls back to the normal path rather than waiting for it (an E3 that has its wand: the grinder is next)
    const poor = withYesterday(equipped(['c4', 'g1', 'e3'], {}, 85), 20, 40);
    poor.slotWand = [null, null, 'weak', null];
    poor.stations = stationsFromSlots(poor.tier, poor.slots!, poor.slotGear, poor.slotWand);
    poor.checkout = { owned: ['register', 'kiosk', 'squarely'], active: 'squarely', since: 1, by: 'K' }; // nothing else asks for the till
    expect(gearAd(poor).map((a) => a.id)).toEqual(['gear:g2']);
  });

  it('draws on the shared budget with the restock first, and never overdraws after bills', () => {
    for (const cash of [0, 20, 60, 90, 140, 200, 400, 1000]) {
      const s = equipped(['c1', 'e1'], { bots: 2 }, cash);
      s.supplies = { ...FULL, beans: 0 };
      const plan = planNight(s);
      const total = plan.reduce((n, a) => {
        if (a.input.kind === 'restock') return n + restockCost(s, a.input.supply, a.input.packs);
        if (a.input.kind === 'gear' && a.input.action === 'buy') return n + GEAR[a.input.gear].price + (a.input.wand ? WANDS[a.input.wand].withMachine : 0);
        return n;
      }, 0);
      expect(total).toBeLessThanOrEqual(Math.max(0, cash - billsForDay(s)) + 1e-9);
    }
  });

  it('says a co-op buy needs a crew vote when two humans are connected and it costs $50 or more', () => {
    const s = equipped(['e1', 'c4', 'g1'], {}, 300);
    s.players.push({ ...s.players[0]!, id: 'p2', name: 'L' });
    const ad = gearAd(withYesterday(s, 20, 40))[0]!;
    expect(ad.id).toBe('gear:c5');
    expect(ad.text).toContain('vote');
    const solo = gearAd(withYesterday(equipped(['e1', 'c4', 'g1'], {}, 300), 20, 40))[0]!;
    expect(solo.text).not.toContain('vote');
  });
});

describe('item 4: let a barista go when the wages beat what the crew adds', () => {
  const staffAd = (s: GameState) => planNight(s).filter((a) => a.input.kind === 'staff');
  const afterDay = (bots: number, wages: number, botTakings: number | null): GameState => {
    const s = gearRun({ bots });
    s.cash = 300;
    s.supplies = { ...FULL };
    s.days.push(dayStats({
      wages,
      ...(botTakings === null ? {} : { byPlayer: { p1: { serves: 12, takings: 30 }, 'bot-1': { serves: 1, takings: botTakings / 2 }, 'bot-2': { serves: 1, takings: botTakings / 2 } } }),
    }));
    return s;
  };

  it('suggests letting the newest one go, naming them, when yesterday’s wages beat the bots’ takings', () => {
    const s = afterDay(2, 2, 1.5);
    expect(wagesForDay(s)).toBe(2);
    const [a, ...rest] = staffAd(s);
    expect(rest).toEqual([]);
    expect(a).toMatchObject({ id: 'staff:fire', input: { kind: 'staff', action: 'fire' }, priority: PLAN_PRIORITY.staff });
    expect(a!.text).toContain('Lu costs more than they bring in at the stand');
  });

  it('is quiet when the bots earned their keep, with no bots, with no tally, or with no wages', () => {
    expect(staffAd(afterDay(2, 2, 2))).toEqual([]);
    expect(staffAd(afterDay(2, 2, 40))).toEqual([]);
    expect(staffAd(afterDay(0, 0, 0))).toEqual([]);
    expect(staffAd(afterDay(2, 2, null))).toEqual([]);
    expect(staffAd(afterDay(2, 0, 0))).toEqual([]);
  });

  it('stops once someone has been let go tonight, and never suggests hiring', () => {
    let s = afterDay(2, 2, 0);
    expect(staffAd(s)).toHaveLength(1);
    s = step(s, [{ kind: 'staff', playerId: 'p1', action: 'fire' }]);
    expect(staffAd(s)).toEqual([]);
    for (const x of [afterDay(2, 2, 0), afterDay(1, 1, 5), afterDay(0, 0, 0), s]) {
      expect(planNight(x).some((a) => a.input.kind === 'staff' && a.input.action === 'hire')).toBe(false);
    }
  });
});

/** The cost of a day's restock at today's prices (what the planner calls "a day's restock"). */
function dayRestock(s: GameState): number {
  const use = expectedUse(s);
  return (['beans', 'milk', 'concentrate', 'flavour'] as const).reduce((n, sup) => {
    if (!menuDrinks(s).some((d) => ECONOMY.drinkSupplies[d].includes(sup))) return n;
    return n + restockCost(s, sup, Math.ceil(use[sup] / ECONOMY.packs[sup].size));
  }, 0);
}

describe('item 5a: match the rival’s happy hour', () => {
  const promoNight = (): GameState => {
    const s = equipped(['c1', 'e1'], {}, 200);
    const day = [8, 9, 10, 11, 12, 13, 14].find((d) => isPromoDay(s, d))!;
    s.day = day;
    expect(isPromoDay(s)).toBe(true);
    return s;
  };
  const ad = (s: GameState) => planNight(s).find((a) => a.input.kind === 'rivalCounter');

  it('on a promo night that is not matched: Match Starbuck$’s happy hour, priority 75', () => {
    const a = ad(promoNight())!;
    expect(a).toMatchObject({ kind: 'rival', text: `Match ${RIVAL.name}'s happy hour`, input: { kind: 'rivalCounter' }, priority: PLAN_PRIORITY.rivalCounter });
    expect(PLAN_PRIORITY.rivalCounter).toBe(75);
  });

  it('quiet once matched, on a normal night, and in week 1', () => {
    const s = promoNight();
    s.rival = { counter: s.day } as GameState['rival'];
    expect(countered(s)).toBe(true);
    expect(ad(s)).toBeUndefined();
    const n = promoNight();
    n.day -= 1;
    while (isPromoDay(n)) n.day -= 1;
    expect(ad(n)).toBeUndefined();
    n.day = 3;
    expect(ad(n)).toBeUndefined();
  });

  it('applying the advice (as a human would) turns it off', () => {
    let s = promoNight();
    s = step(s, [{ kind: 'rivalCounter', playerId: 'p1' }]);
    expect(countered(s)).toBe(true);
    expect(ad(s)).toBeUndefined();
  });
});

describe('item 5b: the stamp card against the loyalty card', () => {
  const night = (cash: number, day = RIVAL.loyaltyDay): GameState => {
    const s = equipped(['c1', 'e1'], {}, cash);
    s.day = day;
    return s;
  };
  const ad = (s: GameState) => planNight(s).find((a) => a.input.kind === 'stampCard');

  it('suggests the card when cash covers bills, $30 and a day’s restock; priority 45', () => {
    const probe = night(0);
    const need = round2(billsForDay(probe) + RIVAL.stampCost + dayRestock(probe));
    expect(ad(night(need))).toMatchObject({ kind: 'rival', priority: PLAN_PRIORITY.stampCard, input: { kind: 'stampCard' } });
    expect(PLAN_PRIORITY.stampCard).toBe(45);
    expect(ad(night(round2(need - 0.5)))).toBeUndefined();
  });

  it('only while the rival’s card is live and ours is not out', () => {
    expect(ad(night(500, RIVAL.loyaltyDay - 1))).toBeUndefined();
    expect(ad(night(500, RIVAL.loyaltyDay))).toBeDefined();
    expect(ad(night(500, RIVAL.loyaltyDay + 3))).toBeDefined();
    const s = night(500);
    s.rival = { stamps: s.day } as GameState['rival'];
    expect(ad(s)).toBeUndefined();
    const b = step(night(500), [{ kind: 'stampCard', playerId: 'p1' }]);
    expect(hasStamps(b)).toBe(true);
    expect(ad(b)).toBeUndefined();
  });
});

describe('item 5c: the second shop', () => {
  const cafe = (cash: number): GameState => {
    const s = equipped(['c1', 'e1'], { tier: 'cafe' }, cash);
    s.tier = 'cafe'; // createRun leaves a café start's tier unset; growing sets it
    s.days.push(dayStats({ sales: 100, tips: 10, rent: 25 }));
    s.checkout = { owned: ['register', 'kiosk', 'squarely'], active: 'squarely', since: 1, by: 'K' }; // nothing else asks for the till
    return s;
  };
  const open = (s: GameState) => planNight(s).find((a) => a.input.kind === 'branch' && a.input.action === 'open');
  const needed = (s: GameState) => round2(billsForDay(s) + BRANCH.cost + dayRestock(s));
  const withBranch = (staff: number, last: Partial<NonNullable<DayStats['branch']>>): GameState => {
    const s = cafe(1000);
    s.branch = { area: 'tourist', staff, openedDay: 1, spent: BRANCH.cost, by: 'K' };
    s.days[0]!.branch = { served: 12, walked: 0, takings: 60, costs: 50, profit: 10, ...last };
    return s;
  };
  const staffAd = (s: GameState) => planNight(s).find((a) => a.input.kind === 'branch' && a.input.action === 'staff');

  it('opens at the café with a cushion after a profitable day, in the area whose estimate is best; priority 65', () => {
    const s = cafe(needed(cafe(0)));
    const a = open(s)!;
    expect(a).toMatchObject({ kind: 'grow', id: 'branch:open', priority: PLAN_PRIORITY.branchOpen, input: { kind: 'branch', action: 'open', area: 'tourist' } });
    expect(PLAN_PRIORITY.branchOpen).toBe(65);
    // the estimate it used is the sim's own
    const probe = { ...s, branch: { area: 'tourist' as const, staff: BRANCH.staff.start, openedDay: s.day, spent: BRANCH.cost, by: 'x' } };
    for (const other of branchAreas(s)) {
      const p = { ...probe, branch: { ...probe.branch, area: other } };
      expect(branchDay(p)!.profit).toBeLessThanOrEqual(branchDay(probe)!.profit);
    }
  });

  it('waits without the cushion, off the café tier, after a losing day, on opening night, or once open', () => {
    expect(open(cafe(round2(needed(cafe(0)) - 1)))).toBeUndefined();
    const cart = cafe(1000);
    cart.tier = 'cart';
    expect(open(cart)).toBeUndefined();
    const loss = cafe(1000);
    loss.days[0] = dayStats({ sales: 10, tips: 0, rent: 25 });
    expect(profitOf(loss.days[0]!)).toBeLessThan(0);
    expect(open(loss)).toBeUndefined();
    const first = cafe(1000);
    first.days = [];
    expect(open(first)).toBeUndefined();
    expect(open(withBranch(2, {}))).toBeUndefined();
  });

  it('adds a barista when yesterday walked people out and the sim’s estimate says it pays; priority 52', () => {
    const s = withBranch(1, { walked: 13, served: 12 });
    const a = staffAd(s)!;
    expect(a).toMatchObject({ kind: 'grow', id: 'branch:staff', priority: PLAN_PRIORITY.branchStaff, input: { kind: 'branch', action: 'staff', staff: 2 } });
    expect(PLAN_PRIORITY.branchStaff).toBe(52);
    expect(staffAd(withBranch(3, { walked: 13 }))).toBeUndefined(); // at the cap
    expect(staffAd(withBranch(2, { walked: 0 }))).toBeUndefined();
  });

  it('cuts one after a loss with nobody walked out, when the estimate says it helps', () => {
    const s = withBranch(3, { walked: 0, profit: -6 });
    s.branch!.area = 'drizzleton';
    expect(staffAd(s)?.input).toEqual({ kind: 'branch', action: 'staff', staff: 2 });
    expect(staffAd(withBranch(1, { walked: 0, profit: -6 }))).toBeUndefined(); // already at the minimum
    expect(staffAd(withBranch(3, { walked: 0, profit: 4 }))).toBeUndefined(); // not a loss
  });
});

describe('item 5d: send surplus stock to the branch', () => {
  const sendAd = (s: GameState) => planNight(s).filter((a) => a.input.kind === 'branch' && a.input.action === 'send');
  const managed = (beans: number, milk: number): GameState => {
    const s = equipped(['c1', 'e1'], { tier: 'cafe' }, 1000);
    s.branch = { area: 'tourist', staff: 2, openedDay: 1, spent: BRANCH.cost, by: 'K' };
    s.players[0]!.role = 'manager';
    s.supplies = { ...FULL, beans, milk };
    return s;
  };

  it('beans or milk beyond tomorrow’s use plus two packs, Manager mode only; priority 48', () => {
    const base = managed(0, 0);
    const use = expectedUse(base);
    const pack = (k: 'beans' | 'milk') => ECONOMY.packs[k].size;
    const s = managed(use.beans + 2 * pack('beans') + 1, use.milk + 2 * pack('milk'));
    const ads = sendAd(s);
    expect(ads.map((a) => a.input)).toEqual([{ kind: 'branch', action: 'send', supply: 'beans' }]);
    expect(ads[0]).toMatchObject({ id: 'branch:send:beans', priority: PLAN_PRIORITY.branchSend });
    expect(PLAN_PRIORITY.branchSend).toBe(48);
    const both = managed(use.beans + 3 * pack('beans'), use.milk + 3 * pack('milk'));
    expect(sendAd(both).map((a) => a.id)).toEqual(['branch:send:beans', 'branch:send:milk']);
    expect(sendAd(managed(use.beans + 2 * pack('beans'), 0))).toEqual([]);
  });

  it('quiet without a branch or a Manager, or when the credit already covers the branch’s cups', () => {
    const s = managed(900, 900);
    expect(sendAd(s)).toHaveLength(2);
    delete s.players[0]!.role;
    expect(sendAd(s)).toEqual([]);
    const n = managed(900, 900);
    delete n.branch;
    expect(sendAd(n)).toEqual([]);
    const c = managed(900, 900);
    c.branch!.stockCredit = 500;
    expect(sendAd(c)).toEqual([]);
  });

  it('applying it moves a pack and the advice follows the stock down', () => {
    let s = managed(60, 0);
    s.supplies.beans = expectedUse(s).beans + 2 * ECONOMY.packs.beans.size + 1;
    expect(sendAd(s)).toHaveLength(1);
    s = step(s, [{ kind: 'branch', playerId: 'p1', action: 'send', supply: 'beans' }]);
    expect(sendAd(s)).toEqual([]);
  });
});

describe('item 6: sorted and pure with every new kind in play', () => {
  const rich = (withBranch: boolean): GameState => {
    const s = equipped(['c1', 'e1', 'g1'], { tier: 'cafe', bots: 2 }, 3000);
    s.tier = 'cafe';
    const day = [15, 16, 17, 18, 19, 20, 21].find((d) => isPromoDay(s, d))!;
    s.day = day;
    s.checkout = { owned: ['register', 'kiosk', 'squarely'], active: 'squarely', since: 1, by: 'K' };
    s.days.push(dayStats({ sales: 100, tips: 10, wages: 10, cups: 20, cupStars: 40, byPlayer: { p1: { serves: 20, takings: 100 } }, ...(withBranch ? { branch: { served: 12, walked: 9, takings: 60, costs: 50, profit: 10 } } : {}) }));
    s.supplies = { ...FULL, beans: 900, milk: 900 };
    if (withBranch) {
      s.branch = { area: 'tourist', staff: 1, openedDay: 1, spent: BRANCH.cost, by: 'K' };
      s.players[0]!.role = 'manager';
    }
    return s;
  };

  it('covers the new kinds in one plan, sorted by priority then id', () => {
    const closed = planNight(rich(false)).map((a) => a.id);
    for (const id of ['rival:promo', 'rival:loyalty', 'branch:open', 'staff:fire']) expect(closed).toContain(id);
    expect(closed.some((id) => id.startsWith('gear:'))).toBe(true);
    const open = planNight(rich(true)).map((a) => a.id);
    for (const id of ['branch:staff', 'branch:send:beans', 'branch:send:milk']) expect(open).toContain(id);
    for (const s of [rich(false), rich(true)]) {
      const plan = planNight(s);
      for (let i = 1; i < plan.length; i++) {
        const [a, b] = [plan[i - 1]!, plan[i]!];
        expect(a.priority > b.priority || (a.priority === b.priority && a.id < b.id)).toBe(true);
      }
    }
  });

  it('is pure and deterministic: the state is deep-equal before and after, and a clone plans the same', () => {
    for (const s of [rich(false), rich(true), gearRun(), classicRun(2)]) {
      const before = structuredClone(s);
      const a = planNight(s);
      crewTips(s, 4);
      expect(s).toEqual(before);
      expect(planNight(structuredClone(before))).toEqual(a);
    }
  });

  it('total spending advice (restock, grow, branch, checkout, gear, stamp, equip, scout) stays within cash after bills', () => {
    for (const cash of [0, 40, 120, 250, 330, 500, 900, 3000]) {
      for (const withBranch of [false, true]) {
        const s = rich(withBranch);
        s.cash = cash;
        const total = planNight(s).reduce((n, a) => {
          const i = a.input;
          if (i.kind === 'restock') return n + restockCost(s, i.supply, i.packs);
          if (i.kind === 'gear' && i.action === 'buy') return n + GEAR[i.gear].price - 0; // trade-ins only lower it
          if (i.kind === 'branch' && i.action === 'open') return n + BRANCH.cost;
          if (i.kind === 'stampCard') return n + RIVAL.stampCost;
          if (i.kind === 'grow') return n + TIERS[i.tier].cost;
          if (i.kind === 'checkout') return n + CHECKOUT[i.checkout].cost;
          if (i.kind === 'scout') return n + RIVAL.scoutCost;
          return n;
        }, 0);
        expect(total).toBeLessThanOrEqual(Math.max(0, cash - billsForDay(s)) + 1e-9 + 0);
      }
    }
  });
});

describe('review M4: the planner holds back a losing branch\'s expected loss', () => {
  const restockSpend = (s: GameState) => planNight(s).reduce((n, x) => n + (x.input.kind === 'restock' ? restockCost(s, x.input.supply, x.input.packs) : 0), 0);
  const build = (losing: boolean): GameState => {
    const s = equipped(['e1'], { tier: 'stand' });
    s.reputation = 0;
    s.settings = { ...s.settings, dayLengthSec: 600 };
    s.supplies = { ...FULL, beans: 0, milk: 0 };
    s.branch = losing
      ? { area: 'campus', staff: 3, openedDay: 1, spent: BRANCH.cost, by: 'K' }
      : { area: 'tourist', staff: 1, openedDay: 1, spent: BRANCH.cost, by: 'K' };
    return s;
  };

  it('spends less when the branch will lose money, never more than cash after bills and the loss', () => {
    const lose = build(true);
    const loss = branchExpectedLoss(lose);
    expect(loss).toBeGreaterThan(0);
    const bare = { ...lose, branch: undefined } as GameState;
    for (const cash of [billsForDay(lose) + 12, billsForDay(lose) + 40, billsForDay(lose) + 80, billsForDay(lose) + loss + 40]) {
      lose.cash = cash;
      bare.cash = cash;
      expect(restockSpend(lose)).toBeLessThanOrEqual(Math.max(0, cash - billsForDay(lose) - loss) + 1e-9);
      expect(restockSpend(lose)).toBeLessThanOrEqual(restockSpend(bare));
    }
    lose.cash = billsForDay(lose) + restockCost(lose, 'beans', 1);
    bare.cash = lose.cash;
    expect(find(bare, 'restock:beans')).toBeDefined();
    expect(find(lose, 'restock:beans')).toBeUndefined();
    lose.cash = round2(billsForDay(lose) + loss + restockCost(lose, 'beans', 1));
    expect(find(lose, 'restock:beans')).toBeDefined();
  });

  it('a profitable or absent branch changes nothing', () => {
    const win = build(false);
    expect(branchExpectedLoss(win)).toBe(0);
    const bare = { ...win, branch: undefined } as GameState;
    for (const cash of [0, 30, 80, 200, 600]) {
      win.cash = cash;
      bare.cash = cash;
      expect(restockSpend(win)).toBe(restockSpend(bare));
    }
  });
});
