import { describe, expect, it } from 'vitest';
import { catalogueById } from '../data/catalogue';
import { applyNightInput } from '../sim/night';
import { createRun } from '../sim/run';
import { handCardViewModel, nightStructureKey, nightViewModel } from './viewModels';

const solo = () => createRun({ seed: 4, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });

describe('upgrade cards UI', () => {
  it('a spicy card shows its rarity, path, and the downside apart from the upside', () => {
    const vm = handCardViewModel(solo(), catalogueById.cheapBeans);
    expect(vm).toMatchObject({ rarity: 'common', path: 'quality', spicy: true, ups: 'beans 50% cheaper' });
    expect(vm.downs).toContain('rating');
    expect(handCardViewModel(solo(), catalogueById.neonSign).spicy).toBeUndefined();
  });

  it('a re-roll rebuilds the hand and moves the price on', () => {
    const s = solo();
    const before = nightStructureKey(nightViewModel(s, 'p1'));
    applyNightInput(s, { kind: 'reroll', playerId: 'p1' });
    const vm = nightViewModel(s, 'p1');
    expect(vm.reroll.cost).toBe('$10.00');
    expect(nightStructureKey(vm)).not.toBe(before);
  });

  it('a card with no set has no set line, a tomorrow-only card never counts toward one', () => {
    expect(handCardViewModel(solo(), catalogueById.weatherRadio).set).toBeUndefined();
    expect(handCardViewModel(solo(), catalogueById.hireTemp).set).toBeUndefined();
  });
});
