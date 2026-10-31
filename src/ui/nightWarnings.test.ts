import { describe, expect, it } from 'vitest';
import { createRun } from '../sim/run';
import { ECONOMY } from '../data/economy';
import { cutsIntoRent, expectedUse, nightWarnings, rentTomorrow } from './nightWarnings';

/** The sim brief's "low" line (src/sim/brief.ts): stock under this share of a day's use. */
const LOW_SUPPLY_SHARE = 0.75;
import { nightStructureKey, nightViewModel } from './viewModels';

const run = () => createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
const ids = (s: ReturnType<typeof run>) => nightWarnings(s).map((w) => w.id);

describe('night warnings', () => {
  it('a fresh run has no warnings', () => {
    const s = run();
    expect(s.phase).toBe('night');
    expect(nightWarnings(s)).toEqual([]);
  });

  it('names the rent shortfall in dollars', () => {
    const s = run();
    s.cash = 13;
    const [w] = nightWarnings(s);
    expect(rentTomorrow(s)).toBe(ECONOMY.rentPerDay);
    expect(w).toMatchObject({ id: 'cash:short', level: 'danger', title: "You'll be $12 short on rent" });
  });

  it('warns softly when the spare cash after rent is under a day of rent', () => {
    const s = run();
    s.cash = 40;
    const [w] = nightWarnings(s);
    expect(w).toMatchObject({ id: 'cash:low', level: 'low', title: 'Only $15 spare after rent' });
    expect(w.detail).toMatch(/no sales yet/);
    s.days.push({ ...s.today });
    expect(nightWarnings(s)[0].detail).not.toMatch(/no sales yet/);
    s.cash = 50;
    expect(ids(s)).toEqual([]);
  });

  it('calls out an empty supply and the drinks it stops', () => {
    const s = run();
    s.supplies.milk = 0;
    const w = nightWarnings(s).find((x) => x.supply === 'milk')!;
    expect(w).toMatchObject({ id: 'stock:milk:out', level: 'danger', title: 'Out of milk!' });
    expect(w.detail).toMatch(/Lattes can't be made/);
    s.supplies.beans = 0;
    expect(nightWarnings(s).find((x) => x.supply === 'beans')!.detail).toMatch(/Espressos and Lattes/);
  });

  it('ignores supplies only used by drinks that are off the menu', () => {
    const s = run();
    s.supplies.milk = 0;
    s.menu.latte = false;
    expect(ids(s).filter((id) => id.startsWith('stock:milk'))).toEqual([]);
  });

  it('flags a supply that will not last the day', () => {
    const s = run();
    const use = expectedUse(s);
    expect(use.beans).toBeGreaterThan(use.milk);
    const line = Math.ceil(use.beans * LOW_SUPPLY_SHARE);
    s.supplies.beans = line - 1;
    expect(ids(s)).toEqual(['stock:beans:low']);
    s.supplies.beans = line;
    expect(ids(s)).toEqual([]);
  });

  it('does not nag about the starting stock on a fresh run', () => {
    expect(ids(run()).filter((id) => id.startsWith('stock:'))).toEqual([]);
  });

  it('says when a pack is unaffordable', () => {
    const s = run();
    s.supplies.concentrate = 0;
    s.cash = 2;
    const w = nightWarnings(s).find((x) => x.supply === 'concentrate')!;
    expect(w.detail).toMatch(/more than you have/);
  });

  it('marks shop cards that would cut into rent, and puts warnings in the night view model', () => {
    const s = run();
    s.cash = 40;
    expect(cutsIntoRent(s, 20)).toBe(true);
    expect(cutsIntoRent(s, 10)).toBe(false);
    expect(cutsIntoRent(s, 60)).toBe(false); // unaffordable: the "need $X more" tag covers it
    s.cash = 100;
    expect(cutsIntoRent(s, 15)).toBe(false);
    s.hand = ['streetSign'];
    s.cash = 30;
    const vm = nightViewModel(s, 'p1');
    expect(vm.hand[0].cutsRent).toBe(true);
    expect(vm.warnings.map((w) => w.id)).toEqual(['cash:low']);
  });

  it('only rebuilds the night screen when the warnings change', () => {
    const s = run();
    s.hand = [];
    const a = nightStructureKey(nightViewModel(s, 'p1'));
    s.phaseTicksLeft -= 60;
    expect(nightStructureKey(nightViewModel(s, 'p1'))).toBe(a);
    s.supplies.milk = 0;
    const b = nightStructureKey(nightViewModel(s, 'p1'));
    expect(b).not.toBe(a);
    // the dollar amounts in a warning are patched in place, not rebuilt
    s.cash = 38; // P3 B12: clear of the $40 kiosk, whose button lights at 40
    const c = nightStructureKey(nightViewModel(s, 'p1'));
    expect(c).not.toBe(b);
    s.cash = 37;
    expect(nightStructureKey(nightViewModel(s, 'p1'))).toBe(c);
  });
});

describe('3.3.1: a losing branch is part of tomorrow\'s bills (matches the sim brief)', () => {
  const branchRun = (losing: boolean) => {
    const s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], gear: true, tier: 'stand' });
    s.reputation = 0;
    s.settings = { ...s.settings, dayLengthSec: 600 };
    s.branch = losing
      ? { area: 'campus', staff: 3, openedDay: 1, spent: 300, by: 'K' }
      : { area: 'tourist', staff: 1, openedDay: 1, spent: 300, by: 'K' };
    return s;
  };

  it('adds the expected loss and names the branch in the warning', async () => {
    const { branchExpectedLoss } = await import('../sim/branch');
    const { billsForDay } = await import('../sim/staff');
    const s = branchRun(true);
    const loss = branchExpectedLoss(s);
    expect(loss).toBeGreaterThan(0);
    expect(rentTomorrow(s)).toBeCloseTo(billsForDay(s) + loss, 2);
    s.cash = 1;
    const w = nightWarnings(s).find((x) => x.id === 'cash:short');
    expect(w?.title).toMatch(/short on rent.*the branch$/);
    expect(w?.detail).toMatch(/the branch are \$/);
    expect(cutsIntoRent({ ...s, cash: billsForDay(s) + loss / 2 + 1 } as typeof s, 1)).toBe(true);
  });

  it('a profitable branch adds nothing', async () => {
    const { billsForDay } = await import('../sim/staff');
    const s = branchRun(false);
    expect(rentTomorrow(s)).toBe(billsForDay(s));
  });
});

describe('3.3.1: branch stock sends are valued like the sim credits them', () => {
  it('worth = units x tonight\'s restock price per unit', async () => {
    const { branchViewModel } = await import('./branchView');
    const { restockCost } = await import('../sim/night');
    const s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], gear: true, tier: 'stand' });
    s.branch = { area: 'tourist', staff: 1, openedDay: 1, spent: 300, by: 'K' };
    s.supplies = { ...s.supplies, beans: 500, milk: 3 };
    const vm = branchViewModel(s)!;
    for (const sup of vm.supplies ?? []) {
      const pack = ECONOMY.packs[sup.id];
      expect(sup.worth).toBeCloseTo((sup.send * restockCost(s, sup.id, 1)) / pack.size, 2);
    }
    expect(vm.supplies?.find((x) => x.id === 'milk')?.send).toBe(3);
  });
});
