import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { stationsFromSlots } from './slots';
import { stepPickup } from './pickup';
import { BLACK_LINES, CONDIMENTS, condimentRoll, wantsCondiments } from './condiments';
import { ECONOMY } from '../data/economy';
import { TICK_RATE } from './constants';
import { GEAR, type GearId } from '../data/gear';
import type { Customer, DrinkId, GameState } from './types';

function gearDay(gear: GearId[] = ['c1', 'e1']): GameState {
  const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear: true });
  const slots = [...s.slots!];
  const slotGear = [...s.slotGear!];
  gear.forEach((id, i) => {
    slots[i] = GEAR[id].station;
    slotGear[i] = id;
  });
  s.slots = slots;
  s.slotGear = slotGear;
  s.stations = stationsFromSlots(s.tier, slots, slotGear);
  s.supplies.concentrate = 20;
  const out = startDay(s);
  out.customers = [];
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const atPickup = (id: number, drink: DrinkId, more: Partial<Customer> = {}): Customer => ({
  id, drink, patienceLeft: 900, patienceMax: 1800, stage: 'pickup', rungAt: 0, ...more,
});
const put = (s: GameState, drink: DrinkId) => s.pass.push({ item: drink, ticksLeft: ECONOMY.pass.staleSeconds[drink] * TICK_RATE, by: 'p1' });
/** The first customer id (from 1) whose roll says yes (`want`) or no, with no group drinks left. */
const idWhere = (want: boolean): number => {
  for (let id = 1; ; id++) if (condimentRoll(id, 0) < CONDIMENTS.share === want) return id;
};

describe('the condiment stop at pickup (Task 10)', () => {
  it('about 60% of plain drip and cold brew drinkers want condiments; nobody else', () => {
    let n = 0;
    for (let id = 1; id <= 1000; id++) {
      const r = condimentRoll(id, 0);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
      if (r < 0.6) n++;
    }
    expect(n).toBeGreaterThan(550);
    expect(n).toBeLessThan(650);
    const s = gearDay();
    const yes = idWhere(true);
    expect(wantsCondiments(s, atPickup(yes, 'drip'), 'drip')).toBe(true);
    expect(wantsCondiments(s, atPickup(yes, 'coldBrew'), 'coldBrew')).toBe(true);
    expect(wantsCondiments(s, atPickup(idWhere(false), 'drip'), 'drip')).toBe(false);
    for (let id = 1; id <= 200; id++) {
      for (const d of ['latte', 'sweetCream', 'pourOver', 'icedLatte', 'cafeAuLait'] as DrinkId[]) {
        expect(wantsCondiments(s, atPickup(id, d), d)).toBe(false);
      }
    }
    // A classic run has no bar: nobody stops.
    const classic = startDay(createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } }));
    expect(wantsCondiments(classic, atPickup(yes, 'drip'), 'drip')).toBe(false);
  });

  it('a wanting customer uses a serving at pickup; a customer who does not want one leaves the bar alone', () => {
    const s = gearDay();
    const yes = idWhere(true);
    s.customers = [atPickup(yes, 'drip')];
    put(s, 'drip');
    stepPickup(s);
    expect(s.today.served).toBe(1);
    expect(s.condiments!.servings).toBe(19);
    expect(s.log.find((e) => e.kind === 'condiment.use')?.data).toEqual({ customer: yes });
    const t = gearDay();
    t.customers = [atPickup(idWhere(false), 'coldBrew')];
    put(t, 'coldBrew');
    stepPickup(t);
    expect([t.today.served, t.condiments!.servings]).toEqual([1, 20]);
    expect(t.log.some((e) => e.kind === 'condiment.use' || e.kind === 'condiment.black')).toBe(false);
  });

  it('an empty bar means black coffee: tip × 0.8 and a grumble', () => {
    const base = gearDay();
    const yes = idWhere(true);
    base.customers = [atPickup(yes, 'drip', { rungAt: -1e6 })]; // rung long ago: no flat speed tip on top
    put(base, 'drip');
    const full = structuredClone(base);
    const empty = structuredClone(base);
    empty.condiments!.servings = 0;
    stepPickup(full);
    stepPickup(empty);
    expect([full.today.served, empty.today.served]).toEqual([1, 1]);
    expect(empty.today.sales).toBe(full.today.sales);
    expect(Math.abs(empty.today.tips - round2(full.today.tips * 0.8))).toBeLessThanOrEqual(0.01);
    expect(empty.today.blackCoffees).toBe(1);
    expect(full.today.blackCoffees ?? 0).toBe(0);
    expect(empty.condiments!.servings).toBe(0);
    const black = empty.log.find((e) => e.kind === 'condiment.black');
    expect(black?.data).toEqual({ customer: yes, text: BLACK_LINES[yes % 3] });
    expect(BLACK_LINES).toContain(black?.data.text);
    expect(empty.log.some((e) => e.kind === 'condiment.use')).toBe(false);
    // A customer who takes it black anyway pays full tip at an empty bar.
    const plain = gearDay();
    plain.condiments!.servings = 0;
    plain.customers = [atPickup(idWhere(false), 'drip')];
    put(plain, 'drip');
    stepPickup(plain);
    expect(plain.today.blackCoffees ?? 0).toBe(0);
  });

  it('a refused cup (name mix-up) uses no serving', () => {
    const s = gearDay();
    const yes = idWhere(true);
    s.customers = [atPickup(yes, 'drip', { egg: 'nameMix', name: 'Sam', wrongName: 'Pam' })];
    put(s, 'drip');
    stepPickup(s);
    expect(s.today.served).toBe(0);
    expect(s.condiments!.servings).toBe(20);
    expect(s.log.some((e) => e.kind === 'condiment.use' || e.kind === 'condiment.black')).toBe(false);
  });

  it('a group rolls on the drinks still to come, before the cup is taken', () => {
    // Two drip drinkers in one group: each cup rolls on its own (extra.length differs), all by the customer id.
    const s = gearDay();
    let id = 1;
    while (!(condimentRoll(id, 1) < 0.6 && condimentRoll(id, 0) >= 0.6)) id++;
    s.customers = [atPickup(id, 'drip', { extra: ['drip'] })];
    put(s, 'drip');
    put(s, 'drip');
    stepPickup(s);
    expect(s.today.served).toBe(2);
    expect(s.condiments!.servings).toBe(19); // the first cup (one drink left) wanted a serving, the last did not
    expect(s.log.filter((e) => e.kind === 'condiment.use')).toHaveLength(1);
  });
});
