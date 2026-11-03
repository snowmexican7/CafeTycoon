/**
 * Round 5 block 1: shared head / hairline numbers for every hairstyle.
 * Front hair must cover the crown (HEAD.top) down to HEAD.hairline, both facings.
 */
import type { Facing } from './theme';
import type { HairStyle } from './lookModel';
import { HAIR_STYLES } from './lookModel';

/** Head circle in `drawPerson` local space (feet at 0,0). */
export const HEAD = {
  cx: 0,
  cy: -58,
  r: 17,
  /** Forehead line where the front crown fill ends (above the eyes at y≈-53). */
  hairline: -62,
} as const;

/** Top of the skull (cy − r). Every style's front hair must reach this. */
export const HEAD_TOP = HEAD.cy - HEAD.r;

export interface FrontHairGeom {
  style: HairStyle;
  facing: Facing;
  /** Highest y of the crown fill (must equal HEAD_TOP). */
  top: number;
  /** Lowest y of the crown fill on the forehead (must equal HEAD.hairline). */
  hairline: number;
  /** Half-width of the crown fill. */
  rx: number;
}

/** Crown ellipse height so a half-dome from `hairline` reaches `HEAD_TOP`. */
export const CROWN_RY = HEAD.hairline - HEAD_TOP;

/** Pure geometry for one style × facing — used by the drawer and by tests. */
export function frontHairGeom(style: HairStyle, facing: Facing): FrontHairGeom {
  // Every style shares the same crown coverage; style extras (spikes, bun, bangs) sit on top of it.
  const rx = facing === 'down' ? (style === 'buzz' ? 16.5 : 17) : 17;
  return { style, facing, top: HEAD_TOP, hairline: HEAD.hairline, rx };
}

/** All 8 styles × both facings — the accept grid for Round 5 block 1. */
export function allFrontHairGeom(): FrontHairGeom[] {
  const out: FrontHairGeom[] = [];
  for (const { value } of HAIR_STYLES) {
    out.push(frontHairGeom(value, 'down'), frontHairGeom(value, 'up'));
  }
  return out;
}
