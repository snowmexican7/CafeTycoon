import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { finishDay } from './closing';
import { stationsFromSlots } from './slots';
import { validateInput } from './validate';
import { addCustomer, serveCustomer, spawnInfluencer } from './customers';
import { CONDIMENTS, refillBar, takeBox } from './condiments';
import { CONDIMENTS_ID, layoutFor } from '../data/layout';
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
  const s = gearNight(gear);
  s.supplies.concentrate = 20; // the morning steeps the taps from concentrate (batch/pickup Task 4)
  return startDay(s);
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

  it('buying boxes costs $6 each at night, Gear only, never on credit (the day is a rush: rushRestock.test.ts)', () => {
    const s = gearNight([]);
    s.cash = 20;
    const t = step(s, [{ kind: 'condimentBox', playerId: 'p1', boxes: 2 }]);
    expect([t.cash, t.condimentBoxes]).toEqual([8, 2]);
    expect(step(t, [{ kind: 'condimentBox', playerId: 'p1', boxes: 2 }]).condimentBoxes).toBe(2); // $8 < $12
    const day = gearDay([]);
    day.cash = 20;
    expect(step(day, [{ kind: 'condimentBox', playerId: 'p1', boxes: 1 }]).cash).toBe(12.5); // Round 4 f: $7.50 rush
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

describe('carrying a box to the bar (Task 8)', () => {
  const p1 = (s: GameState) => s.players.find((p) => p.id === 'p1')!;
  const press = (s: GameState) => step(s, [{ kind: 'move', playerId: 'p1', x: 0, y: 0, interact: true }]);
  const corner = (s: GameState) => layoutFor(s.tier).boxCorner;
  const bar = (s: GameState) => s.stations.find((x) => x.id === CONDIMENTS_ID)!;

  it('empty hands at the corner pick up a box; none left, nothing', () => {
    let s = gearDay([]);
    s.condimentBoxes = 2;
    p1(s).pos = { ...corner(s) };
    s = press(s);
    expect([p1(s).tool, s.condimentBoxes]).toEqual(['box', 1]);
    let t = gearDay([]);
    t.condimentBoxes = 0;
    p1(t).pos = { ...corner(t) };
    t = press(t);
    expect([p1(t).tool, t.condimentBoxes]).toEqual([null, 0]);
    // out of range: nothing
    let u = gearDay([]);
    u.condimentBoxes = 2;
    p1(u).pos = { x: corner(u).x + 5, y: 1 };
    u = press(u);
    expect([p1(u).tool, u.condimentBoxes]).toEqual([null, 2]);
  });

  it('between the mop and the boxes, the nearer wins; a tie goes to the mop', () => {
    const at = (mopPos: { x: number; y: number }, me: { x: number; y: number }) => {
      let s = gearDay([]);
      s.condimentBoxes = 1;
      s.mop = { pos: mopPos, heldBy: null };
      p1(s).pos = me;
      s = press(s);
      return p1(s).tool;
    };
    const c = corner(gearDay([]));
    // both in range, box nearer
    expect(at({ x: c.x + 1, y: c.y }, { x: c.x + 0.2, y: c.y })).toBe('box');
    // both in range, mop nearer
    expect(at({ x: c.x + 0.2, y: c.y }, { x: c.x + 1, y: c.y })).toBe('mop');
    // a tie goes to the mop
    expect(at({ x: c.x + 1, y: c.y }, { x: c.x, y: c.y })).toBe('box'); // sanity: box strictly nearer
    expect(at({ x: c.x + 1, y: c.y }, { x: c.x + 0.5, y: c.y })).toBe('mop'); // 0.5 from each
    // box out of range, mop in range
    expect(at({ x: c.x + 2, y: c.y }, { x: c.x + 2, y: c.y })).toBe('mop');
  });

  it('a box at the bar refills it to 20; a full bar keeps the box; elsewhere nothing', () => {
    let s = gearDay([]);
    s.condiments = { servings: 3 };
    p1(s).tool = 'box';
    p1(s).pos = { ...bar(s).pos };
    s = press(s);
    expect([s.condiments!.servings, p1(s).tool]).toEqual([20, null]);
    expect(s.log.filter((e) => e.kind === 'condiment.refill').map((e) => e.data)).toEqual([{ by: 'p1' }]);

    let full = gearDay([]);
    p1(full).tool = 'box';
    p1(full).pos = { ...bar(full).pos };
    full = press(full);
    expect([full.condiments!.servings, p1(full).tool]).toEqual([20, 'box']);
    expect(full.log.filter((e) => e.kind === 'condiment.refill')).toHaveLength(0);

    let away = gearDay(['c1']);
    away.condiments = { servings: 3 };
    p1(away).tool = 'box';
    p1(away).pos = { x: 0.5, y: 0.5 };
    away = press(away);
    expect([away.condiments!.servings, p1(away).tool]).toEqual([3, 'box']);
  });

  it('hands full: a box blocks every station', () => {
    let s = gearDay(['c1']);
    const tap = s.stations.find((x) => x.kind === 'coldBrewTap')!;
    tap.batchLeft = 5;
    p1(s).tool = 'box';
    p1(s).pos = { ...tap.pos };
    s = press(s);
    expect(p1(s).holding).toBeNull();
    expect(s.stations.find((x) => x.kind === 'coldBrewTap')!.batchLeft).toBe(5);
    expect(p1(s).tool).toBe('box');
  });

  it('takeBox and refillBar are Gear-only, no-ops otherwise', () => {
    const c = startDay(classicRun());
    c.condimentBoxes = 3;
    p1(c).pos = { ...layoutFor(c.tier).boxCorner };
    expect(takeBox(c, p1(c))).toBe(false);
    p1(c).tool = 'box';
    expect(refillBar(c, p1(c))).toBe(false);
  });
});
