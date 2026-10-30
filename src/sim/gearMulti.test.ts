import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { applyGearInput } from './gear';
import type { CreateRunOptions, GameState } from './types';
import type { GearId } from '../data/gear';

const opts: CreateRunOptions = { seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear: true };
const buy = (s: GameState, gear: GearId) => applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear });

describe('Gear G4e: buy multiples of the same machine', () => {
  it('a second copy goes into a free slot, both work on the day, and old upgrade rules still hold', () => {
    const s = createRun(opts);
    s.cash = 500;
    buy(s, 'e1');
    buy(s, 'e1');
    expect((s.slotGear ?? []).filter((g) => g === 'e1').length).toBe(2);
    startDay(s);
    expect(s.stations.filter((x) => x.gear === 'e1').length).toBe(2);
  });
  it('no free slot: buying the same again does nothing; a lower tier still does nothing; a higher tier upgrades one copy', () => {
    const s = createRun(opts);
    s.cash = 1000;
    buy(s, 'c2'); buy(s, 'c2'); buy(s, 'c2');
    const full = [...(s.slotGear ?? [])];
    const cash = s.cash;
    buy(s, 'c2');
    expect([s.slotGear, s.cash]).toEqual([full, cash]);
    buy(s, 'c1');
    expect(s.slotGear).toEqual(full);
    buy(s, 'c3');
    expect((s.slotGear ?? []).filter((g) => g === 'c3').length).toBe(1);
    expect((s.slotGear ?? []).filter((g) => g === 'c2').length).toBe(2);
  });
});
