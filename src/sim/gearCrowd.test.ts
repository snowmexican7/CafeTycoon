import { describe, it, expect } from 'vitest';
import { createRun } from './run';
import { applyGearInput, areaPatienceMul, areaQualityTip, areaTipMul, gearArea, snobFamilies, snobTip } from './gear';
import { addCustomer, pickRegular, serveCustomer } from './customers';
import { AREAS, SNOB } from '../data/areas';
import { DRINK_IDS } from '../data/drinks';
import { regularsViewModel } from './regulars';
import { ticketTag } from '../ui/live';
import { gearVM } from '../ui/gearVM';
import { gearBoard } from '../ui/night';
import type { AreaId } from '../data/areas';
import type { DrinkId, GameState } from './types';

const run = (gear: boolean, seed = 5): GameState =>
  createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', ...(gear ? { gear: true } : {}) });
/** A Gear run in the given area (scenario for the forced three, else a seed that lands there). */
const inArea = (area: AreaId): GameState => {
  const forced: Partial<Record<AreaId, GameState['scenario']>> = { campus: 'campusTown', drizzleton: 'rainyWeek', tourist: 'touristSeason' };
  if (forced[area]) return { ...run(true), scenario: forced[area]! } as GameState;
  for (let seed = 1; seed < 100; seed++) {
    const s = run(true, seed);
    if (gearArea(s) === area) return s;
  }
  throw new Error(`no seed for ${area}`);
};
const onMenu = (s: GameState, drinks: DrinkId[]) => {
  for (const d of DRINK_IDS) s.menu[d] = drinks.includes(d);
};

describe('G10b: area crowds', () => {
  it('classic runs are untouched: patience, quality and snobs are all neutral', () => {
    const s = run(false);
    expect(areaPatienceMul(s, ['latte', 'espresso'])).toBe(1);
    for (let st = 0; st <= 5; st++) expect(areaQualityTip(s, st)).toBe(1);
    s.slotGear = ['e5', null, null, 'b0'];
    expect(snobFamilies(s)).toEqual([]);
  });

  it('every area has a crowd line', () => {
    for (const a of Object.values(AREAS)) expect(a.crowd.length).toBeGreaterThan(5);
  });

  it('a per-drink rule beats the family: arts loves pour-over (filter is meh), office shrugs at it (filter is loved)', () => {
    const arts = inArea('arts');
    expect(areaTipMul(arts, 'pourOver')).toBeCloseTo(1.2);
    expect(areaTipMul(arts, 'drip')).toBeCloseTo(0.85);
    const office = inArea('office');
    expect(areaTipMul(office, 'pourOver')).toBeCloseTo(0.85);
    expect(areaTipMul(office, 'drip')).toBeCloseTo(1.2);
  });

  it('office and gym crowds are impatient; Drizzleton waits longer for milky drinks only', () => {
    expect(areaPatienceMul(inArea('office'), ['espresso'])).toBeCloseTo(0.85);
    expect(areaPatienceMul(inArea('gym'), ['coldBrew'])).toBeCloseTo(0.85);
    const dz = inArea('drizzleton');
    expect(areaPatienceMul(dz, ['latte'])).toBeCloseTo(1.25);
    expect(areaPatienceMul(dz, ['espresso'])).toBe(1);
    expect(areaPatienceMul(dz, ['espresso', 'cappuccino'])).toBeCloseTo(1.25);
    expect(areaPatienceMul(inArea('arts'), ['latte'])).toBe(1);
  });

  it('arriving office customers get 85% of the patience the same arrival would otherwise have', () => {
    const s = inArea('office');
    s.phase = 'night';
    s.cash = 1000;
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'e1' });
    s.phase = 'day';
    onMenu(s, ['espresso']);
    for (const k of Object.keys(s.supplies)) (s.supplies as Record<string, number>)[k] = 50;
    s.supplies.beans = 50;
    const a = structuredClone(s);
    const b = structuredClone(s);
    const ca = addCustomer(a, 'normal')!;
    AREAS.office.patience = undefined; // same state and RNG, a patient office for comparison
    let cb;
    try {
      cb = addCustomer(b, 'normal')!;
    } finally {
      AREAS.office.patience = 0.85;
    }
    expect(ca.drink).toBe(cb.drink);
    expect(ca.patienceMax).toBeLessThan(cb.patienceMax);
    expect(ca.patienceMax / cb.patienceMax).toBeCloseTo(0.85, 2);
  });

  it('the arts crowd tips by the cup: 3★ ×1.1, 2★ ×1, 0★ ×0.8', () => {
    const arts = inArea('arts');
    expect(areaQualityTip(arts, 3)).toBeCloseTo(1.1);
    expect(areaQualityTip(arts, 2)).toBe(1);
    expect(areaQualityTip(arts, 0)).toBeCloseTo(0.8);
    expect(areaQualityTip(inArea('office'), 3)).toBe(1);
  });
});

