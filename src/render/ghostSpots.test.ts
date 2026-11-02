import { describe, expect, it } from 'vitest';
import { GHOST_NEAR, ghostSpotKey, rankGhostSpots } from './ghostSpots';

describe('ghostSpotKey (FB2 C10)', () => {
  it('is stable for the same spots and empty for null', () => {
    expect(ghostSpotKey(null)).toBe('');
    expect(ghostSpotKey([])).toBe('');
    expect(ghostSpotKey([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toBe('1,2|3,4');
    expect(ghostSpotKey([{ x: 1, y: 2 }])).not.toBe(ghostSpotKey([{ x: 2, y: 1 }]));
  });

  it('ui-3.8.0: includes the barista tile when ranking from a position', () => {
    expect(ghostSpotKey([{ x: 1, y: 1 }], { x: 2, y: 2 })).toContain('@');
    expect(ghostSpotKey([{ x: 1, y: 1 }], { x: 2, y: 2 })).not.toBe(ghostSpotKey([{ x: 1, y: 1 }], { x: 9, y: 9 }));
  });
});

describe('rankGhostSpots (ui-3.8.0 polish)', () => {
  it('puts the nearest tiles first and keeps GHOST_NEAR small', () => {
    expect(GHOST_NEAR).toBe(8);
    const ranked = rankGhostSpots(
      [
        { x: 5, y: 5 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
      { x: 1.2, y: 1.1 },
    );
    expect(ranked[0]).toEqual({ x: 1, y: 1 });
    expect(ranked[1]).toEqual({ x: 2, y: 2 });
    expect(ranked[2]).toEqual({ x: 5, y: 5 });
  });
});
