import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../data/economy';
import { createRun } from './run';
import { step } from './step';
import { finishDay } from './closing';
import { validateInput } from './validate';
import { profitOf } from './profit';
import { computeModifiers } from './effects';
import { forecastIsRough } from './forecast';
import { priceForecast } from './pricing';
import { menuDrinks } from './unlocks';
import { syncBots } from './bots/roster';
import { crewTips } from './bots/planner';
import { wagesForDay, wageEach, billsForDay } from './staff';
import { HIRE_WAGE, MARKETER_TRAFFIC, hasMarketer, hasStrategist, hireWagesForDay } from './hires';
import { bestStep } from './strategist';
import type { GameState, PlayerInput } from './types';

/** A Gear stand with a cold brew sock and a pod machine (a menu to forecast: a fresh Gear run has none). */
const gearRun = (players = 1): GameState => {
  let s = createRun({
    seed: 7, hostId: 'p1', players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` })),
    settings: { dayLengthSec: 150, nightLengthSec: 30 }, tier: 'stand', gear: true,
  });
  const cash = s.cash;
  s.cash = 300;
  for (const g of ['c1', 'e1'] as const) s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: g }]);
  s.cash = cash;
  return s;
};
const hireRole = (s: GameState, role: 'strategist' | 'marketer', by = 'p1'): GameState => step(s, [{ kind: 'staff', playerId: by, action: 'hire', role }]);
const fireRole = (s: GameState, role: 'strategist' | 'marketer', by = 'p1'): GameState => step(s, [{ kind: 'staff', playerId: by, action: 'fire', role }]);
const honest = (s: GameState) => {
  const m = computeModifiers(s);
  const menu = menuDrinks(s);
  const walkIns = ECONOMY.baseArrivalsPerSecond * s.settings.dayLengthSec * m.traffic;
  return { m, menu, walkIns };
};
const totalProfit = (s: GameState): number => {
  const { m, menu, walkIns } = honest(s);
  return priceForecast(s, menu, m, walkIns, true).reduce((a, l) => a + l.profit, 0);
};

describe('Round 3 item 3: Strategist and Marketer hires', () => {
  it('without a strategist the night forecast is a rough guess: rounded to 5 and skewed up to 25%', () => {
    const s = gearRun();
    expect(forecastIsRough(s)).toBe(true);
    const { m, menu, walkIns } = honest(s);
    const rough = priceForecast(s, menu, m, walkIns);
    const exact = priceForecast(s, menu, m, walkIns, true);
    expect(rough.length).toBe(exact.length);
    let moved = false;
    rough.forEach((l, i) => {
      expect(l.rough).toBe(true);
      expect(exact[i].rough).toBeFalsy();
      expect(l.orders % 5).toBe(0);
      expect(Math.abs(l.profit % 5)).toBe(0);
      expect(Math.abs(l.orders - exact[i].orders)).toBeLessThanOrEqual(exact[i].orders * 0.25 + 2.5 + 1e-9);
      if (l.orders !== exact[i].orders) moved = true;
    });
    expect(moved).toBe(true);
  });

  it('the rough guess is deterministic (seed and day, no rng draw)', () => {
    const s = gearRun();
    const { m, menu, walkIns } = honest(s);
    const rng = structuredClone(s.rng);
    const a = priceForecast(s, menu, m, walkIns);
    const b = priceForecast(structuredClone(s), menu, m, walkIns);
    expect(b).toEqual(a);
    expect(s.rng).toEqual(rng);
    const other = structuredClone(s);
    other.day += 1;
    const days = [s, other, ...[2, 3, 4].map((d) => ({ ...structuredClone(s), day: s.day + d }))];
    const skews = days.map((d) => priceForecast(d, menu, m, walkIns).map((l) => l.orders / Math.max(1, priceForecast(d, menu, m, walkIns, true).find((x) => x.drink === l.drink)!.orders)).join());
    expect(new Set(skews).size).toBeGreaterThan(1);
  });

  it('with a strategist the forecast is the honest one', () => {
    const s = hireRole(gearRun(), 'strategist');
    expect(hasStrategist(s)).toBe(true);
    expect(forecastIsRough(s)).toBe(false);
    const { m, menu, walkIns } = honest(s);
    const shown = priceForecast(s, menu, m, walkIns);
    expect(shown).toEqual(priceForecast(s, menu, m, walkIns, true));
    expect(shown.every((l) => !l.rough)).toBe(true);
  });

  it('classic runs keep the honest forecast', () => {
    const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'P1' }], settings: { dayLengthSec: 150, nightLengthSec: 30 }, tier: 'stand' });
    expect(forecastIsRough(s)).toBe(false);
  });

  it('hiring is Gear, night, people only, once per role; it costs nothing up front', () => {
    const base = gearRun();
    const cash = base.cash;
    let s = hireRole(structuredClone(base), 'strategist');
    expect(s.staff).toEqual({ strategist: true });
    expect(s.cash).toBe(cash);
    s = hireRole(s, 'marketer');
    expect(s.staff).toEqual({ strategist: true, marketer: true });
    s = hireRole(s, 'marketer');
    expect(s.staff).toEqual({ strategist: true, marketer: true });
    expect(hireRole(structuredClone(base), 'marketer', 'bot-1').staff).toBeUndefined();
    expect(hireRole(structuredClone(base), 'marketer', 'nobody').staff).toBeUndefined();
    const day = structuredClone(base);
    day.phase = 'day';
    expect(hireRole(day, 'marketer').staff).toBeUndefined();
    const classic = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'P1' }], settings: { dayLengthSec: 150, nightLengthSec: 30 }, tier: 'stand' });
    expect(hireRole(classic, 'marketer').staff).toBeUndefined();
  });

  it('a role-less staff input is still the barista hire', () => {
    const s = step(gearRun(), [{ kind: 'staff', playerId: 'p1', action: 'hire' }]);
    expect(s.staff).toBeUndefined();
    expect(s.settings.bots).toBe(3);
  });

  it('validateInput keeps the role and drops junk', () => {
    expect(validateInput({ kind: 'staff', playerId: 'p1', action: 'hire', role: 'strategist' })).toEqual({ kind: 'staff', playerId: 'p1', action: 'hire', role: 'strategist' });
    expect(validateInput({ kind: 'staff', playerId: 'p1', action: 'fire', role: 'marketer' })).toEqual({ kind: 'staff', playerId: 'p1', action: 'fire', role: 'marketer' });
    expect(validateInput({ kind: 'staff', playerId: 'p1', action: 'hire' })).toEqual({ kind: 'staff', playerId: 'p1', action: 'hire' });
    expect(validateInput({ kind: 'staff', playerId: 'p1', action: 'hire', role: 'janitor' } as unknown as PlayerInput)).toBeNull();
    expect(validateInput({ kind: 'staff', playerId: 'p1', action: 'hire', role: 3 } as unknown as PlayerInput)).toBeNull();
  });

  it('the strategist sets peak prices the moment they are hired and at each night start', () => {
    let s = gearRun();
    expect(s.priceSteps).toBeUndefined();
    const before = totalProfit(s);
    s = hireRole(s, 'strategist');
    const { menu } = honest(s);
    expect(menu.length).toBeGreaterThan(0);
    expect(s.priceSteps).toBeDefined();
    for (const d of menu) expect(s.priceSteps?.[d] ?? 0).toBe(bestStep(s, menu, d));
    expect(totalProfit(s)).toBeGreaterThanOrEqual(before);
    expect(s.log.some((e) => e.kind === 'strategist.set')).toBe(true);
    // next night: reset to the peak for the new crowd, whatever the crew did by hand
    s.priceSteps = { ...(s.priceSteps ?? {}), [menu[0]]: 7 };
    syncBots(s);
    s.challenges = [];
    s.phase = 'closing';
    s.cash = 500;
    const next = finishDay(s);
    expect(next.phase).toBe('night');
    const m2 = menuDrinks(next);
    for (const d of m2) expect(next.priceSteps?.[d] ?? 0).toBe(bestStep(next, m2, d));
  });

  it('manual pricing overrides the strategist until the next night', () => {
    let s = hireRole(gearRun(), 'strategist');
    const d = menuDrinks(s)[0];
    const cur = s.priceSteps?.[d] ?? 0;
    const want = cur === -1 ? 1 : -1;
    s = step(s, [{ kind: 'price', playerId: 'p1', drink: d, step: want }]);
    expect(s.priceSteps?.[d]).toBe(want);
    s = step(s, [{ kind: 'ready', playerId: 'p1' }]);
    expect(s.priceSteps?.[d]).toBe(want);
  });

  it('without a strategist nobody touches the prices at night start', () => {
    const s = gearRun();
    s.priceSteps = { latte: 2 };
    syncBots(s);
    s.challenges = [];
    s.phase = 'closing';
    s.cash = 500;
    expect(finishDay(s).priceSteps).toEqual({ latte: 2 });
  });

  it('the marketer brings +15% traffic at current prices; both stack with the rest', () => {
    const s = gearRun();
    const t0 = computeModifiers(s).traffic;
    expect(MARKETER_TRAFFIC).toBe(1.15);
    const m = hireRole(structuredClone(s), 'marketer');
    expect(hasMarketer(m)).toBe(true);
    expect(computeModifiers(m).traffic).toBeCloseTo(t0 * MARKETER_TRAFFIC, 10);
    const both = hireRole(m, 'strategist');
    expect(computeModifiers(both).traffic).toBeCloseTo(t0 * MARKETER_TRAFFIC, 10);
    expect(hasStrategist(both) && hasMarketer(both)).toBe(true);
    // it is a modifier on traffic only: prices are not touched by the marketer
    expect(computeModifiers(m).price).toEqual(computeModifiers(s).price);
  });

  it('wages: $1 a day for the strategist, $2 for the marketer, paid at closing with the crew', () => {
    const s = hireRole(hireRole(gearRun(), 'strategist'), 'marketer');
    expect(hireWagesForDay(s)).toBe(HIRE_WAGE.strategist + HIRE_WAGE.marketer);
    const crew = 2 * wageEach(s);
    expect(wagesForDay(s)).toBe(crew + 3);
    expect(billsForDay(s)).toBeGreaterThan(crew + 3);
    syncBots(s);
    s.challenges = [];
    s.phase = 'closing';
    s.cash = 100;
    const rent = billsForDay(s) - wagesForDay(s);
    const after = finishDay(s);
    const d = after.days.at(-1)!;
    expect(d.wages).toBe(crew + 3);
    expect(d.hireWages).toBe(3);
    expect(after.cash).toBe(Math.round((100 - rent - crew - 3) * 100) / 100);
    expect(profitOf(d)).toBe(Math.round((d.sales + d.tips - rent - d.wages!) * 100) / 100);
  });

  it('wages are paid by the hour like the crew', () => {
    const s = hireRole(gearRun(), 'marketer');
    s.settings.dayLengthSec = 75;
    expect(hireWagesForDay(s)).toBe(1);
  });

  it('firing stops both: no wage, no traffic, no price-setting, rough forecast again', () => {
    let s = hireRole(hireRole(gearRun(), 'strategist'), 'marketer');
    const t = computeModifiers(s).traffic;
    s = fireRole(s, 'marketer');
    expect(s.staff).toEqual({ strategist: true });
    expect(computeModifiers(s).traffic).toBeCloseTo(t / MARKETER_TRAFFIC, 10);
    expect(hireWagesForDay(s)).toBe(HIRE_WAGE.strategist);
    s = fireRole(s, 'strategist');
    expect(s.staff).toBeUndefined();
    expect(hireWagesForDay(s)).toBe(0);
    expect(forecastIsRough(s)).toBe(true);
    s.priceSteps = { latte: 2 };
    syncBots(s);
    s.challenges = [];
    s.phase = 'closing';
    s.cash = 500;
    const after = finishDay(s);
    expect(after.priceSteps).toEqual({ latte: 2 });
    expect(after.days.at(-1)!.hireWages).toBeUndefined();
    // firing someone not hired is a no-op
    expect(fireRole(gearRun(), 'marketer').staff).toBeUndefined();
  });

  it('the planner may advise hiring when it pays (reusing the equip kind)', () => {
    const s = gearRun();
    s.cash = 500;
    const tips = crewTips(s, 40);
    const ids = tips.map((t) => t.id);
    expect(ids).toContain('staff:hire:marketer');
    const t = tips.find((x) => x.id === 'staff:hire:marketer')!;
    expect(t.kind).toBe('equip');
    expect(t.input).toEqual({ kind: 'staff', action: 'hire', role: 'marketer' });
    // once hired, the advice is gone
    const hired = hireRole(structuredClone(s), 'marketer');
    expect(crewTips(hired, 40).map((x) => x.id)).not.toContain('staff:hire:marketer');
    // never when the till cannot carry the wages
    const poor = structuredClone(s);
    poor.cash = 1;
    expect(crewTips(poor, 40).map((x) => x.id)).not.toContain('staff:hire:marketer');
  });
});
