import { describe, expect, it } from 'vitest';
import { FRIDGE } from '../sim/fridge';
import { milkShelfLevel, milkShelfParts } from './supplyModel';

describe('milk counter shelf', () => {
  it('reads empty, low, partial and full from the servings on the counter', () => {
    expect(milkShelfLevel(undefined)).toBe('empty');
    expect(milkShelfLevel(0)).toBe('empty');
    expect(milkShelfLevel(-3)).toBe('empty');
    expect(milkShelfLevel(1)).toBe('low');
    expect(milkShelfLevel(2)).toBe('low');
    expect(milkShelfLevel(3)).toBe('partial');
    expect(milkShelfLevel(FRIDGE.carton - 1)).toBe('partial');
    expect(milkShelfLevel(FRIDGE.carton)).toBe('full');
    expect(milkShelfLevel(FRIDGE.carton + 6)).toBe('full');
  });

  it('draws less on the shelf as the stock drops', () => {
    expect(milkShelfParts('full')).toEqual({ jug: 'full', cartons: 2, short: false });
    expect(milkShelfParts('partial')).toEqual({ jug: 'half', cartons: 1, short: false });
    expect(milkShelfParts('low')).toEqual({ jug: 'none', cartons: 1, short: true });
    expect(milkShelfParts('empty')).toEqual({ jug: 'none', cartons: 0, short: false });
    expect(milkShelfParts('full').cartons).toBeGreaterThan(milkShelfParts('partial').cartons);
    expect(milkShelfParts('low').short).toBe(true);
  });
});
