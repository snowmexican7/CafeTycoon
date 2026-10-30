import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { applyGearInput, gearPriceMul, podsCoverGrinder } from './gear';
import { canMake } from './growth';
import { computeModifiers } from './effects';
import { interact } from './stations';
import { reasonOff } from './slots';
import { GEAR, type GearId } from '../data/gear';
import { TICK_RATE } from './constants';
import type { CreateRunOptions, GameState } from './types';

const opts = (gear?: boolean): CreateRunOptions => ({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear });
const buy = (s: GameState, gear: GearId) => applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear });
const at = (s: GameState, kind: string) => {
  const st = s.stations.find((x) => x.kind === kind)!;
  s.players[0].pos = { ...st.pos, y: st.pos.y + 1 };
  return st;
};

describe('Gear Tree G4: pods and price multipliers', () => {
  it('the Pod-o-Matic makes a shot from empty hands (uses a pod = beans), slow and marked, no grinder', () => {
    const s = createRun(opts(true));
    buy(s, 'e1');
    expect(s.cash).toBe(75);
    expect(podsCoverGrinder(s)).toBe(true);
    expect(canMake(s, 'espresso')).toBe(true);
    s.supplies.beans = 3;
    expect(reasonOff(s, 'espresso')).toBe(null);
    startDay(s);
    const st = at(s, 'espresso');
    interact(s, 'p1');
    expect(st.making).toBe('espresso');
    expect(s.supplies.beans).toBe(2);
    expect(st.cupSlips).toBe(GEAR.e1.marks);
    expect(st.busyTicksLeft).toBe(6 * TICK_RATE); // 6 s, slower than today's 5 s shot
  });

  it('the Pod-o-Matic refuses grounds and does nothing with no pods', () => {
    const s = createRun(opts(true));
    buy(s, 'e1');
    startDay(s);
    const st = at(s, 'espresso');
    interact(s, 'p1');
    expect(st.making ?? null).toBe(null);
    s.players[0].holding = 'grounds';
    s.supplies.beans = 3;
    interact(s, 'p1');
    expect([st.making ?? null, s.players[0].holding]).toEqual([null, 'grounds']);
  });

  it('a classic espresso machine still needs a grinder in a Gear run', () => {
    const s = createRun(opts(true));
    buy(s, 'e2');
    expect(podsCoverGrinder(s)).toBe(false);
    expect(canMake(s, 'espresso')).toBe(false);
  });

  it('price multipliers: pods ×0.85 on espresso drinks, the tower ×1.25 on cold brew, none on classic runs', () => {
    const s = createRun(opts(true));
    s.cash = 2000;
    buy(s, 'e1');
    expect(gearPriceMul(s, 'espresso')).toBe(0.85);
    expect(gearPriceMul(s, 'latte')).toBe(0.85);
    expect(gearPriceMul(s, 'coldBrew')).toBe(1);
    buy(s, 'e6');
    expect(gearPriceMul(s, 'espresso')).toBe(1.2);
    buy(s, 'c5');
    expect(gearPriceMul(s, 'coldBrew')).toBe(1.25);
    const classic = createRun(opts());
    expect(gearPriceMul(classic, 'espresso')).toBe(1);
    const base = computeModifiers(classic).price.espresso;
    expect(computeModifiers(s).price.espresso).toBeCloseTo(base * 1.2, 6);
  });
});
