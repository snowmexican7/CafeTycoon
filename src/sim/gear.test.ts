import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { applyGearInput, batchOut, gearMorning } from './gear';
import { applyEquipInput, applySlotInput, reasonOff } from './slots';
import { applyGrowInput } from './growth';
import { availableDrinks } from './customers';
import { interact } from './stations';
import { validateInput } from './validate';
import { GEAR } from '../data/gear';
import type { CreateRunOptions, GameState } from './types';

const opts = (gear?: boolean): CreateRunOptions => ({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear });
const gearRun = () => createRun(opts(true));
const buy = (s: GameState, gear: keyof typeof GEAR) => applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear });
const sell = (s: GameState, index: number) => applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'sell', index });

describe('Gear Tree G2: the sim', () => {
  it('off by default: a run without the flag is identical to before (no gear fields)', () => {
    const a = createRun(opts());
    expect(a.gear).toBeUndefined();
    expect(a.slotGear).toBeUndefined();
    expect(a.cash).toBe(100);
    expect(a.stations.some((st) => st.gear)).toBe(false);
    expect(JSON.stringify(createRun(opts(false)))).toBe(JSON.stringify(a));
  });

  it('a Gear run starts with $120, no supplies, and only a cardboard box in the last slot', () => {
    const s = gearRun();
    expect([s.gear, s.cash, s.startingCash, s.phase, s.day]).toEqual([true, 120, 120, 'night', 1]);
    expect(Object.values(s.supplies).every((n) => n === 0)).toBe(true);
    expect(s.slots).toEqual([null, null, null, 'trash']);
    expect(s.slotGear).toEqual([null, null, null, 'b0']);
    expect(s.stations.filter((x) => x.kind !== 'counter').map((x) => x.gear)).toEqual(['b0']);
  });

  it('buy fills the first empty slot; upgrade replaces in place with a trade-in; sell refunds', () => {
    const s = gearRun();
    buy(s, 'c1');
    expect(s.slotGear).toEqual(['c1', null, null, 'b0']);
    expect(s.cash).toBe(115);
    buy(s, 'g1');
    buy(s, 'c2'); // trade in the sock ($0) for jars ($25)
    expect(s.slotGear).toEqual(['c2', 'g1', null, 'b0']);
    expect(s.cash).toBe(120 - 5 - 12 - 25);
    buy(s, 'c1'); // a lower tier than owned: nothing
    expect(s.slotGear).toEqual(['c2', 'g1', null, 'b0']);
    sell(s, 1);
    expect(s.slotGear).toEqual(['c2', null, null, 'b0']);
    expect(s.cash).toBe(120 - 5 - 12 - 25 + 2);
    expect(s.stations.find((x) => x.kind === 'coldBrewTap')?.gear).toBe('c2');
    expect(s.gearLog?.map((e) => `${e.action}:${e.gear}`)).toEqual(['buy:c1', 'buy:g1', 'sell:c1', 'buy:c2', 'sell:g1']);
  });

  it('cannot buy without the cash (trade-in counts) or without a free slot', () => {
    const s = gearRun();
    s.cash = 10;
    buy(s, 'g1');
    expect(s.slotGear).toEqual([null, null, null, 'b0']);
    s.cash = 1000;
    buy(s, 'c1');
    buy(s, 'g1');
    buy(s, 'd1');
    const before = s.cash;
    buy(s, 'e2'); // stand has 4 slots, all full
    expect(s.cash).toBe(before);
    expect(s.slotGear).toEqual(['c1', 'g1', 'd1', 'b0']);
  });

  it('day only, bots and strangers: nothing happens; classic equip/slot do nothing in a Gear run', () => {
    const s = gearRun();
    s.phase = 'day';
    buy(s, 'c1');
    expect(s.cash).toBe(120);
    s.phase = 'night';
    applyGearInput(s, { kind: 'gear', playerId: 'nobody', action: 'buy', gear: 'c1' });
    expect(s.cash).toBe(120);
    applyEquipInput(s, { kind: 'equip', playerId: 'p1', station: 'espresso' });
    applySlotInput(s, { kind: 'slot', playerId: 'p1', index: 3, station: null });
    expect([s.cash, s.slots]).toEqual([120, [null, null, null, 'trash']]);
  });

  it('the gear input is validated and runs through step', () => {
    expect(validateInput({ kind: 'gear', playerId: 'p1', action: 'buy', gear: 'nope' } as never)).toBeNull();
    expect(validateInput({ kind: 'gear', playerId: 'p1', action: 'sell', index: 1.5 } as never)).toBeNull();
    const s = gearRun();
    const after = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: 'c1' }]);
    expect(after.slotGear?.[0]).toBe('c1');
  });

  it('a classic run ignores the gear input', () => {
    const s = createRun(opts());
    buy(s, 'c1');
    expect([s.cash, s.slotGear]).toEqual([100, undefined]);
  });

  it('cheap gear is slower and marks the cup; today-tier gear runs at today\'s speed', () => {
    const time = (gear: 'g1' | 'g2') => {
      const s = gearRun();
      buy(s, gear);
      s.supplies.beans = 5;
      startDay(s);
      const st = s.stations.find((x) => x.kind === 'grinder')!;
      s.players[0].pos = { ...st.pos, y: st.pos.y + 1 };
      interact(s, 'p1');
      return st.busyTicksLeft;
    };
    expect(time('g1')).toBeGreaterThan(time('g2'));
    const s = gearRun();
    buy(s, 'c1');
    s.supplies.concentrate = 5;
    startDay(s);
    const tap = s.stations.find((x) => x.kind === 'coldBrewTap')!;
    s.players[0].pos = { ...tap.pos, y: tap.pos.y + 1 };
    interact(s, 'p1');
    expect(s.players[0].cupSlips).toBe(GEAR.c1.marks); // the tap pours at once: the lint is on the cup in hand
  });

  it('cold brew batch caps: sold out after the day\'s batch, refilled next morning', () => {
    const s = gearRun();
    buy(s, 'c1');
    s.supplies.concentrate = 50;
    startDay(s);
    const tap = s.stations.find((x) => x.kind === 'coldBrewTap')!;
    expect(tap.batchLeft).toBe(8);
    expect(availableDrinks(s)).toContain('coldBrew');
    tap.batchLeft = 0;
    expect(batchOut(s)).toBe(true);
    expect(availableDrinks(s)).not.toContain('coldBrew');
    expect(reasonOff(s, 'coldBrew')).toBe('noStock');
    s.players[0].pos = { ...tap.pos, y: tap.pos.y + 1 };
    interact(s, 'p1');
    expect([tap.busyTicksLeft, s.supplies.concentrate]).toEqual([0, 42]); // the morning steeped 8 of the 50; the empty tap pours nothing
    gearMorning(s);
    expect(tap.batchLeft).toBe(8);
  });

  it('growing keeps the gear and adds empty slots', () => {
    const s = gearRun();
    buy(s, 'c1');
    s.cash = 500;
    applyGrowInput(s, { kind: 'grow', playerId: 'p1', tier: 'cart' });
    expect(s.tier).toBe('cart');
    expect(s.slotGear).toEqual(['c1', null, null, 'b0', null]);
    expect(s.stations.filter((x) => x.kind !== 'counter').map((x) => x.gear)).toEqual(['c1', 'b0']);
  });

  it('a Gear run survives a JSON round trip (saves and snapshots)', () => {
    const s = gearRun();
    buy(s, 'c1');
    const back = JSON.parse(JSON.stringify(s)) as GameState;
    expect(back.slotGear).toEqual(s.slotGear);
    expect(back.stations.find((x) => x.kind === 'coldBrewTap')?.gear).toBe('c1');
  });
});
