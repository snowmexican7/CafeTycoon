import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../data/economy';
import { addCustomer, serveCustomer } from './customers';
import { createRun, startDay } from './run';
import { finishDay } from './closing';
import { SPOIL, spoilCount, spoilOvernight, spoilRate, sellPastry } from './spoilage';
import { step } from './step';
import type { GameState } from './types';
import { nightViewModel } from '../ui/viewModels';
import { computeModifiers } from './effects';

const run = () => createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }], settings: { bots: 0 } });

describe('supplies that spoil (P3 B4)', () => {
  it('throws out a fixed share of leftover milk and pastries at closing, never shelf-stable stock', () => {
    const s = run();
    s.supplies = { beans: 30, milk: 20, concentrate: 15, flavour: 5, pastry: 6 };
    spoilOvernight(s);
    expect(s.supplies).toEqual({ beans: 30, milk: 14, concentrate: 15, flavour: 5, pastry: 3 });
    expect(s.today.spoiled).toEqual({ milk: 6, pastry: 3 });
    expect(s.today.spoiledValue).toBeCloseTo((6 * ECONOMY.packs.milk.cost) / ECONOMY.packs.milk.size + (3 * ECONOMY.packs.pastry.cost) / ECONOMY.packs.pastry.size, 5);
  });

  it('a walk-in fridge card cuts it (Round 4 f: no Manager role any more)', () => {
    const s = run();
    expect(spoilRate(s, 'milk')).toBe(SPOIL.rate.milk);
    s.owned.push({ itemId: 'walkInFridge', effects: [{ kind: 'spoil', mul: 0.4 }] });
    expect(computeModifiers(s).spoil).toBeCloseTo(0.4, 6);
    expect(spoilRate(s, 'milk')).toBeCloseTo(0.12, 6);
    expect(spoilRate(s, 'pastry')).toBeCloseTo(0.2, 6);
    expect(spoilCount(s, 'milk', 20)).toBe(2);
    expect(spoilRate(s, 'beans')).toBe(0);
  });

  it('sells pastries on the side only while the case has some, deterministically', () => {
    const a = startDay(run());
    a.supplies.pastry = 4;
    const b = structuredClone(a) as GameState;
    let soldA = 0;
    for (let i = 0; i < 20; i++) soldA += sellPastry(a) ? 1 : 0;
    let soldB = 0;
    for (let i = 0; i < 20; i++) soldB += sellPastry(b) ? 1 : 0;
    expect(soldA).toBe(4);
    expect(soldB).toBe(soldA);
    expect(a.supplies.pastry).toBe(0);
    expect(a.today.pastries).toBe(4);
    expect(a.today.sales).toBe(4 * SPOIL.pastry.price);
    expect(sellPastry(a)).toBe(0);
  });

  it('leaves the RNG stream alone when there are no pastries', () => {
    const a = startDay(run());
    const b = structuredClone(a) as GameState;
    const c = addCustomer(a, 'normal')!;
    serveCustomer(a, c, c.drink);
    const d = addCustomer(b, 'normal')!;
    serveCustomer(b, d, d.drink);
    expect(a.rng).toBe(b.rng);
  });

  it('shows what went off on the night board and the fresh share per row', () => {
    const s = startDay(run());
    s.supplies.milk = 10;
    s.supplies.pastry = 4;
    const n = finishDay(s);
    const vm = nightViewModel(n, 'p1');
    expect(vm.takings?.spoiledWhat).toBe('3 milk, 2 pastries');
    const milk = vm.restock.find((r) => r.supply === 'milk')!;
    expect(milk).toMatchObject({ spoilPct: 30, spoiled: 3 });
    expect(vm.restock.find((r) => r.supply === 'beans')!.spoilPct).toBeUndefined();
  });

});
