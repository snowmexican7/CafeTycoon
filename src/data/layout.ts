import type { StationKind, Vec2 } from '../sim/types';

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
