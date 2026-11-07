import { describe, expect, it } from 'vitest';
import { HAIR_STYLES } from './lookModel';
import { allFrontHairGeom, CROWN_RY, HAIR_FILL_ALPHA, HEAD, HEAD_TOP, frontHairGeom } from './hairGeom';

describe('Round 5/6: hairline + opaque crown geometry', () => {
  it('HEAD.top is the skull crown and CROWN_RY bridges hairline to top', () => {
    expect(HEAD_TOP).toBe(HEAD.cy - HEAD.r);
    expect(HEAD_TOP).toBe(-75);
    expect(HEAD.hairline).toBe(-62);
    expect(CROWN_RY).toBe(HEAD.hairline - HEAD_TOP);
    expect(CROWN_RY).toBeGreaterThan(0);
  });

  it('every style × facing reaches the head top and the shared hairline', () => {
    expect(HAIR_STYLES.map((h) => h.value)).toContain('wavy');
    expect(HAIR_STYLES.find((h) => h.value === 'wavy')?.name).toBe('Long wavy');
    expect(HAIR_STYLES.find((h) => h.value === 'long')?.name).toBe('Long straight');
    expect(HAIR_STYLES).toHaveLength(9);
    const all = allFrontHairGeom();
    expect(all).toHaveLength(18);
    for (const g of all) {
      expect(g.top).toBe(HEAD_TOP);
      expect(g.hairline).toBe(HEAD.hairline);
      expect(g.top).toBeLessThan(g.hairline);
      expect(g.rx).toBeGreaterThan(10);
      expect(frontHairGeom(g.style, g.facing)).toEqual(g);
    }
  });

  it('every style seals the full head disk with an opaque under-cap (no see-through)', () => {
    expect(HAIR_FILL_ALPHA).toBe(1);
    for (const g of allFrontHairGeom()) {
      expect(g.underCap.cx).toBe(HEAD.cx);
      expect(g.underCap.cy).toBe(HEAD.cy);
      expect(g.underCap.r).toBe(HEAD.r);
      expect(g.underCap.alpha).toBe(1);
      // Cap covers the skull crown: its top reaches HEAD_TOP.
      expect(g.underCap.cy - g.underCap.r).toBe(HEAD_TOP);
    }
  });
});
