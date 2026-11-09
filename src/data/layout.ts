import type { StationKind, TierId, Vec2 } from '../sim/types';

/** Café floor in tiles. Positions are tile centres; a station occupies the unit square around its centre. */
export const LAYOUT: {
  width: number;
  height: number;
  stations: { id: string; kind: StationKind; pos: Vec2 }[];
  spawnPoints: Vec2[];
  door: Vec2;
  queueSlots: Vec2[];
  mopHome: Vec2;
  rogueStart: Vec2;
} = {
  width: 12,
  height: 8,
  stations: [
    { id: 'grinder', kind: 'grinder', pos: { x: 1, y: 1 } },
    { id: 'espresso', kind: 'espresso', pos: { x: 3, y: 1 } },
    { id: 'steamer', kind: 'steamer', pos: { x: 5, y: 1 } },
    { id: 'coldBrewTap', kind: 'coldBrewTap', pos: { x: 8, y: 1 } },
    { id: 'trash', kind: 'trash', pos: { x: 10, y: 1 } },
    { id: 'counter', kind: 'counter', pos: { x: 6, y: 6 } },
  ],
  spawnPoints: [
    { x: 6, y: 4 },
    { x: 5, y: 4 },
    { x: 7, y: 4 },
    { x: 6, y: 3 },
  ],
  door: { x: 1, y: 6 },
  queueSlots: [
    { x: 6, y: 7.6 },
    { x: 7, y: 7.6 },
    { x: 8, y: 7.6 },
    { x: 9, y: 7.6 },
    { x: 10, y: 7.6 },
    { x: 11, y: 7.6 },
    // P3 B12: the kiosk's waiting spot, left of the counter.
    { x: 5, y: 7.6 },
  ],
  mopHome: { x: 11, y: 7 },
  rogueStart: { x: 6, y: 7 },
};

/** Batch/pickup: the ids of the two Gear-run counter spots beside the till (which keeps the id `counter`). */
export const PICKUP_ID = 'pickup';
export const CONDIMENTS_ID = 'condiments';
/** FB2 A4: the fridge's id (a counter-kind spot of every Gear shop; its tier is `GameState.fridge`). */
export const FRIDGE_ID = 'fridge';
/** FB2 A3: the back sink (Gear runs), a fixed counter-kind spot like the condiment bar. */
export const SINK_ID = 'sink';
/** FB2 B7: the tray table (Gear runs), a fixed counter-kind spot like the sink, where multi-drink tickets are batched. */
export const TRAY_ID = 'trayTable';
/**
 * Round 5 block 4: the staff milk & cream shelf (Gear runs), a fixed counter-kind spot by the sink (one tile above it).
 * A second fridge door for staff: take a milk carton here the same way as at the fridge. Fixtures never move (C10).
 */
export const SUPPLY_ID = 'supply';
/**
 * FB2 B8: the syrup rack (Gear runs with a steam wand), a fixed counter-kind spot like the sink: at the left end of the
 * front counter on every tier (a stop on the way to setting a cup down), worked from the tile behind it (2,5), which no
 * other station claims. It takes nothing from the fridge's, the sink's or the counter spots' reach, and is out of reach
 * of the mop's home and the box corner; the door and the rogue's way out stay open.
 */
export const SYRUP_ID = 'syrups';
export const SYRUP_SPOT: Vec2 = { x: 2, y: 6 };

/**
 * The solid front counter. One row of tiles the crew cannot walk through.
 * `gap` is the staff flap at the right end (walk around the counter, not through it).
 * The door stays at (1, y), just left of `x0`, and is not part of the line.
 */
export interface FrontCounter {
  /** The till's row. */
  y: number;
  /** Inclusive tile columns of the line. */
  x0: number;
  x1: number;
  /** Inclusive columns that stay open: the flap at the right end. */
  gap: { x0: number; x1: number };
}

/** True for a column of the solid run (the flap is open). */
export function isFrontSolid(fc: FrontCounter, x: number): boolean {
  return x >= fc.x0 && x <= fc.x1 && (x < fc.gap.x0 || x > fc.gap.x1);
}

/** A whole tile on the solid run (register, pickup and the closed floor beside them). */
export function onFrontCounter(tier: TierId | undefined, pos: Vec2): boolean {
  const fc = layoutFor(tier).frontCounter;
  return Math.round(pos.y) === fc.y && isFrontSolid(fc, Math.round(pos.x));
}

