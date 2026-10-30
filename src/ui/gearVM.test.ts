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
    expect(cold.tiers.map((t) => t.state)).toEqual(['passed', 'another', 'upgrade', 'poor', 'poor']);
    expect(cold.tiers[2].net).toBe(55 - 8);
    expect(gearVM(s).note).toMatch(/No supplies/);
  });
  it('G4e: buy another of the same machine into a free slot; no slot or no cash shows plain owned', () => {
    const s = run();
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'c2' });
    const before = s.cash;
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'c2' });
    expect((s.slotGear ?? []).filter((g) => g === 'c2').length).toBe(2);
    expect(s.cash).toBe(before - 25);
    const vm = gearVM(s);
    const t = vm.trees.find((x) => x.id === 'coldBrew')!.tiers[1];
    expect(t.copies).toBe(2);
    expect(t.state).toBe(vm.freeSlots > 0 && s.cash >= 25 ? 'another' : 'owned');
    s.cash = 0;
    expect(gearVM(s).trees.find((x) => x.id === 'coldBrew')!.tiers[1].state).toBe('owned');
    expect(gearBoard(gearVM(s))).toContain('Yours ×2 ✓');
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

describe('Gear G5: the day HUD gear card', () => {
  it('lists machines (not the bin) with batch, dead and jammed status; absent in classic runs', async () => {
    const { hudGearVM } = await import('./gearVM');
    const { hudViewModel } = await import('./viewModels');
    const { applyGearInput } = await import('../sim/gear');
    const { startDay } = await import('../sim/run');
    const s = run();
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'c1' });
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 's1' });
    startDay(s);
    s.stations.find((x) => x.kind === 'steamer')!.dead = true;
    expect(hudGearVM(s).map((g) => g.status)).toEqual(['8/8 left', 'dead']);
    expect(hudViewModel(s).gear?.length).toBe(2);
    const classic = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand' });
    expect('gear' in hudViewModel(classic)).toBe(false);
  });
});

describe('Gear G7b: the street notebook', () => {
  it('counts served per family over finished days and shows stars after 10', async () => {
    const { notebookVM } = await import('./gearVM');
    const { gearArea } = await import('../sim/gear');
    const s = run();
    const rainy = { ...s, scenario: 'rainyWeek' as const };
    expect(gearArea(rainy)).toBe('drizzleton');
    const day = (drinks: Record<string, number>) => ({ ...(s.today as object), drinks }) as (typeof s.days)[number];
    rainy.days = [day({ latte: 6, icedLatte: 3 }), day({ mocha: 5, coldBrew: 8, espresso: 2 })];
    const nb = notebookVM(rainy);
    expect(nb.map((r) => [r.family, r.served, r.stars])).toEqual([['espresso', 2, null], ['milky', 11, 5], ['iced', 11, 2], ['filter', 0, null]]);
    expect(nb[0].left).toBe(8);
    const classic = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand' });
    expect(notebookVM(classic)).toEqual([]);
  });
});

describe('Gear G4d: drip on the HUD', () => {
  it('shows the pot: empty, brewing, cups left, and cold', async () => {
    const { hudGearVM } = await import('./gearVM');
    const { applyGearInput } = await import('../sim/gear');
    const s = run();
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'd1' });
    const st = s.stations.find((x) => x.kind === 'drip')!;
    const line = () => hudGearVM(s).find((r) => r.name === 'Thrift Store Special')!;
    expect(line().status).toBe('empty pot (E)');
    st.busyTicksLeft = 10;
    expect(line().status).toBe('brewing…');
    st.busyTicksLeft = 0;
    st.potLeft = 3;
    st.potColdAt = s.tick + 100;
    expect([line().status, line().warn]).toEqual(['3/4 cups', false]);
    s.tick += 200;
    expect([line().status, line().warn]).toEqual(['3/4 cups · cold', true]);
  });
});
