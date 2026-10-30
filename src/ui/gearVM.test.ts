import { describe, it, expect } from 'vitest';
import { createRun } from '../sim/run';
import { applyGearInput } from '../sim/gear';
import { gearVM } from './gearVM';

const run = () => createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear: true });

describe('gearVM (Gear Tree G3)', () => {
  it('Pick your gear: four slots, the box in the last, every tier priced against $120', () => {
    const vm = gearVM(run());
    expect(vm.pickNight).toBe(true);
    expect(vm.slots.map((s) => s.id)).toEqual([null, null, null, 'b0']);
    expect(vm.freeSlots).toBe(3);
    const cold = vm.trees.find((t) => t.id === 'coldBrew')!;
    expect(cold.tiers.map((t) => t.state)).toEqual(['buy', 'buy', 'buy', 'buy', 'poor']);
    expect(vm.trees.find((t) => t.id === 'espresso')!.tiers.map((t) => t.state)).toEqual(['buy', 'buy', 'poor', 'poor', 'poor', 'poor']);
    expect(vm.note).toMatch(/Nothing to sell/);
  });
  it('after buying: owned, passed and upgrade with the trade-in taken off', () => {
    const s = run();
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'c2' });
    const cold = gearVM(s).trees.find((t) => t.id === 'coldBrew')!;
    expect(cold.tiers.map((t) => t.state)).toEqual(['passed', 'owned', 'upgrade', 'poor', 'poor']);
    expect(cold.tiers[2].net).toBe(55 - 8);
    expect(gearVM(s).note).toMatch(/No supplies/);
  });
});

import { gearFlag } from './gearFlag';
import { gearBoard } from './night';
import { nightViewModel } from './viewModels';

describe('Gear UI wiring (G3)', () => {
  it('?gear=1 only', () => {
    expect(gearFlag('?gear=1')).toBe(true);
    expect(gearFlag('?gear=0')).toBe(false);
    expect(gearFlag('')).toBe(false);
    expect(gearFlag('?seed=3')).toBe(false);
  });
  it('the night VM carries gear only in a Gear run', () => {
    const classic = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand' });
    expect('gear' in nightViewModel(classic, 'p1')).toBe(false);
    expect(nightViewModel(run(), 'p1').gear?.pickNight).toBe(true);
  });
  it('the board has buy buttons for affordable tiers and no sell on the free box', () => {
    const html = gearBoard(gearVM(run()));
    expect(html).toContain('Pick your gear');
    expect(html).toContain('data-gear="c1"');
    expect(html).not.toContain('data-action="gear-sell"');
  });
});

describe('Gear polish: tossing worthless gear', () => {
  it('$0 gear says toss, not "Sell · $0"', async () => {
    const { sellLabel } = await import('./gearVM');
    expect(sellLabel('c1', 0).text).toBe('Bin the sock');
    expect(sellLabel('s1', 0).text).toBe('Toss it');
    expect(sellLabel('c2', 8).text).toBe('Sell · $8');
  });
});
