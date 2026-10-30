import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { interact } from './stations';
import { stationsFromSlots, reasonOff } from './slots';
import { availableDrinks } from './customers';
import { applyGearInput } from './gear';
import { GEAR, type GearId } from '../data/gear';
import type { GameState, SupplyId } from './types';

/** A Gear stand at night with `gear` in the first slots (the free bin stays in the last). */
function gearNight(gear: GearId[], supplies: Partial<Record<SupplyId, number>> = {}): GameState {
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
  Object.assign(s.supplies, supplies);
  return s;
}
const gearDay = (gear: GearId[], supplies: Partial<Record<SupplyId, number>> = {}) => startDay(gearNight(gear, supplies));
const stand = (s: GameState, id: string) => {
  const st = s.stations.find((x) => x.id === id)!;
  s.players[0].pos = { ...st.pos, y: st.pos.y + 1 };
  s.players[0].tile = { x: st.pos.x, y: st.pos.y + 1 };
};
const tapOf = (s: GameState) => s.stations.find((x) => x.kind === 'coldBrewTap')!;

describe('instant cold brew from the steeped tap (Task 3)', () => {
  it('one press pours a cold brew at once, no concentrate, the C1 lint on the cup', () => {
    const s = gearDay(['c1'], { concentrate: 10 });
    const tap = tapOf(s);
    tap.batchLeft = 8;
    s.supplies.concentrate = 0;
    stand(s, tap.id);
    interact(s, 'p1');
    expect([s.players[0].holding, s.players[0].cupSlips, tap.busyTicksLeft, tap.batchLeft]).toEqual(['coldBrew', 1, 0, 7]);
    expect(availableDrinks(s)).toContain('coldBrew');
  });

  it("yesterday's cups pour first", () => {
    const s = gearDay(['c2'], { concentrate: 10 });
    const tap = tapOf(s);
    tap.batchLeft = 5;
    tap.batchOld = 2;
    stand(s, tap.id);
    const olds: (number | undefined)[] = [];
    for (let i = 0; i < 3; i++) {
      s.players[0].holding = null;
      interact(s, 'p1');
      expect(s.players[0].holding).toBe('coldBrew');
      olds.push(tap.batchOld);
    }
    expect(olds).toEqual([1, undefined, undefined]);
    expect(tap.batchLeft).toBe(2);
    expect('batchOld' in tap).toBe(false);
  });

  it('an empty tap pours nothing and sells out every tap drink', () => {
    const s = gearDay(['c1', 'e1', 's1'], { concentrate: 50, beans: 50, milk: 50, flavour: 50 });
    s.unlocked = ['espresso', 'latte', 'coldBrew', 'icedLatte', 'sweetCream', 'special'];
    for (const d of s.unlocked) s.menu[d] = true;
    const tap = tapOf(s);
    expect(availableDrinks(s)).toEqual(expect.arrayContaining(['coldBrew', 'icedLatte', 'sweetCream', 'special']));
    tap.batchLeft = 0;
    stand(s, tap.id);
    interact(s, 'p1');
    expect(s.players[0].holding).toBeNull();
    const out = availableDrinks(s);
    for (const d of ['coldBrew', 'icedLatte', 'sweetCream', 'special'] as const) expect(out).not.toContain(d);
    expect(out).toContain('espresso');
    expect(reasonOff(s, 'icedLatte')).toBe('noStock');
    expect(reasonOff(s, 'espresso')).toBeNull();
  });

  it('the iced latte step takes a steeped cup; the sweet-cream step does not', () => {
    const s = gearDay(['c1', 'e1', 's1'], { concentrate: 50, beans: 50, milk: 5, flavour: 5 });
    s.unlocked = ['espresso', 'latte', 'coldBrew', 'icedLatte', 'sweetCream', 'special'];
    for (const d of s.unlocked) s.menu[d] = true;
    const tap = tapOf(s);
    stand(s, tap.id);
    tap.batchLeft = 1;
    s.players[0].holding = 'espresso';
    interact(s, 'p1');
    expect([tap.batchLeft, tap.busyTicksLeft > 0, tap.making, s.players[0].holding]).toEqual([0, true, 'icedLatte', null]);
    // sweet cream: a cup already in hand, none left in the tap
    const t2 = gearDay(['c1', 'e1', 's1'], { concentrate: 50, beans: 50, milk: 5, flavour: 5 });
    t2.unlocked = ['espresso', 'latte', 'coldBrew', 'icedLatte', 'sweetCream', 'special'];
    for (const d of t2.unlocked) t2.menu[d] = true;
    const tap2 = tapOf(t2);
    stand(t2, tap2.id);
    tap2.batchLeft = 0;
    t2.players[0].holding = 'coldBrew';
    interact(t2, 'p1');
    expect([tap2.batchLeft, tap2.busyTicksLeft > 0, tap2.making, t2.players[0].holding]).toEqual([0, true, 'sweetCream', null]);
    // an espresso with no cup left to pour over: refused
    const t3 = gearDay(['c1', 'e1', 's1'], { concentrate: 50, beans: 50, milk: 5, flavour: 5 });
    t3.unlocked = ['espresso', 'latte', 'coldBrew', 'icedLatte', 'sweetCream', 'special'];
    for (const d of t3.unlocked) t3.menu[d] = true;
    const tap3 = tapOf(t3);
    stand(t3, tap3.id);
    tap3.batchLeft = 0;
    t3.players[0].holding = 'espresso';
    interact(t3, 'p1');
    expect([tap3.busyTicksLeft, t3.players[0].holding]).toEqual([0, 'espresso']);
  });

  it('classic taps still brew for 1.5 s and use concentrate', () => {
    const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
    s.supplies.concentrate = 5;
    startDay(s);
    const tap = tapOf(s);
    stand(s, tap.id);
    interact(s, 'p1');
    expect([tap.busyTicksLeft, s.supplies.concentrate, s.players[0].holding]).toEqual([90, 4, null]);
  });

  it('a drip pot pours a cup on every press, no waiting', () => {
    const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear: true });
    s.cash = 500;
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'd1' });
    startDay(s);
    const pot = s.stations.find((x) => x.kind === 'drip')!;
    pot.potLeft = 4;
    pot.output = 'drip';
    stand(s, pot.id);
    const left: (number | undefined)[] = [];
    for (let i = 0; i < 4; i++) {
      s.players[0].holding = null;
      interact(s, 'p1');
      expect(s.players[0].holding).toBe('drip');
      left.push(pot.potLeft);
      s.tick += 1;
    }
    expect(left).toEqual([3, 2, 1, undefined]);
  });
});
