/**
 * Gear Tree (v3, docs/GEAR_TREE.md): every machine has its own upgrade tree, bought with money only.
 * This file is data only. The sim reads it only in a Gear run (`state.gear === true`, created with
 * `CreateRunOptions.gear`); every other run plays exactly as before (a station with no `gear` id has
 * today's numbers).
 *
 * Built so far (G1/G2/G4): the cold brew, espresso (E1 Pod-o-Matic up), grinder,
 * steamer and bin trees. Drip (G4) and the dual boiler's two sides (G9) come later.
 *
 * Per tier:
 *  - `price` to buy, `sell` back at night (a trade-in when you buy a higher tier of the same tree).
 *  - `speed`: relative to today's machine (1.0 = today). Seconds = today's seconds / speed.
 *  - `marks`: slip marks on every cup the machine makes (one mark = -1 star).
 *  - `batch`: cold brew made overnight: cups per day before it's sold out (absent = no cap).
 *  - `sticker`: the joke real-life price, shown in the flavour text.
 */
import type { StationKind } from '../sim/types';

export type GearTree = 'coldBrew' | 'espresso' | 'grinder' | 'steamer' | 'bin';

export type GearId =
  | 'c1' | 'c2' | 'c3' | 'c4' | 'c5'
  | 'e1' | 'e2' | 'e3' | 'e4' | 'e5' | 'e6'
  | 'g1' | 'g2' | 'g3'
  | 's1' | 's2' | 's3'
  | 'b0';

export interface GearInfo {
  id: GearId;
  tree: GearTree;
  /** 1 = the cheapest tier of its tree (the bin's cardboard box is 0). */
  tier: number;
  station: Exclude<StationKind, 'counter'>;
  name: string;
  price: number;
  sell: number;
  sticker: string;
  speed: number;
  marks: number;
  batch?: number;
  /** G4: the menu price of the drinks this machine makes (espresso drinks, or cold brew) is multiplied by this. */
  priceMul?: number;
  /** G4: pods, no grinder. Empty hands at it make a shot (one pod = one unit of beans). */
  pods?: boolean;
  blurb: string;
}

export const GEAR_TREES: { id: GearTree; name: string; icon: string }[] = [
  { id: 'coldBrew', name: 'Cold brew', icon: '🧊' },
  { id: 'espresso', name: 'Espresso', icon: '☕' },
  { id: 'grinder', name: 'Grinder', icon: '⚙️' },
  { id: 'steamer', name: 'Milk', icon: '🥛' },
  { id: 'bin', name: 'Bin', icon: '🗑️' },
];

const g = (info: GearInfo): GearInfo => info;

