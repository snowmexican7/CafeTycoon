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

export type GearTree = 'coldBrew' | 'espresso' | 'grinder' | 'steamer' | 'drip' | 'pourOver' | 'bin';

export type GearId =
  | 'c1' | 'c2' | 'c3' | 'c4' | 'c5'
  | 'e1' | 'e2' | 'e3' | 'e4' | 'e5' | 'e6'
  | 'g1' | 'g2' | 'g3'
  | 's1' | 's2' | 's3'
  | 'd1' | 'd2' | 'd3' | 'd4'
  | 'd4b' | 'd5b'
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
  /** G5: downsides and funny rare events, rolled only in a Gear run (see sim/gear.ts gearAfterUse / gearMorning). */
  quirks?: GearQuirks;
  /** G4: pods, no grinder. Empty hands at it make a shot (one pod = one unit of beans). */
  pods?: boolean;
  /** G4d: a drip machine. One press brews a pot of `cups` (one unit of beans); each press after pours a cup.
   *  The pot goes cold `coldAfter` seconds after it finishes (null = never); `miss` = chance a pot comes out
   *  too hot or too cold (each cup from a missed or cold pot: a complaint and −1★). */
  pot?: { cups: number; coldAfter: number | null; miss: number };
  /** G10a: a pour-over station (drip branch b). Empty hands make one handmade Pour-over in `seconds`. */
  pour?: { seconds: number };
  /** G9: extra stations in the same slot, about half a tile to the side (doc §5: two sides, no new buttons).
   *  A twin of the machine's own kind is a second group head with the same gear; any other kind (the steam
   *  wand) is a plain station of that kind. */
  twin?: Exclude<StationKind, 'counter'>[];
  /** G10a: buying it needs this tree at this tier or better in a slot (the drip branch opens after D3). */
  requires?: { tree: GearTree; tier: number; label: string };
  blurb: string;
}

export interface GearQuirks {
  /** chance per use: the machine jams until someone whacks it (empty hands, E). */
  jam?: number;
  /** chance per use: a spill on the barista's tile. */
  spill?: number;
  /** chance per use: an off note in the cup (one more mark). */
  offNote?: number;
  /** dies after this many uses a day, plus 0..dieSpread-1 (rolled each morning). */
  dieAfter?: number;
  dieSpread?: number;
  /** chance per day: lose `crackLoss` cups of today's batch. */
  crack?: number;
  crackLoss?: number;
  /** chance per use / per day: a harmless funny line. */
  funny?: number;
  funnyText?: string;
  morning?: number;
  morningText?: string;
  /** chance per day: a customer asks about it (−rating). */
  askAbout?: number;
  /** chance per day: Lucky Sock, no lint marks today. */
  lucky?: number;
}

export const GEAR_TREES: { id: GearTree; name: string; icon: string }[] = [
  { id: 'coldBrew', name: 'Cold brew', icon: '🧊' },
  { id: 'espresso', name: 'Espresso', icon: '☕' },
  { id: 'grinder', name: 'Grinder', icon: '⚙️' },
  { id: 'steamer', name: 'Milk', icon: '🥛' },
  { id: 'drip', name: 'Drip', icon: '🫖' },
  { id: 'pourOver', name: 'Pour-over', icon: '🫘' },
  { id: 'bin', name: 'Bin', icon: '🗑️' },
];

const g = (info: GearInfo): GearInfo => info;

