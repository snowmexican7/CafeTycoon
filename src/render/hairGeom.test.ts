import { describe, expect, it } from 'vitest';
import { HAIR_STYLES } from './lookModel';
import { allFrontHairGeom, CROWN_RY, HEAD, HEAD_TOP, frontHairGeom } from './hairGeom';

describe('Round 5: hairline geometry', () => {
  it('HEAD.top is the skull crown and CROWN_RY bridges hairline to top', () => {
    expect(HEAD_TOP).toBe(HEAD.cy - HEAD.r);
    expect(HEAD_TOP).toBe(-75);
    expect(HEAD.hairline).toBe(-62);
    expect(CROWN_RY).toBe(HEAD.hairline - HEAD_TOP);
    expect(CROWN_RY).toBeGreaterThan(0);
  });

  it('every style × facing reaches the head top and the shared hairline', () => {
    expect(HAIR_STYLES).toHaveLength(8);
    const all = allFrontHairGeom();
    expect(all).toHaveLength(16);
    for (const g of all) {
      expect(g.top).toBe(HEAD_TOP);
      expect(g.hairline).toBe(HEAD.hairline);
      expect(g.top).toBeLessThan(g.hairline);
      expect(g.rx).toBeGreaterThan(10);
      expect(frontHairGeom(g.style, g.facing)).toEqual(g);
    }
  });
});
