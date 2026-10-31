import { describe, expect, it } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { validateInput } from './validate';
import { applyNightInput, restockCost } from './night';
import { expectedOrders, expectedUse, nightBrief, runOutFraction } from './brief';
import { addCustomer, serveCustomer } from './customers';
import { planNight } from './bots/planner';
import { rentForDay } from './effects';
import { ECONOMY } from '../data/economy';
import type { GameState, PlayerInput } from './types';

const run = (): GameState => createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
const FULL = { beans: 500, milk: 500, concentrate: 500, flavour: 500 };
const find = (s: GameState, id: string) => nightBrief(s).alerts.find((a) => a.id === id);
const buy = (s: GameState, packs: number): GameState => applyNightInput(s, { kind: 'restock', playerId: 'p1', supply: 'pastry', packs });

describe('R4 b: pastries are a restock item', () => {
  it('validateInput accepts a pastry restock and still rejects junk', () => {
    expect(validateInput({ kind: 'restock', playerId: 'p1', supply: 'pastry', packs: 2 })).toEqual({ kind: 'restock', playerId: 'p1', supply: 'pastry', packs: 2 });
    expect(validateInput({ kind: 'restock', playerId: 'p1', supply: 'pastry', packs: 0 })).toBeNull();
    expect(validateInput({ kind: 'restock', playerId: 'p1', supply: 'bagel' as never, packs: 1 })).toBeNull();
  });

  it('buying a pack puts a pack in the case and takes the pack price (through step, at night)', () => {
    const s = run();
    expect(s.phase).toBe('night');
    const cash = s.cash;
    const t = step(s, [{ kind: 'restock', playerId: 'p1', supply: 'pastry', packs: 2 }]);
    expect(t.supplies.pastry).toBe(2 * ECONOMY.packs.pastry.size);
    expect(t.cash).toBeCloseTo(cash - 2 * ECONOMY.packs.pastry.cost, 6);
    expect(restockCost(s, 'pastry', 1)).toBe(ECONOMY.packs.pastry.cost);
  });

  it('cannot buy what the till cannot pay for, and not in the daytime', () => {
    const s = run();
    s.cash = 6;
    expect(buy(s, 1).supplies.pastry).toBe(0);
    const d = startDay(run());
    const t = step(d, [{ kind: 'restock', playerId: 'p1', supply: 'pastry', packs: 1 }]);
    expect(t.supplies.pastry).toBe(0);
  });

  it('pastries do not need the fridge: a Gear run buys them with no fridge at all', () => {
    const s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, gear: true });
    const t = buy(s, 1);
    expect(t.supplies.pastry).toBe(ECONOMY.packs.pastry.size);
    // and the morning setup carries them into the day untouched
    expect(startDay(t).supplies.pastry).toBe(ECONOMY.packs.pastry.size);
  });

  it('a stocked day sells some pastries on the side; an unstocked one sells none and keeps the RNG stream', () => {
    const stocked = startDay(buy(run(), 2));
    stocked.supplies = { ...stocked.supplies, ...FULL };
    const bare = startDay(run());
    bare.supplies = { ...bare.supplies, ...FULL };
    for (let i = 0; i < 20; i++) {
      for (const s of [stocked, bare]) {
        const c = addCustomer(s, 'normal');
        if (c) serveCustomer(s, c, c.drink);
      }
    }
    expect(stocked.today.pastries ?? 0).toBeGreaterThan(0);
    expect(stocked.today.pastries ?? 0).toBeLessThanOrEqual(2 * ECONOMY.packs.pastry.size);
    expect(stocked.supplies.pastry).toBe(2 * ECONOMY.packs.pastry.size - (stocked.today.pastries ?? 0));
    expect(bare.today.pastries ?? 0).toBe(0);
    expect(bare.supplies.pastry).toBe(0);
  });

  it('expectedUse counts the pastries a day sells (the attach rate on the day’s orders)', () => {
    const s = run();
    const orders = Object.values(expectedOrders(s)).reduce((a, b) => a + b, 0);
    expect(expectedUse(s).pastry).toBe(Math.ceil(orders * 0.35));
    expect(expectedUse(s).pastry).toBeGreaterThan(0);
    s.supplies.pastry = Math.floor(expectedUse(s).pastry / 2);
    expect(runOutFraction(s, 'pastry')).toBeCloseTo(s.supplies.pastry / expectedUse(s).pastry, 6);
  });

  describe('night brief', () => {
    it('says when the pastries run out, with a restock fix, like beans and milk', () => {
      const s = run();
      s.supplies.pastry = 1;
      const a = find(s, 'stock:pastry:low')!;
      expect(a).toMatchObject({ kind: 'stock', severity: 'warn' });
      expect(a.text).toMatch(/^Pastries stock runs out around \d+:\d\d [AP]M$/);
      expect(a.fix).toMatchObject({ kind: 'restock', supply: 'pastry' });
      s.cash = 1;
      expect(find(s, 'stock:pastry:low')!.fix).toBeUndefined();
    });

    it('stays quiet when the case is empty or full (no case, no nagging)', () => {
      const s = run();
      expect(s.supplies.pastry).toBe(0);
      expect(nightBrief(s).alerts.filter((a) => a.id.includes('pastry'))).toEqual([]);
      s.supplies.pastry = expectedUse(s).pastry;
      expect(nightBrief(s).alerts.filter((a) => a.id.includes('pastry'))).toEqual([]);
    });
  });

  describe('bots and the planner', () => {
    const rich = (): GameState => {
      const s = run();
      s.supplies = { ...FULL, pastry: 0 };
      s.cash = 200;
      return s;
    };

    it('restocks pastries when the till has room, after the drink supplies, at its own priority', () => {
      const s = rich();
      const a = planNight(s).find((x) => x.id === 'restock:pastry')!;
      expect(a.kind).toBe('restock');
      const use = expectedUse(s).pastry;
      expect(a.input).toEqual({ kind: 'restock', supply: 'pastry', packs: Math.max(1, Math.round(use / ECONOMY.packs.pastry.size)) });
      const beans = rich();
      beans.supplies.beans = 0;
      const plan = planNight(beans);
      expect(plan.find((x) => x.id === 'restock:beans')!.priority).toBeGreaterThan(plan.find((x) => x.id === 'restock:pastry')!.priority);
    });

    it('never buys pastries ahead of rent or the drink supplies, and buys none when the case already covers the day', () => {
      const s = rich();
      s.cash = rentForDay(s) + 5;
      expect(planNight(s).find((x) => x.id === 'restock:pastry')).toBeUndefined();
      const full = rich();
      full.supplies.pastry = expectedUse(full).pastry;
      expect(planNight(full).find((x) => x.id === 'restock:pastry')).toBeUndefined();
    });

    it('the plan applies cleanly through the validator', () => {
      const a = planNight(rich()).find((x) => x.id === 'restock:pastry')!;
      const input = { ...a.input, playerId: 'p1' } as PlayerInput;
      expect(validateInput(input)).toEqual(input);
    });
  });
});
