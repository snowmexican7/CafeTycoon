/**
 * Where the stand's drip machine and the tray table draw, in pixels from each tile's centre
 * (y grows downward). The drip sits one tile south of the tray, at (1, 5) on the stand, and a
 * machine that tall used to cover the TRAY sign and the bottom of the tray board. These boxes
 * are what the station art actually draws, so a test can check they stay apart.
 */
export interface ArtBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The tray table's wooden board. */
export const TRAY_BOARD: ArtBox = { x: -28, y: -32, w: 56, h: 20 };

/**
 * The TRAY nameplate, centred just above the board. The usual plate hangs under the counter, which
 * is exactly where the drip's table and carafe are drawn, and a sign to the right sits under the
 * name of whoever is working the drip.
 */
export const TRAY_PLATE: ArtBox = { x: -26, y: -54, w: 52, h: 18 };

/** The drip machine's top tank. Tucked below a fixture one tile north (the tray board ends at y -12). */
export const DRIP_RESERVOIR: ArtBox = { x: -22, y: -72, w: 44, h: 14 };

/** The drip machine's right-hand column. */
export const DRIP_COLUMN: ArtBox = { x: 10, y: -70, w: 12, h: 48 };

/** A stand folding-table top, from the drip's tile centre. Wide enough to hide a nameplate under it. */
export const DRIP_TABLE: ArtBox = { x: -33, y: -30, w: 66, h: 48 };

const TILE = 64;

export function overlaps(a: ArtBox, b: ArtBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function south(box: ArtBox): ArtBox {
  return { ...box, y: box.y + TILE };
}

/**
 * True when a drip one tile south of the tray covers the TRAY nameplate or the tray board.
 * The stand seats its drip there; the cart and the café do not stack those two.
 */
export function dripCoversTray(): boolean {
  const blockers = [DRIP_RESERVOIR, DRIP_COLUMN, DRIP_TABLE].map(south);
  return blockers.some((b) => overlaps(b, TRAY_BOARD) || overlaps(b, TRAY_PLATE));
}