export const GEAR: Record<GearId, GearInfo> = {
  c1: g({ id: 'c1', tree: 'coldBrew', tier: 1, station: 'coldBrewTap', name: 'The Hanes Method', price: 5, sell: 0, sticker: '$4.97 (3-pack)', speed: 1, marks: 1, batch: 8, quirks: { askAbout: 0.02, lucky: 0.005 }, blurb: 'A clean sock from Walmart. "I hope nobody sees how we did this." 8 cups a day, a little lint.' }),
  c2: g({ id: 'c2', tree: 'coldBrew', tier: 2, station: 'coldBrewTap', name: 'Mason Jar Army', price: 25, sell: 8, sticker: '$30', speed: 1, marks: 0, batch: 16, quirks: { crack: 0.03, crackLoss: 4 }, blurb: 'A shelf of jars steeping overnight. 16 cups a day.' }),
  c3: g({ id: 'c3', tree: 'coldBrew', tier: 3, station: 'coldBrewTap', name: 'The Big Orange Bucket', price: 55, sell: 20, sticker: '$40', speed: 1, marks: 0, batch: 30, blurb: 'Hardware-store bucket plus a filter bag. 30 cups a day. Hide it from the inspector.' }),
  c4: g({ id: 'c4', tree: 'coldBrew', tier: 4, station: 'coldBrewTap', name: 'Kegerator Tap', price: 110, sell: 55, sticker: '$600', speed: 1, marks: 0, quirks: { funny: 0.02, funnyText: 'The keg burps. Loudly. Nobody says anything.' }, blurb: 'A real tap. No daily cap: it pours as long as there is concentrate.' }),
  c5: g({ id: 'c5', tree: 'coldBrew', tier: 5, station: 'coldBrewTap', name: 'The Slow Tower of Patience', price: 220, sell: 110, sticker: '$1,200', speed: 1.1, marks: 0, priceMul: 1.25, blurb: 'A Kyoto drip tower. Customers stare at it, then order two.' }),
  e1: g({ id: 'e1', tree: 'espresso', tier: 1, station: 'espresso', name: 'Pod-o-Matic 3000', price: 45, sell: 8, sticker: '$129', speed: 5 / 6, marks: 1, priceMul: 0.85, pods: true, quirks: { jam: 0.04, morning: 0.05, morningText: 'The Pod-o-Matic\'s "descale" light is on again. Nobody knows what it means.' }, blurb: 'Pods, no grinder: empty hands, press E, get a shot. Tastes like a pod (2★ at best, espresso drinks sell for less). A mysterious "descale" light nobody understands.' }),
  e2: g({ id: 'e2', tree: 'espresso', tier: 2, station: 'espresso', name: 'Brevelle "Barista Distress"', price: 80, sell: 35, sticker: '$700', speed: 0.9, marks: 0, quirks: { spill: 0.03, funny: 0.02, funnyText: 'The Brevelle makes a noise like a goose. HONK.' }, blurb: 'A home machine doing its best. Needs a grinder. Makes a noise like a goose.' }),
  e3: g({ id: 'e3', tree: 'espresso', tier: 3, station: 'espresso', name: 'Sylvia the Prosumer', price: 150, sell: 75, sticker: '$1,800', speed: 1, marks: 0, blurb: 'A proper single boiler: today\'s machine.' }),
  e4: g({ id: 'e4', tree: 'espresso', tier: 4, station: 'espresso', name: 'Double Trouble', price: 260, sell: 130, sticker: '$3,000', speed: 1.1, marks: 0, twin: ['steamer'], blurb: 'Dual boiler, two sides: shots on one side, a steam wand on the other. One barista can pull a shot and steam milk at once.' }),
  e5: g({ id: 'e5', tree: 'espresso', tier: 5, station: 'espresso', name: 'La Marzipana Due', price: 450, sell: 225, sticker: '$18,000', speed: 1.1, marks: 0, priceMul: 1.1, twin: ['steamer', 'espresso'], blurb: 'Two-group commercial machine with a steam wand: two shots at once. The regulars notice.' }),
  e6: g({ id: 'e6', tree: 'espresso', tier: 6, station: 'espresso', name: 'The Annihilator', price: 800, sell: 400, sticker: '$25,000+', speed: 1.4, marks: 0, priceMul: 1.2, twin: ['steamer', 'espresso'], blurb: 'Two groups and a steam wand. So loud the café cat leaves for the day.' }),
  g1: g({ id: 'g1', tree: 'grinder', tier: 1, station: 'grinder', name: 'Spice grinder', price: 12, sell: 2, sticker: '$15', speed: 0.6, marks: 0, quirks: { offNote: 0.05 }, blurb: 'Still smells of cumin. Slow.' }),
  g2: g({ id: 'g2', tree: 'grinder', tier: 2, station: 'grinder', name: 'Burr grinder', price: 30, sell: 12, sticker: '$150', speed: 1, marks: 0, blurb: 'Today\'s grinder.' }),
  g3: g({ id: 'g3', tree: 'grinder', tier: 3, station: 'grinder', name: 'The Monolith', price: 90, sell: 45, sticker: '$1,500', speed: 1.65, marks: 0, blurb: 'A flat-burr slab of steel. Fast.' }),
  s1: g({ id: 's1', tree: 'steamer', tier: 1, station: 'steamer', name: 'Battery whisk', price: 10, sell: 0, sticker: '$1.25', speed: 0.6, marks: 1, quirks: { dieAfter: 6, dieSpread: 8 }, blurb: 'From the dollar store. Slow, and the milk shows it.' }),
  s2: g({ id: 's2', tree: 'steamer', tier: 2, station: 'steamer', name: 'Milk frother jug', price: 25, sell: 8, sticker: '$40', speed: 0.8, marks: 0, blurb: 'Plug it in, wait, pour.' }),
  s3: g({ id: 's3', tree: 'steamer', tier: 3, station: 'steamer', name: 'Steam wand station', price: 40, sell: 15, sticker: '$300', speed: 1, marks: 0, blurb: 'Today\'s steamer.' }),
  // G4d (docs/GEAR_TREE.md §4.2): drip lists at $2.50, beans but no grinder. Pot brew time = 20 s / speed.
  d1: g({ id: 'd1', tree: 'drip', tier: 1, station: 'drip', name: 'Thrift Store Special', price: 15, sell: 2, sticker: '$6', speed: 1, marks: 0, pot: { cups: 4, coldAfter: 45, miss: 0.12 }, quirks: { funny: 0.03, funnyText: 'That pot tasted faintly of 1997.', morning: 0.08, morningText: 'The Thrift Store Special\'s clock is flashing 12:00 again. It has since 1997.' }, blurb: 'A $6 coffee maker with a yellowed carafe. 4 cups a pot, goes cold fast, sometimes scalding.' }),
  d2: g({ id: 'd2', tree: 'drip', tier: 2, station: 'drip', name: 'Mister Kaffee 12-Cup', price: 40, sell: 15, sticker: '$35', speed: 20 / 14, marks: 0, pot: { cups: 8, coldAfter: 60, miss: 0.05 }, quirks: { funny: 0.03, funnyText: 'Mister Kaffee clicked itself off mid-rush. Someone clicked it back on.' }, blurb: 'The office classic. 8 cups a pot in 14 s.' }),
  d3: g({ id: 'd3', tree: 'drip', tier: 3, station: 'drip', name: 'Office Urn', price: 85, sell: 40, sticker: '$400', speed: 20 / 12, marks: 0, pot: { cups: 16, coldAfter: null, miss: 0.02 }, quirks: { funny: 0.03, funnyText: 'Someone from "accounting" took a free refill. Nobody stopped them.' }, blurb: 'A steel urn that keeps it hot all day. 16 cups in 12 s.' }),
  d4: g({ id: 'd4', tree: 'drip', tier: 4, station: 'drip', name: 'Twin-Batch Fetch-O', price: 160, sell: 80, sticker: '$2,500', speed: 2, marks: 0, pot: { cups: 24, coldAfter: null, miss: 0 }, blurb: 'Two pots at once, 10 s. The diner down the road has one.' }),
  // G10a: the drip branch's other side (doc §4.2 D4b/D5b). Its own row; the tiers keep the doc's numbers.
  d4b: g({ id: 'd4b', tree: 'pourOver', tier: 4, station: 'drip', name: 'Pour-Over Bar', price: 70, sell: 30, sticker: '$120', speed: 1, marks: 0, pour: { seconds: 8 }, requires: { tree: 'drip', tier: 3, label: 'Office Urn' }, quirks: { spill: 0.03, funny: 0.02, funnyText: 'Flow state: the pour-over spirals perfectly. Somebody films it.' }, blurb: 'A V60 cone and a gooseneck kettle. No pot: one handmade Pour-over at a time, 8 s. Unlocks the Pour-over ($4.50). The kettle sometimes pours on your shoe.' }),
  d5b: g({ id: 'd5b', tree: 'pourOver', tier: 5, station: 'drip', name: 'The Pour-Over Lab', price: 150, sell: 75, sticker: '$600', speed: 1, marks: 0, priceMul: 1.15, pour: { seconds: 2.5 }, requires: { tree: 'drip', tier: 3, label: 'Office Urn' }, blurb: 'Three cones and a Chemex: three cups in about 7 s. Pour-overs sell for ×1.15. Snobs start dropping by.' }),
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
