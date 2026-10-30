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
  drip: 'filter',
  americano: 'espresso',
  cappuccino: 'milky',
  doppio: 'espresso',
  sweetCream: 'iced',
  cafeAuLait: 'filter',
  redEye: 'filter',
  pourOver: 'filter',
};

export interface AreaInfo {
  name: string;
  loves: DrinkFamily[];
  meh: DrinkFamily[];
  /** Tip multiplier on every family (Tourist season: everything a bit). */
  all?: number;
  /** G10b: who walks in, in a few words (shown once the notebook reveals the area). */
  crowd: string;
  /** G10b: patience multiplier for everyone (office commuters, gym rush). */
  patience?: number;
  /** G10b: extra patience for a family (Drizzleton waits for its lattes). */
  patienceFam?: Partial<Record<DrinkFamily, number>>;
  /** G10b: per-drink overrides that beat the family rule (arts loves pour-over but shrugs at drip). */
  lovesDrink?: DrinkId[];
  mehDrink?: DrinkId[];
  /** G10b: snobs notice quality: tips swing with the cup's stars. */
  quality?: boolean;
}

/** Hidden per run (nothing shown up front). Loved families tip ×1.2, meh ×0.85 (GEAR_TREE.md §7). */
export const AREAS: Record<AreaId, AreaInfo> = {
  campus: { name: 'Campus town', loves: ['iced'], meh: ['filter'], all: 0.9, crowd: 'Students: low tips, love iced' },
  drizzleton: { name: 'Drizzleton', loves: ['milky'], meh: ['iced'], patienceFam: { milky: 1.25 }, crowd: 'Grumpy, but patient for lattes' },
  office: { name: 'Office park', loves: ['filter'], meh: [], patience: 0.85, mehDrink: ['pourOver'], crowd: 'Commuters: impatient, love filter, pour-over is too slow' },
  arts: { name: 'Arts district', loves: ['espresso'], meh: ['filter'], lovesDrink: ['pourOver'], quality: true, crowd: 'Snobs: love espresso and pour-over, notice quality' },
  gym: { name: 'Gym strip', loves: ['iced', 'espresso'], meh: ['milky'], patience: 0.85, crowd: 'Early and in a hurry: iced or espresso' },
  tourist: { name: 'Tourist season', loves: [], meh: [], all: 1.15, crowd: 'Crowds with big tips' },
};

export const AREA_TIP = { loved: 1.2, meh: 0.85 };

/** G10b: the arts crowd's tip per cup star around 2★ (cups are 0-3★: 3★ ×1.1, 2★ ×1, 0★ ×0.8). */
export const QUALITY_TIP_PER_STAR = 0.1;

/** G10b "top tiers add snob regulars": owning one of these draws a snob regular who orders from its family. */
export const SNOB_GEAR: Record<string, DrinkFamily> = { e5: 'espresso', e6: 'espresso', s3: 'milky', c5: 'iced', d5b: 'filter' };
export const SNOB = { max: 2, names: ['Margaux', 'Sebastian'], hiTip: 1.3, loTip: 0.5 };

/** G7c: chance an arriving walk-in wants a loved family you don't serve, and leaves (no rating hit). */
export const AREA_ASK = 0.12;
export const FAMILY_WORD: Record<DrinkFamily, string> = { espresso: 'a straight espresso', milky: 'something milky', iced: 'something iced', filter: 'filter coffee' };
