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

/** P3 B13: what changes between the stand, the cart and the café. Door, spawn points, counter and the front of the queue stay put. */
export interface TierLayout {
  /** Floor width in tiles: the rest of the 12-wide lot is hoarding ("space for lease"). */
  width: number;
  stations: { id: string; kind: StationKind; pos: Vec2 }[];
  queueSlots: Vec2[];
  mopHome: Vec2;
}

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
  },
  cafe: { width: LAYOUT.width, stations: LAYOUT.stations, queueSlots: LAYOUT.queueSlots, mopHome: LAYOUT.mopHome },
};

/** The layout for a tier (absent = the café, as every run before P3 B13). */
export function layoutFor(tier: TierId | undefined): TierLayout {
  return TIER_LAYOUTS[tier ?? 'cafe'];
}
