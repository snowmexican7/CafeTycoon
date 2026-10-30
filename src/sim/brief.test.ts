import { describe, expect, it } from 'vitest';
import { createRun } from './run';
import { dayClock, expectedUse, nightBrief, runOutFraction } from './brief';
import { profitOf } from './profit';
import { restockCost } from './night';
import { nextCheckout } from './checkout';
import { ECONOMY } from '../data/economy';
import { BRANCH, branchDay, branchExpectedLoss } from './branch';
import { billsForDay } from './staff';
import type { DayStats, GameState } from './types';

const run = (): GameState => createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });

const dayStats = (over: Partial<DayStats> = {}): DayStats => ({
  day: 1, served: 23, lost: 2, turnedAway: 0, sales: 40.84, tips: 3, rent: 25, ...over,
});

/** A run on its second night: one finished day on the books. */
const second = (): GameState => {
  const s = run();
  s.day = 2;
  s.days.push(dayStats());
  return s;
};

const find = (s: GameState, id: string) => nightBrief(s).alerts.find((a) => a.id === id);

describe('dayClock', () => {
  it('maps the day onto 8 AM to 6 PM in ten-minute steps', () => {
    expect(dayClock(0)).toBe('8:00 AM');
    expect(dayClock(0.4)).toBe('12:00 PM');
    expect(dayClock(0.5)).toBe('1:00 PM');
    expect(dayClock(0.6)).toBe('2:00 PM');
    expect(dayClock(1)).toBe('6:00 PM');
    expect(dayClock(0.1)).toBe('9:00 AM');
  });

  it('rounds to ten minutes and clamps', () => {
    expect(dayClock(0.2833)).toBe('10:50 AM');
    expect(dayClock(-1)).toBe('8:00 AM');
    expect(dayClock(7)).toBe('6:00 PM');
  });
});