export const GEAR: Record<GearId, GearInfo> = {
  c1: g({ id: 'c1', tree: 'coldBrew', tier: 1, station: 'coldBrewTap', name: 'The Hanes Method', price: 5, sell: 0, sticker: '$4.97 (3-pack)', speed: 1, marks: 1, batch: 8, blurb: 'A clean sock from Walmart. "I hope nobody sees how we did this." 8 cups a day, a little lint.' }),
  c2: g({ id: 'c2', tree: 'coldBrew', tier: 2, station: 'coldBrewTap', name: 'Mason Jar Army', price: 25, sell: 8, sticker: '$30', speed: 1, marks: 0, batch: 16, blurb: 'A shelf of jars steeping overnight. 16 cups a day.' }),
  c3: g({ id: 'c3', tree: 'coldBrew', tier: 3, station: 'coldBrewTap', name: 'The Big Orange Bucket', price: 55, sell: 20, sticker: '$40', speed: 1, marks: 0, batch: 30, blurb: 'Hardware-store bucket plus a filter bag. 30 cups a day. Hide it from the inspector.' }),
  c4: g({ id: 'c4', tree: 'coldBrew', tier: 4, station: 'coldBrewTap', name: 'Kegerator Tap', price: 110, sell: 55, sticker: '$600', speed: 1, marks: 0, blurb: 'A real tap. No daily cap: it pours as long as there is concentrate.' }),
  c5: g({ id: 'c5', tree: 'coldBrew', tier: 5, station: 'coldBrewTap', name: 'The Slow Tower of Patience', price: 220, sell: 110, sticker: '$1,200', speed: 1.1, marks: 0, priceMul: 1.25, blurb: 'A Kyoto drip tower. Customers stare at it, then order two.' }),
  e1: g({ id: 'e1', tree: 'espresso', tier: 1, station: 'espresso', name: 'Pod-o-Matic 3000', price: 45, sell: 8, sticker: '$129', speed: 5 / 6, marks: 1, priceMul: 0.85, pods: true, blurb: 'Pods, no grinder: empty hands, press E, get a shot. Tastes like a pod (2★ at best, espresso drinks sell for less). A mysterious "descale" light nobody understands.' }),
  e2: g({ id: 'e2', tree: 'espresso', tier: 2, station: 'espresso', name: 'Brevelle "Barista Distress"', price: 80, sell: 35, sticker: '$700', speed: 0.9, marks: 0, blurb: 'A home machine doing its best. Needs a grinder. Makes a noise like a goose.' }),
  e3: g({ id: 'e3', tree: 'espresso', tier: 3, station: 'espresso', name: 'Sylvia the Prosumer', price: 150, sell: 75, sticker: '$1,800', speed: 1, marks: 0, blurb: 'A proper single boiler: today\'s machine.' }),
  e4: g({ id: 'e4', tree: 'espresso', tier: 4, station: 'espresso', name: 'Double Trouble', price: 260, sell: 130, sticker: '$3,000', speed: 1.1, marks: 0, blurb: 'Dual boiler. Faster shots (its steam side comes later).' }),
  e5: g({ id: 'e5', tree: 'espresso', tier: 5, station: 'espresso', name: 'La Marzipana Due', price: 450, sell: 225, sticker: '$18,000', speed: 1.1, marks: 0, priceMul: 1.1, blurb: 'Two-group commercial machine. The regulars notice.' }),
  e6: g({ id: 'e6', tree: 'espresso', tier: 6, station: 'espresso', name: 'The Annihilator', price: 800, sell: 400, sticker: '$25,000+', speed: 1.4, marks: 0, priceMul: 1.2, blurb: 'So loud the café cat leaves for the day.' }),
  g1: g({ id: 'g1', tree: 'grinder', tier: 1, station: 'grinder', name: 'Spice grinder', price: 12, sell: 2, sticker: '$15', speed: 0.6, marks: 0, blurb: 'Still smells of cumin. Slow.' }),
  g2: g({ id: 'g2', tree: 'grinder', tier: 2, station: 'grinder', name: 'Burr grinder', price: 30, sell: 12, sticker: '$150', speed: 1, marks: 0, blurb: 'Today\'s grinder.' }),
  g3: g({ id: 'g3', tree: 'grinder', tier: 3, station: 'grinder', name: 'The Monolith', price: 90, sell: 45, sticker: '$1,500', speed: 1.65, marks: 0, blurb: 'A flat-burr slab of steel. Fast.' }),
  s1: g({ id: 's1', tree: 'steamer', tier: 1, station: 'steamer', name: 'Battery whisk', price: 10, sell: 0, sticker: '$1.25', speed: 0.6, marks: 1, blurb: 'From the dollar store. Slow, and the milk shows it.' }),
  s2: g({ id: 's2', tree: 'steamer', tier: 2, station: 'steamer', name: 'Milk frother jug', price: 25, sell: 8, sticker: '$40', speed: 0.8, marks: 0, blurb: 'Plug it in, wait, pour.' }),
  s3: g({ id: 's3', tree: 'steamer', tier: 3, station: 'steamer', name: 'Steam wand station', price: 40, sell: 15, sticker: '$300', speed: 1, marks: 0, blurb: 'Today\'s steamer.' }),
  b0: g({ id: 'b0', tree: 'bin', tier: 0, station: 'trash', name: 'Cardboard box', price: 0, sell: 0, sticker: 'free', speed: 1, marks: 0, blurb: 'Today\'s bin, but it says FRAGILE on the side.' }),
};

export const GEAR_IDS = Object.keys(GEAR) as GearId[];

export const isGearId = (x: unknown): x is GearId => typeof x === 'string' && Object.prototype.hasOwnProperty.call(GEAR, x);

/** A tree's tiers, cheapest first. */
export function treeTiers(tree: GearTree): GearInfo[] {
  return GEAR_IDS.map((id) => GEAR[id]).filter((x) => x.tree === tree).sort((a, b) => a.tier - b.tier);
}

/** The Gear run's start: $120 and nothing else but a free cardboard box (docs/GEAR_TREE.md §3). */
export const GEAR_START = { cash: 120, freeGear: ['b0'] as GearId[] };