/**
 * The runs to draw: tile-edge spans of the solid columns, split by the flap.
 * `x0` / `x1` are the left and right edges (a tile centred on `n` covers `n - 0.5` to `n + 0.5`).
 */
export function counterSegments(fc: FrontCounter): { y: number; x0: number; x1: number }[] {
  const out: { y: number; x0: number; x1: number }[] = [];
  let start = -1;
  const flush = (end: number) => {
    if (start >= 0 && end >= start) out.push({ y: fc.y, x0: start - 0.5, x1: end + 0.5 });
    start = -1;
  };
  for (let x = fc.x0; x <= fc.x1; x++) {
    if (isFrontSolid(fc, x)) {
      if (start < 0) start = x;
    } else flush(x - 1);
  }
  flush(fc.x1);
  return out;
}

/**
 * The counter for a floor width. Cart 8, stand 10, café 12. Anything as narrow as the
 * cart uses the cart; anything as narrow as the stand uses the stand; wider uses the café.
 */
export function frontCounterForWidth(width: number): FrontCounter {
  if (width <= TIER_LAYOUTS.cart.width) return TIER_LAYOUTS.cart.frontCounter;
  if (width <= TIER_LAYOUTS.stand.width) return TIER_LAYOUTS.stand.frontCounter;
  return TIER_LAYOUTS.cafe.frontCounter;
}

/** What changes between the cart, the stand and the café. Door, spawn points, counter and the front of the queue stay put. The register and the pickup stay side by side on the front row. */
export interface TierLayout {
  /** Floor width in tiles: the rest of the 12-wide lot is hoarding ("space for lease"). */
  width: number;
  /** The tier's default loadout (FB1 WP5: what `defaultSlots` places), counter last. */
  stations: { id: string; kind: StationKind; pos: Vec2 }[];
  queueSlots: Vec2[];
  mopHome: Vec2;
  /**
   * v3.11.2: the solid front counter. Players cannot walk through it. The register and the pickup
   * stay on it. The flap (`gap`) is the right-hand end, so the crew can still reach the front.
   */
  frontCounter: FrontCounter;
  /** Batch/pickup (Gear runs): the pickup counter, left of the till. */
  pickup: Vec2;
  /** Batch/pickup (Gear runs): the condiment bar, left of the pickup counter. */
  condiments: Vec2;
  /** Batch/pickup (Gear runs): where condiment stock boxes wait, two tiles left of the mop's home. */
  boxCorner: Vec2;
  /** FB2 A4 (Gear runs): the fridge, against the left wall two tiles below the first back-bar slot. */
  fridge: Vec2;
  /**
   * FB2 A3 (Gear runs): the back sink, against the right wall three rows below the back bar (`x = width - 1, y = 4`).
   * Bots work it from the tile to its left or the one above it; no tile in its reach is in reach of any other station
   * (fix round 1: at y = 3 it shared the last slot's only tile, and the bar lost ~9% of its serves to the detours).
   */
  sink: Vec2;
  /**
   * Round 5 block 4 (Gear runs): the milk & cream shelf, one tile above the sink on the right wall (`x = width - 1,
   * y = 3`). Worked from the tile to its left (often a spawn); fixtures never move.
   */
  supply: Vec2;
  /**
   * FB2 B7 (Gear runs): the tray table, against the left wall just below the fridge (1,4), the same on every tier. It is
   * worked from the tile to its right (2,4) (or from below); no tile in its reach is in reach of any other station, and
   * it keeps clear of the spawn points, the door, the mop's home, the box corner and the bots' idle tiles by the till.
   */
  trayTable: Vec2;
}

/**
 * The register (6, 6) and the pickup (5, 6) stay side by side on the solid front counter.
 * The condiment bar is the tile to the pickup's left. The same spots on every tier.
 * The till, the door and the front of the queue never move.
 */
const SPOTS = { pickup: { x: 5, y: 6 }, condiments: { x: 4, y: 6 }, fridge: { x: 1, y: 3 }, trayTable: { x: 1, y: 4 } };

/**
 * How far a barista on the staff side can stand and still use the pickup counter. Wider than a normal
 * station so the two tiles in front of it (and a step apart) both count.
 */
export const PICKUP_REACH = 1.5;
/** Half-width of the pickup counter's blocked body, in tiles (before the barista's own margin). */
export const PICKUP_BODY = 1.35;

