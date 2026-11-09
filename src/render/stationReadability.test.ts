import { describe, expect, it } from 'vitest';
import { DRIP_RESERVOIR, TRAY_BOARD, TRAY_PLATE, dripCoversTray, overlaps } from './stationReadability';

describe('stand drip and the tray table', () => {
  it('the TRAY sign sits above the board, not on it', () => {
    expect(overlaps(TRAY_PLATE, TRAY_BOARD)).toBe(false);
    expect(TRAY_PLATE.y + TRAY_PLATE.h).toBeLessThanOrEqual(TRAY_BOARD.y);
  });

  it('a drip one tile south does not cover the TRAY sign or the tray board', () => {
    expect(dripCoversTray()).toBe(false);
    // The tank used to start 80px above the drip's centre, which reached into the board.
    expect(DRIP_RESERVOIR.y).toBeGreaterThanOrEqual(-72);
  });
});
