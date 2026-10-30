import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { stationsFromSlots } from './slots';
import { addCustomer, drinkWait } from './customers';
import { computeModifiers } from './effects';
import { areaPatienceMul } from './gear';
import { ECONOMY } from '../data/economy';
import { TICK_RATE } from './constants';
import { DRINK_IDS, DRINK_INFO, GEAR_WAIT } from '../data/drinks';
import type { DrinkId, GameState, SupplyId } from './types';

/** A Gear café with every machine a drink here needs, the board showing only `drinks`, a clean queue. */
function gearShop(drinks: DrinkId[]): GameState {
  let s = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 600 }, gear: true });
  s.slots = ['grinder', 'espresso', 'steamer', 'drip', 'drip', 'trash'];
  s.slotGear = ['g2', 'e3', 's3', 'd3', 'd4b', 'b0'];
  s.stations = stationsFromSlots(s.tier, s.slots, s.slotGear);
  s.unlocked = [...drinks];
  for (const d of DRINK_IDS) s.menu[d] = drinks.includes(d);
  for (const k of Object.keys(s.supplies) as SupplyId[]) s.supplies[k] = 50;
  s = startDay(s);
  s.customers = [];
  return s;
}

describe('Gear patience by drink (Task 5)', () => {
  it('the table is the spec table', () => {
    expect(GEAR_WAIT).toEqual({
      drip: 0.9, coldBrew: 0.9, sweetCream: 1, cafeAuLait: 1, espresso: 1.3, americano: 1.3, doppio: 1.4, redEye: 1.4,
      latte: 1.4, icedLatte: 1.4, matcha: 1.4, cappuccino: 1.5, mocha: 1.5, special: 1.5, pourOver: 1.7,
    });
  });

  it("a Gear customer waits 33 s x modifiers x the drink's pace", () => {
    for (const d of ['drip', 'espresso', 'latte', 'cappuccino', 'pourOver'] as DrinkId[]) {
      const s = gearShop([d]);
      expect(s.gear).toBe(true);
      const c = addCustomer(s, 'normal')!;
      expect(c.drink).toBe(d);
      expect(drinkWait(s, d)).toBe(GEAR_WAIT[d]);
      expect(c.patienceMax).toBe(Math.round(ECONOMY.patienceSeconds * computeModifiers(s).patience * GEAR_WAIT[d] * areaPatienceMul(s, [d]) * TICK_RATE));
    }
  });

  it('a group waits as long as its slowest order', () => {
    const s = gearShop(['drip', 'pourOver']);
    let found = false;
    for (let i = 0; i < 300 && !found; i++) {
      const c = addCustomer(s, 'group')!;
      const drinks = [c.drink, ...(c.extra ?? [])];
      if (!(drinks.includes('drip') && drinks.includes('pourOver'))) continue;
      found = true;
      expect(c.patienceMax).toBe(Math.round(ECONOMY.patienceSeconds * computeModifiers(s).patience * ECONOMY.customers.group.patience * GEAR_WAIT.pourOver * areaPatienceMul(s, drinks) * TICK_RATE));
    }
    expect(found).toBe(true);
  });

  it('classic keeps the DRINK_INFO wait', () => {
    const s = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
    s.unlocked = ['icedLatte'];
    for (const d of DRINK_IDS) s.menu[d] = d === 'icedLatte';
    startDay(s);
    s.customers = [];
    expect(drinkWait(s, 'icedLatte')).toBe(DRINK_INFO.icedLatte.wait);
    expect(drinkWait(s, 'espresso')).toBe(1);
    const c = addCustomer(s, 'normal')!;
    expect(c.drink).toBe('icedLatte');
    expect(c.patienceMax).toBe(Math.round(ECONOMY.patienceSeconds * computeModifiers(s).patience * 1.15 * TICK_RATE));
  });
});
