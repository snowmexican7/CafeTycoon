import type { StationKind } from '../sim/types';

/**
 * Render-only design tokens for the "toy café diorama" look. Same names as src/ui/theme.css.
 *
 * Geometry: the sim grid is unchanged (LAYOUT tiles, TILE px each). The renderer adds a wall band
 * above the floor and a front margin below it, so a sim position maps to the screen as
 *   screenX = simX * TILE,  screenY = WALL + simY * TILE.
 * Any future pointer/mouse code must subtract WALL before converting back to tiles.
 */
export const TILE = 64;
export const WALL = 120;
export const FRONT = 56;

export const sx = (tilesX: number) => tilesX * TILE;
export const sy = (tilesY: number) => WALL + tilesY * TILE;

export const PALETTE = {
  espresso: 0x3a2418,
  espresso2: 0x4e3324,
  roast: 0x6b4430,
  crema: 0xfff4e2,
  latte: 0xf3dfc1,
  foam: 0xfffaf2,
  caramel: 0xe08a3c,
  caramelDk: 0xb9651f,
  honey: 0xf6c35b,
  cherry: 0xe0564a,
  mint: 0x7fcfb4,
  mintDk: 0x3f9e80,
  sky: 0x9fd0ee,
  plum: 0x8a6bbf,
  night: 0x241c35,
  night2: 0x33294a,
  lamp: 0xffcf7a,
  good: 0x4fae7b,
  warn: 0xf0a63a,
  bad: 0xe0564a,
} as const;

/** Scene materials (wood, wall, tiles, chrome). */
export const MAT = {
  backdrop: 0x2b1d14,
  wall: 0xf6e2c4,
  wallStripe: 0xefd5b0,
  wainscot: 0x9b6743,
  wainscotDk: 0x7b4c2f,
  trim: 0x6e4129,
  planks: [0xd7a874, 0xcf9e69, 0xdcb07d],
  seam: 0xb98654,
  tileA: 0xf4e6cf,
  tileB: 0xd98f6a,
  cab: 0x8e5b3a,
  cabDk: 0x6f4229,
  top: 0xf1e9de,
  topEdge: 0xd9cbb8,
  chrome: 0xdfe6ea,
  chromeDk: 0x9aa7ae,
  shadow: 0x2a1608,
  chalk: 0x2f3b36,
  frame: 0x8b5a3a,
} as const;

export const RADII = { sm: 10, md: 16, lg: 24 } as const;

export const FONT_DISPLAY = 'Fredoka, system-ui, sans-serif';
export const FONT_BODY = 'Nunito, system-ui, sans-serif';

/** Barista cap/name-tag colours, by join order (the sim does not assign colours). */
export const PLAYER_COLORS = [0xe0564a, 0x4c8fd6, 0x4fae7b, 0x8a6bbf] as const;

export const STATION_LABELS: Record<StationKind, string> = {
  grinder: 'GRINDER',
  espresso: 'ESPRESSO',
  steamer: 'STEAMER',
  coldBrewTap: 'COLD BREW',
  trash: 'TRASH',
  counter: 'PICK-UP',
};

/** Where each station's progress bar floats (px above the station centre). */
export const PROGRESS_BAR_RISE: Record<StationKind, number> = {
  grinder: 116,
  espresso: 92,
  steamer: 98,
  coldBrewTap: 104,
  trash: 60,
  counter: 70,
};

/** Patience ring colour: green → amber → red. */
export function patienceColor(frac: number): number {
  if (frac > 0.55) return PALETTE.good;
  if (frac > 0.28) return PALETTE.warn;
  return PALETTE.bad;
}

const SHIRTS = [0x8a6bbf, 0xf6c35b, 0x7fcfb4, 0xe98aa6, 0x9fd0ee, 0xe08a3c, 0x6fae8f, 0xc7a2e0];
const HAIRS = [0x3b2a20, 0x7a4a2a, 0xd8a35a, 0x2b1a12, 0xa2502c, 0x5c3a26];
const SKINS = [0xf2c6a0, 0xe8b896, 0xc98d62, 0x9c6a48, 0xf6d2b4, 0x7a4f35];

/** A stable look for a customer, derived from its id. */
export function customerLook(id: number): { shirt: number; hair: number; skin: number } {
  const h = Math.imul(id + 1, 2654435761) >>> 0;
  return { shirt: SHIRTS[h % SHIRTS.length], hair: HAIRS[(h >>> 8) % HAIRS.length], skin: SKINS[(h >>> 16) % SKINS.length] };
}

/** A stable skin/hair for a barista, derived from its join index. */
export function baristaLook(index: number): { cap: number; skin: number; hair: number } {
  return {
    cap: PLAYER_COLORS[index % PLAYER_COLORS.length],
    skin: SKINS[(index * 2) % SKINS.length],
    hair: HAIRS[(index * 3 + 3) % HAIRS.length],
  };
}

/** Night-ish phases get the lamp-lit tint. */
export function isNightLook(phase: string): boolean {
  return phase !== 'day' && phase !== 'closing';
}

export type Facing = 'up' | 'down';

/** Which way a barista looks: the last vertical direction it moved in (pure left/right keeps the old facing). */
export function nextFacing(prev: Facing, moveDir: { x: number; y: number }): Facing {
  if (moveDir.y < 0) return 'up';
  if (moveDir.y > 0) return 'down';
  return prev;
}
