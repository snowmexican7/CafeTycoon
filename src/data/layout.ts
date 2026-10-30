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

/** P3 B13: what changes between the stand, the cart and the café. Door, spawn points, counter and the front of the queue stay put. */
export interface TierLayout {
  /** Floor width in tiles: the rest of the 12-wide lot is hoarding ("space for lease"). */
  width: number;
  /** The tier's default loadout (FB1 WP5: what `defaultSlots` places), counter last. */
  stations: { id: string; kind: StationKind; pos: Vec2 }[];
  queueSlots: Vec2[];
  mopHome: Vec2;
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
}

/** Batch/pickup: the same spots on every tier (the till, door and front of the queue never move either). */
const SPOTS = { pickup: { x: 5, y: 6 }, condiments: { x: 4, y: 6 }, fridge: { x: 1, y: 3 } };

const COUNTER = { id: 'counter', kind: 'counter' as const, pos: { x: 6, y: 6 } };

export const TIER_LAYOUTS: Record<TierId, TierLayout> = {
  stand: {
    width: 8,
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
  },
  cart: {
    width: 10,
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
  },
  cafe: { width: LAYOUT.width, stations: LAYOUT.stations, queueSlots: LAYOUT.queueSlots, mopHome: LAYOUT.mopHome, ...SPOTS, boxCorner: { x: 9, y: 7 }, sink: { x: 11, y: 4 } },
};

/**
 * FB1 WP5: the back-bar slots per tier, left to right. A slot holds one station or nothing; the
 * counter is not a slot. The café keeps its five old positions (they are not on an even grid, and
 * moving them would change every bot path) and gains a sixth at the end of the bar.
 */
export const SLOT_POSITIONS: Record<TierId, Vec2[]> = {
  stand: [
    { x: 1, y: 1 },
    { x: 3, y: 1 },
    { x: 5, y: 1 },
    { x: 7, y: 1 },
  ],
  cart: [
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
