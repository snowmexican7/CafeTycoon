import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { finishDay } from './closing';
import { stationsFromSlots } from './slots';
import { validateInput } from './validate';
import { addCustomer, serveCustomer, spawnInfluencer } from './customers';
import { CONDIMENTS } from './condiments';
import { GEAR, type GearId } from '../data/gear';
import type { Customer, GameState, PlayerInput } from './types';

function gearNight(gear: GearId[]): GameState {
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
  return s;
}

function gearDay(gear: GearId[]): GameState {
  return startDay(gearNight(gear));
}

const classicRun = () => createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
const round2 = (n: number) => Math.round(n * 100) / 100;

describe('the condiment bar and its stock boxes (Task 1 shapes)', () => {
  it('validates the box input', () => {
    expect(validateInput({ kind: 'condimentBox', playerId: 'p1', boxes: 1 })).toEqual({ kind: 'condimentBox', playerId: 'p1', boxes: 1 });
    expect(validateInput({ kind: 'condimentBox', playerId: 'p1', boxes: CONDIMENTS.maxBoxes })).not.toBeNull();
    for (const boxes of [0, 11, 1.5, NaN]) expect(validateInput({ kind: 'condimentBox', playerId: 'p1', boxes } as PlayerInput)).toBeNull();
  });

  it('a Gear run opens with a full bar and no boxes; classic has neither', () => {
    const s = gearNight([]);
    expect(s.condiments).toEqual({ servings: 20 });
    expect(s.condimentBoxes).toBe(0);
    const c = classicRun();
    expect(c.condiments).toBeUndefined();
    expect(c.condimentBoxes).toBeUndefined();
  });

  it('buying boxes costs $6 each, night and Gear only, never on credit', () => {
    const s = gearNight([]);
    s.cash = 20;
    const t = step(s, [{ kind: 'condimentBox', playerId: 'p1', boxes: 2 }]);
    expect([t.cash, t.condimentBoxes]).toEqual([8, 2]);
    expect(step(t, [{ kind: 'condimentBox', playerId: 'p1', boxes: 2 }]).condimentBoxes).toBe(2); // $8 < $12
    const day = gearDay([]);
    day.cash = 20;
    expect(step(day, [{ kind: 'condimentBox', playerId: 'p1', boxes: 1 }]).condimentBoxes).toBe(0);
    const c = classicRun();
    expect(step(c, [{ kind: 'condimentBox', playerId: 'p1', boxes: 1 }]).condimentBoxes).toBeUndefined();
  });

  it('a carried box goes back to the corner on R, on leaving and at closing (Review Focus 3)', () => {
    for (const how of ['drop', 'leave', 'close'] as const) {
      let s = gearDay([]);
      s.condimentBoxes = 0;
      s.players[0]!.tool = 'box';
      if (how === 'drop') s = step(s, [{ kind: 'drop', playerId: 'p1' }]);
      if (how === 'leave') s = step(s, [{ kind: 'leave', playerId: 'p1' }]);
      if (how === 'close') finishDay(s);
      expect(s.condimentBoxes).toBe(1);
      expect(s.players[0]!.tool).toBeNull();
      expect(s.log.filter((e) => e.kind === 'drop' && e.data.item === 'box')).toHaveLength(1);
    }
  });

  it('Gear customers start in the order stage; classic customers have no stage', () => {
    const g = gearDay(['c1']);
    g.supplies.concentrate = 10;
    expect(addCustomer(g, 'normal')?.stage).toBe('order');
    expect(spawnInfluencer(g)?.stage).toBe('order');
    const c = startDay(classicRun());
    expect(addCustomer(c, 'normal')?.stage).toBeUndefined();
    expect(spawnInfluencer(c)?.stage).toBeUndefined();
  });

  it('tipMul scales the tip', () => {
    const s = gearDay(['c1']);
    s.supplies.concentrate = 10;
    const customer: Customer = { id: 900, drink: 'coldBrew', patienceLeft: 80, patienceMax: 100, stage: 'order' };
    s.customers = [customer];
    const a = structuredClone(s);
    const b = structuredClone(s);
    serveCustomer(a, a.customers[0]!, 'coldBrew', 'p1');
    serveCustomer(b, b.customers[0]!, 'coldBrew', 'p1', 0, false, CONDIMENTS.blackTip);
    expect(a.today.tips).toBeGreaterThan(0);
    expect(Math.abs(b.today.tips - round2(a.today.tips * 0.8))).toBeLessThanOrEqual(0.01);
    expect(b.today.sales).toBe(a.today.sales);
  });
});