describe('nightBrief headline and profit', () => {
  it('first night: no profit, opening headline, no alerts on a fresh default run', () => {
    const b = nightBrief(run());
    expect(b.profit).toBeNull();
    expect(b.headline).toBe('Opening night: stock up, then open the shop.');
    expect(b.alerts).toEqual([]);
  });

  it('later nights: yesterday profit and the Yesterday headline', () => {
    const s = second();
    const b = nightBrief(s);
    expect(b.profit).toBe(profitOf(s.days[0]));
    expect(b.profit).toBe(18.84);
    expect(b.headline).toBe('Yesterday: +$18.84 from 23 cups, 2 walked out.');
  });

  it('prints a negative profit with a real minus sign', () => {
    const s = second();
    s.days[0] = dayStats({ sales: 20, tips: 1.8, rent: 25, served: 1, lost: 0 });
    expect(nightBrief(s).headline).toBe('Yesterday: −$3.20 from 1 cup, 0 walked out.');
  });

  it('is pure: the same state gives the same brief and the state is untouched', () => {
    const s = second();
    s.cash = 13;
    const before = JSON.stringify(s);
    expect(nightBrief(s)).toEqual(nightBrief(s));
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('nightBrief alerts', () => {
  it('cash: danger when short on rent, warn when thin', () => {
    const s = run();
    s.cash = 13;
    const a = find(s, 'cash:short')!;
    expect(a).toMatchObject({ kind: 'cash', severity: 'danger', text: "You'll be $12 short on rent" });
    s.cash = 40;
    expect(find(s, 'cash:low')).toMatchObject({ kind: 'cash', severity: 'warn', text: 'Only $15 spare after rent' });
    expect(find(s, 'cash:short')).toBeUndefined();
  });

  it('stock: out is a danger with a one-pack restock', () => {
    const s = run();
    s.supplies.milk = 0;
    expect(find(s, 'stock:milk:out')).toMatchObject({
      kind: 'stock', severity: 'danger', fix: { kind: 'restock', supply: 'milk', packs: 1 },
    });
  });

  it('stock: low is a warn naming when it runs out, and the fix covers the day', () => {
    const s = run();
    const use = expectedUse(s);
    s.supplies.beans = Math.ceil(use.beans / 4);
    const a = find(s, 'stock:beans:low')!;
    expect(a.severity).toBe('warn');
    expect(a.text).toContain('runs out around');
    expect(a.text).toMatch(/\d{1,2}:\d0 [AP]M/);
    const fix = a.fix as { kind: 'restock'; supply: string; packs: number };
    expect(fix).toMatchObject({ kind: 'restock', supply: 'beans' });
    expect(s.supplies.beans + fix.packs * ECONOMY.packs.beans.size).toBeGreaterThanOrEqual(use.beans);
    expect(fix.packs).toBeGreaterThanOrEqual(1);
  });

  it('stock: a restock alert stays but drops its fix when the till cannot pay for the packs', () => {
    const s = run();
    s.supplies.milk = 0;
    s.cash = 100;
    expect(find(s, 'stock:milk:out')!.fix).toEqual({ kind: 'restock', supply: 'milk', packs: 1 });
    s.cash = restockCost(s, 'milk', 1) - 0.01;
    expect(find(s, 'stock:milk:out')).toMatchObject({ kind: 'stock', severity: 'danger' });
    expect(find(s, 'stock:milk:out')!.fix).toBeUndefined();
    s.cash = restockCost(s, 'milk', 1);
    expect(find(s, 'stock:milk:out')!.fix).toEqual({ kind: 'restock', supply: 'milk', packs: 1 });
    // Low stock and sold out follow the same rule.
    const low = run();
    low.supplies.beans = Math.ceil(expectedUse(low).beans / 4);
    low.cash = 0.5;
    expect(find(low, 'stock:beans:low')).toBeDefined();
    expect(find(low, 'stock:beans:low')!.fix).toBeUndefined();
  });

  it('stock: run-out fraction is have over expected use, clamped, null when unused', () => {
    const s = run();
    const use = expectedUse(s);
    s.supplies.beans = Math.floor(use.beans / 2);
    expect(runOutFraction(s, 'beans')).toBeCloseTo(s.supplies.beans / use.beans, 6);
    s.supplies.beans = use.beans * 3;
    expect(runOutFraction(s, 'beans')).toBe(1);
    expect(runOutFraction(s, 'pastry')).toBeNull();
  });

  it('stock: only supplies a menu drink needs are considered', () => {
    const s = run();
    for (const d of Object.keys(s.menu) as (keyof typeof s.menu)[]) s.menu[d] = d === 'espresso';
    s.supplies.milk = 0;
    expect(find(s, 'stock:milk:out')).toBeUndefined();
  });

  it('soldOut: warn with the clock and the walkouts, fix restocks the thinnest supply', () => {
    const s = second();
    s.days[0].soldOutWalkouts = 9;
    s.days[0].soldOutAt = 90;
    const a = find(s, 'soldOut')!;
    expect(a).toMatchObject({ kind: 'soldOut', severity: 'warn' });
    expect(a.text).toBe('You sold out at 2:00 PM yesterday and 9 people walked away');
    expect(a.fix).toMatchObject({ kind: 'restock' });
    // One supply drained: the fix names it and buys exactly enough packs to cover the day.
    const use = expectedUse(s);
    for (const k of Object.keys(use) as (keyof typeof use)[]) s.supplies[k] = use[k] * 2;
    s.supplies.milk = 1;
    s.cash = 1000;
    expect(find(s, 'soldOut')!.fix).toEqual({
      kind: 'restock', supply: 'milk', packs: Math.ceil((use.milk - 1) / ECONOMY.packs.milk.size),
    });
    s.days[0].soldOutWalkouts = 1;
    expect(find(s, 'soldOut')!.text).toContain('1 person walked away');
    s.days[0].soldOutWalkouts = 0;
    expect(find(s, 'soldOut')).toBeUndefined();
  });

  it('spoil: info naming what will go off tonight', () => {
    const s = run();
    s.supplies.milk = expectedUse(s).milk + 10;
    const a = find(s, 'spoil')!;
    expect(a).toMatchObject({ kind: 'spoil', severity: 'info' });
    expect(a.text).toBe('About 3 milk will go off tonight');
    s.supplies.pastry = 12;
    expect(find(s, 'spoil')!.text).toBe('About 3 milk and 6 pastries will go off tonight');
  });

  it('grow: info with a grow fix once the next tier is affordable (not on opening night)', () => {
    const s = second();
    s.tier = 'stand';
    s.cash = 200;
    expect(find(s, 'grow')).toMatchObject({
      kind: 'grow', severity: 'info', text: 'You can grow to the cart ($80)', fix: { kind: 'grow', tier: 'cart' },
    });
    s.cash = 79;
    expect(find(s, 'grow')).toBeUndefined();
    const first = run();
    first.tier = 'stand';
    first.cash = 200;
    expect(find(first, 'grow')).toBeUndefined();
  });

  it('checkout: info with a checkout fix once the next one is affordable', () => {
    const s = second();
    s.cash = 100;
    const next = nextCheckout(s)!;
    expect(find(s, 'checkout')).toMatchObject({
      kind: 'checkout', severity: 'info', text: 'You can afford the kiosk ($40)', fix: { kind: 'checkout', checkout: next },
    });
    s.cash = 39;
    expect(find(s, 'checkout')).toBeUndefined();
  });

  it('rival: warn when a live copy undercuts the signature', () => {
    const s = second();
    s.signature = { name: 'Maple Dream', drink: 'latte', twist: 'honey', premium: 2, since: 1 };
    s.rival = { copy: { drink: 'latte', twist: 'honey', since: 1, price: 4.5, day: 2 } };
    const a = find(s, 'rival')!;
    expect(a).toMatchObject({ kind: 'rival', severity: 'warn' });
    expect(a.fix).toBeUndefined();
    expect(a.text).toContain('Starbuck$ sells a knock-off of Maple Dream for $4.50, you charge $5.75');
    s.rival = { copy: { drink: 'latte', twist: 'honey', since: 1, price: 9, day: 2 } };
    expect(find(s, 'rival')).toBeUndefined();
    s.rival = { copy: { drink: 'latte', twist: 'honey', since: 0, price: 4.5, day: 2 } };
    expect(find(s, 'rival')).toBeUndefined();
  });

  it('signature: info when the signature has no premium', () => {
    const s = second();
    s.signature = { name: 'Maple Dream', drink: 'latte', twist: 'honey', premium: 0, since: 1 };
    expect(find(s, 'signature')).toMatchObject({ kind: 'signature', severity: 'info', text: 'Your signature has no premium' });
    s.signature.premium = 1;
    expect(find(s, 'signature')).toBeUndefined();
  });

  it('sorts danger, then warn, then info, keeping the listed order inside a band', () => {
    const s = second();
    s.cash = 13;
    s.supplies.milk = 0;
    s.supplies.beans = 3;
    s.signature = { name: 'Maple Dream', drink: 'latte', twist: 'honey', premium: 0, since: 1 };
    s.days[0].soldOutWalkouts = 4;
    const alerts = nightBrief(s).alerts;
    const rank = { danger: 0, warn: 1, info: 2 } as const;
    expect(alerts.map((a) => rank[a.severity])).toEqual([...alerts.map((a) => rank[a.severity])].sort());
    expect(alerts.map((a) => a.id)).toEqual(['cash:short', 'stock:milk:out', 'stock:beans:low', 'soldOut', 'signature']);
  });
});

describe('nightBrief cash alert counts a losing branch (review M4)', () => {
  const gear = (): GameState => createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, gear: true, tier: 'stand' });
  /** A second shop that expects a loss tomorrow: a dull area, no reputation, long (dear) shifts. */
  const withBranch = (losing: boolean): GameState => {
    const s = gear();
    s.reputation = 0;
    s.settings = { ...s.settings, dayLengthSec: 600 };
    s.branch = losing
      ? { area: 'campus', staff: 3, openedDay: 1, spent: BRANCH.cost, by: 'K' }
      : { area: 'tourist', staff: 1, openedDay: 1, spent: BRANCH.cost, by: 'K' };
    return s;
  };

  it('branchExpectedLoss: 0 with no branch or a profit, else the loss to the cent', () => {
    expect(branchExpectedLoss(gear())).toBe(0);
    const win = withBranch(false);
    expect(branchDay(win)!.profit).toBeGreaterThan(0);
    expect(branchExpectedLoss(win)).toBe(0);
    const lose = withBranch(true);
    expect(branchDay(lose)!.profit).toBeLessThan(0);
    expect(branchExpectedLoss(lose)).toBe(-branchDay(lose)!.profit);
  });

  it('a losing branch fires the cash alert where the bills alone did not, and names the branch', () => {
    const s = withBranch(true);
    const loss = branchExpectedLoss(s);
    const bills = billsForDay(s);
    s.cash = bills + loss - 1;
    expect(find(s, 'cash:short')).toMatchObject({ kind: 'cash', severity: 'danger', text: "You'll be $1 short on rent and the branch" });
    // the same till with no branch is only a thin warning at worst, not a danger
    expect(find({ ...s, branch: undefined } as GameState, 'cash:short')).toBeUndefined();
    s.cash = bills + loss + 1;
    expect(find(s, 'cash:short')).toBeUndefined();
    expect(find(s, 'cash:low')).toMatchObject({ severity: 'warn', text: "Only $1 spare after rent and the branch" });
  });

  it('a profitable or absent branch changes nothing', () => {
    for (const cash of [3, 20, 60]) {
      const none = gear();
      none.cash = cash;
      const win = withBranch(false);
      win.cash = cash;
      const bare = { ...win, branch: undefined } as GameState;
      expect(nightBrief(win).alerts).toEqual(nightBrief(bare).alerts);
    }
  });
});
