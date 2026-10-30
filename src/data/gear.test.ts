import { describe, expect, it } from 'vitest';
import { GEAR, GEAR_IDS, GEAR_START, GEAR_TREES, isGearId, treeTiers } from './gear';
import { stationsFromSlots } from '../sim/slots';

describe('gear data (Gear Tree G1)', () => {
  it('every tier is consistent: ids match, sell below price, prices rise up each tree', () => {
    for (const id of GEAR_IDS) {
      const x = GEAR[id];
      expect(x.id).toBe(id);
      expect(x.sell).toBeLessThanOrEqual(x.price);
      expect(x.speed).toBeGreaterThan(0);
    }
    for (const t of GEAR_TREES) {
      const tiers = treeTiers(t.id);
      expect(tiers.length).toBeGreaterThan(0);
      for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i].tier).toBeGreaterThan(tiers[i - 1].tier);
        expect(tiers[i].price).toBeGreaterThan(tiers[i - 1].price);
        expect(tiers[i].station).toBe(tiers[0].station);
      }
    }
  });
  it('the "today" tiers match today\'s machines (speed 1, no marks)', () => {
    for (const id of ['e3', 'g2', 's3', 'c4', 'b0'] as const) expect([GEAR[id].speed, GEAR[id].marks]).toEqual([1, 0]);
  });
  it('every cold brew tier has a batch cap (the kegerator and the tower steep 60)', () => {
    expect(GEAR_IDS.filter((id) => GEAR[id].batch !== undefined)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
    expect([GEAR.c4.batch, GEAR.c5.batch]).toEqual([60, 60]);
  });
  it('isGearId and the start', () => {
    expect(isGearId('e2')).toBe(true);
    expect(isGearId('e1')).toBe(true); // G4: the Pod-o-Matic
    expect(isGearId('e0')).toBe(false);
    expect(isGearId('toString')).toBe(false);
    expect(GEAR_START.cash).toBe(120);
  });
  it('stationsFromSlots tags stations with their gear only when given', () => {
    const plain = stationsFromSlots('stand', ['grinder', 'espresso', null, 'trash']);
    expect(plain.some((s) => 'gear' in s)).toBe(false);
    const tagged = stationsFromSlots('stand', ['grinder', 'espresso', null, 'trash'], ['g1', 'e2', null, 'b0']);
    expect(tagged.filter((s) => s.kind !== 'counter').map((s) => s.gear)).toEqual(['g1', 'e2', 'b0']);
  });
});