const COUNTER = { id: 'counter', kind: 'counter' as const, pos: { x: 6, y: 6 } };

/**
 * The line starts at column 2 so the door (1, 6) stays open. The flap is the right-hand end,
 * beside the wall, so the crew can still reach the mop, the boxes and a spill in front.
 * The stand's last column is where a new drip pot sits (9, 5), which seals that column, so the
 * stand's flap is the two end columns and the counter stops one tile past the till.
 */
function frontLine(width: number, gap0: number, gap1: number): FrontCounter {
  return { y: 6, x0: 2, x1: width - 1, gap: { x0: gap0, x1: gap1 } };
}

export const TIER_LAYOUTS: Record<TierId, TierLayout> = {
  // The 8-tile footprint (the cheap start). The cart sits on it.
  cart: {
    width: 8,
    frontCounter: frontLine(8, 7, 7),
    stations: [
      { id: 'grinder', kind: 'grinder', pos: { x: 1, y: 1 } },
      { id: 'espresso', kind: 'espresso', pos: { x: 3, y: 1 } },
      { id: 'coldBrewTap', kind: 'coldBrewTap', pos: { x: 5, y: 1 } },
      { id: 'trash', kind: 'trash', pos: { x: 7, y: 1 } },
      COUNTER,
    ],
    queueSlots: [{ x: 6, y: 7.6 }, { x: 7, y: 7.6 }, { x: 5, y: 7.6 }, { x: 4, y: 7.6 }],
    mopHome: { x: 3, y: 7 },
    ...SPOTS,
    boxCorner: { x: 1, y: 7 },
    sink: { x: 7, y: 4 },
    supply: { x: 7, y: 3 },
  },
  // The 10-tile footprint (the $70 step). The stand sits on it.
  stand: {
    width: 10,
    frontCounter: frontLine(10, 8, 9),
    stations: [
      { id: 'grinder', kind: 'grinder', pos: { x: 1, y: 1 } },
      { id: 'espresso', kind: 'espresso', pos: { x: 3, y: 1 } },
      { id: 'steamer', kind: 'steamer', pos: { x: 5, y: 1 } },
      { id: 'coldBrewTap', kind: 'coldBrewTap', pos: { x: 7, y: 1 } },
      { id: 'trash', kind: 'trash', pos: { x: 9, y: 1 } },
      COUNTER,
    ],
    queueSlots: [{ x: 6, y: 7.6 }, { x: 7, y: 7.6 }, { x: 8, y: 7.6 }, { x: 9, y: 7.6 }, { x: 5, y: 7.6 }, { x: 4, y: 7.6 }],
    mopHome: { x: 9, y: 7 },
    ...SPOTS,
    boxCorner: { x: 7, y: 7 },
    sink: { x: 9, y: 4 },
    supply: { x: 9, y: 3 },
  },
  cafe: {
    width: LAYOUT.width,
    frontCounter: frontLine(LAYOUT.width, 11, 11),
    stations: LAYOUT.stations,
    queueSlots: LAYOUT.queueSlots,
    mopHome: LAYOUT.mopHome,
    ...SPOTS,
    boxCorner: { x: 9, y: 7 },
    sink: { x: 11, y: 4 },
    supply: { x: 11, y: 3 },
  },
};

/**
 * FB1 WP5: the back-bar slots per tier, left to right. A slot holds one station or nothing; the
 * counter is not a slot. The café keeps its five old positions (they are not on an even grid, and
 * moving them would change every bot path) and gains a sixth at the end of the bar.
 */
export const SLOT_POSITIONS: Record<TierId, Vec2[]> = {
  cart: [
    { x: 1, y: 1 },
    { x: 3, y: 1 },
    { x: 5, y: 1 },
    { x: 7, y: 1 },
  ],
  stand: [
    { x: 1, y: 1 },
    { x: 3, y: 1 },
    { x: 5, y: 1 },
    { x: 7, y: 1 },
    { x: 9, y: 1 },
  ],
  cafe: [
    { x: 1, y: 1 },
    { x: 3, y: 1 },
    { x: 5, y: 1 },
    { x: 8, y: 1 },
    { x: 10, y: 1 },
    { x: 11, y: 1 },
  ],
};

/** The layout for a tier (absent = the café, as every run before P3 B13). */
export function layoutFor(tier: TierId | undefined): TierLayout {
  return TIER_LAYOUTS[tier ?? 'cafe'];
}
