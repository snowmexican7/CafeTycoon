import { describe, expect, it } from 'vitest';
import { DRINK_IDS, recipeChain } from '../data/drinks';
import { createRun, startNight } from '../sim/run';
import { unlockDrink } from '../sim/unlocks';
import { DRINK_STEPS } from './live';
import { nightStructureKey, nightViewModel } from './viewModels';

describe('menu variety UI', () => {
  it('every drink has a recipe ticket ending in a hand-off, one step per station visit', () => {
    for (const d of DRINK_IDS) {
      expect(DRINK_STEPS[d].at(-1)).toBe('Hand off');
      expect(DRINK_STEPS[d].length).toBe(recipeChain(d).length + 1);
    }
  });

  it('the night before day 5 introduces the mocha with price, blurb and ticket', () => {
    const s = createRun({ seed: 4, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
    s.day = 5;
    startNight(s);
    const vm = nightViewModel(s, 'p1');
    // skipping straight to day 5 catches up on the day-3 iced latte too
    expect(vm.fresh!.map((f) => f.drink)).toEqual(['icedLatte', 'mocha']);
    expect(vm.fresh![1]).toMatchObject({ drink: 'mocha', name: 'Mocha', flavour: true });
    expect(vm.fresh![1].ticket.length).toBeGreaterThan(2);
    expect(vm.menu!.map((m) => m.drink)).toContain('mocha');
    expect(vm.restock.map((r) => r.supply)).toContain('flavour');
  });

  it('toggling a drink off rebuilds the night screen', () => {
    const s = createRun({ seed: 4, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
    unlockDrink(s, 'icedLatte');
    const before = nightStructureKey(nightViewModel(s, 'p1'));
    s.menu.icedLatte = false;
    expect(nightStructureKey(nightViewModel(s, 'p1'))).not.toBe(before);
  });
});