describe('G10b: snob regulars', () => {
  it('top-tier gear names the snob families, one per family, at most two', () => {
    const s = run(true);
    expect(snobFamilies(s)).toEqual([]);
    s.slotGear = ['e5', 'e6', 'd5b', 'b0'];
    expect(snobFamilies(s)).toEqual(['espresso', 'filter']);
    s.slotGear = ['e6', 'c5', 'd5b', null];
    expect(snobFamilies(s)).toHaveLength(SNOB.max);
  });

  it('owning top gear makes the next regular a snob who orders the fanciest drink of that family; ordinary names are kept', () => {
    const s = run(true);
    s.phase = 'day';
    s.slotGear = ['e5', null, null, 'b0'];
    onMenu(s, ['espresso', 'americano', 'latte']);
    const menu: DrinkId[] = ['espresso', 'americano', 'latte'];
    const snob = pickRegular(s, menu)!;
    expect(snob).toMatchObject({ name: SNOB.names[0], drink: 'americano', snob: true });
    expect(s.log.some((e) => e.kind === 'gear.quirk' && String(e.data.text).includes('🎩'))).toBe(true);
    const next = pickRegular(s, menu)!;
    expect(next.snob).toBeUndefined();
    expect(next.name).toBe('Ada');
    expect(s.regulars.filter((r) => r.snob)).toHaveLength(1);
  });

  it('no snob when the family is off the menu, and never in classic runs', () => {
    const s = run(true);
    s.slotGear = ['e5', null, null, 'b0'];
    expect(pickRegular(s, ['latte'])!.snob).toBeUndefined();
    const c = run(false);
    c.slotGear = ['e5', null, null, 'b0'];
    expect(pickRegular(c, ['espresso'])!.snob).toBeUndefined();
  });

  it('a snob tips big for a perfect 3★ cup and little for a sloppy one', () => {
    expect(snobTip(3)).toBe(SNOB.hiTip);
    expect(snobTip(2)).toBe(1);
    expect(snobTip(1)).toBe(SNOB.loTip);
    expect(snobTip(0)).toBe(SNOB.loTip);
    const base = inArea('gym'); // no quality rule, so the ratio is the snob's alone
    base.phase = 'day';
    base.regulars = [{ name: 'Margaux', drink: 'espresso', visits: 1, lost: 0 }];
    base.customers = [{ id: 99, drink: 'espresso', patienceLeft: 100, patienceMax: 100, kind: 'regular', name: 'Margaux' }];
    const tipOf = (snob: boolean, slips: number) => {
      const s = structuredClone(base);
      if (snob) s.regulars[0].snob = true;
      serveCustomer(s, s.customers[0], 'espresso', 'p1', slips);
      return s.today.tips;
    };
    expect(tipOf(false, 0)).toBeGreaterThan(0);
    expect(tipOf(true, 0) / tipOf(false, 0)).toBeCloseTo(SNOB.hiTip, 1);
    expect(tipOf(true, 2) / tipOf(false, 2)).toBeCloseTo(SNOB.loTip, 1);
  });

  it('old saves (regulars without the flag) still load and show as ordinary', () => {
    const s = run(true);
    s.regulars = JSON.parse('[{"name":"Ada","drink":"latte","visits":3,"lost":0,"loyalty":2}]');
    const vm = regularsViewModel(s);
    expect(vm[0].snob).toBeUndefined();
    expect(pickRegular(s, ['latte'])!.name).toBe('Ravi');
  });

  it('tickets and the regulars drawer mark a snob with 🎩', () => {
    const c = { id: 1, drink: 'espresso' as DrinkId, patienceLeft: 1, patienceMax: 1, kind: 'regular' as const, name: 'Margaux' };
    expect(ticketTag(c, new Set(['Margaux']))!.text).toContain('🎩');
    expect(ticketTag(c)!.text).toBe('Margaux · regular');
  });
});

describe('G10b: the notebook names the crowd once it has learned something', () => {
  it('hidden until a family has stars, then shown in the street notebook', () => {
    const s = inArea('office');
    s.phase = 'night';
    s.day = 3;
    expect(gearVM(s).crowd).toBeUndefined();
    s.days = [{ ...(s.days[0] ?? {}), drinks: { drip: 12 } } as GameState['days'][number]];
    const vm = gearVM(s);
    expect(vm.crowd).toBe(AREAS.office.crowd);
    expect(gearBoard(vm)).toContain('👥');
  });
});
