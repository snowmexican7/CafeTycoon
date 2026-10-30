import type { DrinkId } from '../sim/types';

/** Gear Tree G7: drink families an area can love or shrug at. Filter (drip/pour-over) arrives with the D-tree. */
export type DrinkFamily = 'espresso' | 'milky' | 'iced' | 'filter';
export type AreaId = 'campus' | 'drizzleton' | 'office' | 'arts' | 'gym' | 'tourist';

export const DRINK_FAMILY: Record<DrinkId, DrinkFamily | null> = {
  espresso: 'espresso',
  latte: 'milky',
  mocha: 'milky',
  matcha: 'milky',
  coldBrew: 'iced',
  icedLatte: 'iced',
  special: null,
};

export interface AreaInfo {
  name: string;
  loves: DrinkFamily[];
  meh: DrinkFamily[];
  /** Tip multiplier on every family (Tourist season: everything a bit). */
  all?: number;
}

/** Hidden per run (nothing shown up front). Loved families tip ×1.2, meh ×0.85 (GEAR_TREE.md §7). */
export const AREAS: Record<AreaId, AreaInfo> = {
  campus: { name: 'Campus town', loves: ['iced'], meh: ['filter'] },
  drizzleton: { name: 'Drizzleton', loves: ['milky'], meh: ['iced'] },
  office: { name: 'Office park', loves: ['filter'], meh: [] },
  arts: { name: 'Arts district', loves: ['espresso'], meh: ['filter'] },
  gym: { name: 'Gym strip', loves: ['iced', 'espresso'], meh: ['milky'] },
  tourist: { name: 'Tourist season', loves: [], meh: [], all: 1.1 },
};

export const AREA_TIP = { loved: 1.2, meh: 0.85 };
