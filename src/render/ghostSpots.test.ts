import { describe, expect, it } from 'vitest';
import { ghostSpotKey } from './ghostSpots';

describe('ghostSpotKey (FB2 C10)', () => {
  it('is stable for the same spots and empty for null', () => {
    expect(ghostSpotKey(null)).toBe('');
    expect(ghostSpotKey([])).toBe('');
    expect(ghostSpotKey([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toBe('1,2|3,4');
    expect(ghostSpotKey([{ x: 1, y: 2 }])).not.toBe(ghostSpotKey([{ x: 2, y: 1 }]));
  });
});
