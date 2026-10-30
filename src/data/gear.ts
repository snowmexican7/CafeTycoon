/**
 * Gear Tree (v3, docs/GEAR_TREE.md): every machine has its own upgrade tree, bought with money only.
 * This file is data only. The sim reads it only in a Gear run (`state.gear === true`, created with
 * `CreateRunOptions.gear`); every other run plays exactly as before (a station with no `gear` id has
 * today's numbers).
 *
 * Built: the cold brew, espresso (E1 Pod-o-Matic up), grinder, drip, pour-over and bin trees.
 * FB2 C9 (docs/GEAR_TREE.md §5b): there is no steamer tree any more. Milk is steamed at a wand on the espresso
 * machine: none on E1/E2, an add-on wand on E3/E4 (`WANDS`, bought with the machine or later), built in on E5/E6.
 * A machine with a wand gets a twin station of kind 'steamer' beside it (the G9 twin mechanism).
 *
 * Per tier:
 *  - `price` to buy, `sell` back at night (a trade-in when you buy a higher tier of the same tree).
 *  - `speed`: relative to today's machine (1.0 = today). Seconds = today's seconds / speed.
 *  - `marks`: slip marks on every cup the machine makes (one mark = -1 star).
 *  - `batch`: cold brew made overnight: cups per day before it's sold out (absent = no cap).
 *  - `sticker`: the joke real-life price, shown in the flavour text.
 */
import type { StationKind } from '../sim/types';

export type GearTree = 'coldBrew' | 'espresso' | 'grinder' | 'drip' | 'pourOver' | 'bin';

export type GearId =
  | 'c1' | 'c2' | 'c3' | 'c4' | 'c5'
  | 'e1' | 'e2' | 'e3' | 'e4' | 'e5' | 'e6'
  | 'g1' | 'g2' | 'g3'
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
  /** G10 "+1★ cap": the machine forgives one slip on each cup it takes in (doc: C5, E6; pour-overs start clean anyway). */
  polish?: true;
  /** G10: a rare "flow state" (pour-over): this chance per use of double speed for `flow.seconds`. */
  flow?: { chance: number; seconds: number };
  /** G10: orders of a family get this much likelier while this machine is in a slot (Kyoto tower: iced +10%). */
  draws?: { family: 'espresso' | 'milky' | 'iced' | 'filter'; mul: number };
  /** G10: the influencer event is this much likelier (The Annihilator ×1.5). */
  influencerOdds?: number;
  /** G9: extra stations in the same slot, about half a tile to the side (doc §5: two sides, no new buttons).
   *  A twin of the machine's own kind is a second group head with the same gear; any other kind (the steam
   *  wand) is a plain station of that kind. */
  twin?: Exclude<StationKind, 'counter'>[];
  /** FB2 C9: the machine's steam wand: the add-ons it takes (E3/E4), or a wand built in (E5/E6: its seconds per
   *  latte and its tier for the milky pull). Absent = no wand at all (E1/E2, every other tree). */
  wand?: { addOns?: AddOnWand[]; built?: { seconds: number; tier: number } };
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
  { id: 'drip', name: 'Drip', icon: '🫖' },
  { id: 'pourOver', name: 'Pour-over', icon: '🫘' },
  { id: 'bin', name: 'Bin', icon: '🗑️' },
];

// ---------------------------------------------------------------------------------------------- FB2 C9: steam wands

/** A wand on an espresso machine: an add-on (E3/E4) or built in (E5/E6). `Station.wand` carries it. */
export type WandKind = 'weak' | 'strong' | 'built';
export type AddOnWand = Exclude<WandKind, 'built'>;

/** Seconds per latte at each wand (today's steamer was 3.5 s). The dual boiler (E6) has the fastest one. */
export const WAND_SECONDS = { weak: 4.5, strong: 3.5, built: 3.5, dualBoiler: 3 } as const;

export interface WandInfo {
  name: string;
  seconds: number;
  /** Its tier for G7's milky pull (+5% milk orders per tier above 1), as the old steamer tiers were. */
  tier: number;
  /** The price bought with the machine, and added on a later night. */
  withMachine: number;
  later: number;
  /** Cash back when its machine is sold or replaced (the wand goes with it). */
  sell: number;
  /** Chance per use that it clogs: dead until someone whacks it with empty hands (the battery whisk's old joke). */
  clog?: number;
  blurb: string;
}

export const WANDS: Record<AddOnWand, WandInfo> = {
  weak: { name: 'Little steam wand', seconds: WAND_SECONDS.weak, tier: 2, withMachine: 25, later: 30, sell: 10, clog: 1 / 30, blurb: 'Weak and slow (4.5 s a latte), and now and then it clogs: whack it with empty hands.' },
  strong: { name: 'Proper steam wand', seconds: WAND_SECONDS.strong, tier: 3, withMachine: 40, later: 40, sell: 20, blurb: 'A real wand: 3.5 s a latte. La Marzipana Due only.' },
};

/** Upgrading a little wand to a proper one costs the difference. */
export const WAND_UPGRADE = WANDS.strong.withMachine - WANDS.weak.withMachine;

export const isAddOnWand = (x: unknown): x is AddOnWand => x === 'weak' || x === 'strong';

const g = (info: GearInfo): GearInfo => info;

export const GEAR: Record<GearId, GearInfo> = {
  c1: g({ id: 'c1', tree: 'coldBrew', tier: 1, station: 'coldBrewTap', name: 'The Hanes Method', price: 5, sell: 0, sticker: '$4.97 (3-pack)', speed: 1, marks: 1, batch: 8, quirks: { askAbout: 0.02, lucky: 0.005 }, blurb: 'A clean sock from Walmart. "I hope nobody sees how we did this." 8 cups a day, a little lint.' }),
  c2: g({ id: 'c2', tree: 'coldBrew', tier: 2, station: 'coldBrewTap', name: 'Mason Jar Army', price: 25, sell: 8, sticker: '$30', speed: 1, marks: 0, batch: 16, quirks: { crack: 0.03, crackLoss: 4 }, blurb: 'A shelf of jars steeping overnight. 16 cups a day.' }),
  c3: g({ id: 'c3', tree: 'coldBrew', tier: 3, station: 'coldBrewTap', name: 'The Big Orange Bucket', price: 55, sell: 20, sticker: '$40', speed: 1, marks: 0, batch: 30, blurb: 'Hardware-store bucket plus a filter bag. 30 cups a day. Hide it from the inspector.' }),
  c4: g({ id: 'c4', tree: 'coldBrew', tier: 4, station: 'coldBrewTap', name: 'Kegerator Tap', price: 110, sell: 55, sticker: '$600', speed: 1, marks: 0, batch: 60, quirks: { funny: 0.02, funnyText: 'The keg burps. Loudly. Nobody says anything.' }, blurb: 'A real tap. Steep up to 60 cups a night.' }),
  c5: g({ id: 'c5', tree: 'coldBrew', tier: 5, station: 'coldBrewTap', name: 'The Slow Tower of Patience', price: 220, sell: 110, sticker: '$1,200', speed: 1.1, marks: 0, batch: 60, priceMul: 1.25, polish: true, draws: { family: 'iced', mul: 1.1 }, blurb: 'A Kyoto drip tower. Customers stare at it, then order two.' }),
  e1: g({ id: 'e1', tree: 'espresso', tier: 1, station: 'espresso', name: 'Pod-o-Matic 3000', price: 45, sell: 8, sticker: '$129', speed: 5 / 6, marks: 1, priceMul: 0.85, pods: true, quirks: { jam: 0.04, morning: 0.05, morningText: 'The Pod-o-Matic\'s "descale" light is on again. Nobody knows what it means.' }, blurb: 'Pods, no grinder: empty hands, press E, get a shot. Tastes like a pod (2★ at best, espresso drinks sell for less). No steam wand. A mysterious "descale" light nobody understands.' }),
  e2: g({ id: 'e2', tree: 'espresso', tier: 2, station: 'espresso', name: 'Brevelle "Barista Distress"', price: 80, sell: 35, sticker: '$700', speed: 0.9, marks: 0, quirks: { spill: 0.03, funny: 0.02, funnyText: 'The Brevelle makes a noise like a goose. HONK.' }, blurb: 'A home machine doing its best. Needs a grinder, has no steam wand. Makes a noise like a goose.' }),
  // FB2 C9 (§5b): E3/E4 take an add-on wand (WANDS); E5/E6 have one built in. Shot seconds = 5 / speed: 6, 5.5, 5, 4.5, 3.5, 3.
  e3: g({ id: 'e3', tree: 'espresso', tier: 3, station: 'espresso', name: 'Sylvia the Prosumer', price: 150, sell: 75, sticker: '$1,800', speed: 1, marks: 0, wand: { addOns: ['weak'] }, blurb: 'A proper single boiler: 5 s shots. Add a little steam wand (with the machine or later) and lattes go on the board.' }),
  e4: g({ id: 'e4', tree: 'espresso', tier: 4, station: 'espresso', name: 'La Marzipana Due', price: 260, sell: 130, sticker: '$18,000', speed: 5 / 4.5, marks: 0, priceMul: 1.1, twin: ['espresso'], wand: { addOns: ['weak', 'strong'] }, blurb: 'Two-group commercial machine: two shots at once, 4.5 s each. Takes the little wand or a proper one. The regulars notice.' }),
  e5: g({ id: 'e5', tree: 'espresso', tier: 5, station: 'espresso', name: 'The Annihilator', price: 450, sell: 225, sticker: '$25,000+', speed: 5 / 3.5, marks: 0, priceMul: 1.2, polish: true, influencerOdds: 1.5, twin: ['steamer', 'espresso'], wand: { built: { seconds: WAND_SECONDS.built, tier: 3 } }, quirks: { funny: 0.01, funnyText: 'The Annihilator roared. The café cat has left for the day.' }, blurb: 'Two groups, 3.5 s shots and a steam wand built in. Forgives a slip. So loud the café cat leaves for the day.' }),
  e6: g({ id: 'e6', tree: 'espresso', tier: 6, station: 'espresso', name: 'Double Trouble', price: 800, sell: 400, sticker: '$32,000 (and a second mortgage)', speed: 5 / 3, marks: 0, priceMul: 1.2, polish: true, twin: ['steamer', 'espresso'], wand: { built: { seconds: WAND_SECONDS.dualBoiler, tier: 4 } }, quirks: { funny: 0.01, funnyText: 'Both boilers hum in harmony. Somebody tears up.' }, blurb: 'Dual boiler, two groups, 3 s shots and the fastest wand there is: it steams while it pulls. Forgives a slip. The top of the tree.' }),
  g1: g({ id: 'g1', tree: 'grinder', tier: 1, station: 'grinder', name: 'Spice grinder', price: 12, sell: 2, sticker: '$15', speed: 0.6, marks: 0, quirks: { offNote: 0.05 }, blurb: 'Still smells of cumin. Slow.' }),
  g2: g({ id: 'g2', tree: 'grinder', tier: 2, station: 'grinder', name: 'Burr grinder', price: 30, sell: 12, sticker: '$150', speed: 1, marks: 0, blurb: 'Today\'s grinder.' }),
  g3: g({ id: 'g3', tree: 'grinder', tier: 3, station: 'grinder', name: 'The Monolith', price: 90, sell: 45, sticker: '$1,500', speed: 1.65, marks: 0, blurb: 'A flat-burr slab of steel. Fast.' }),
  // G4d (docs/GEAR_TREE.md §4.2): drip lists at $2.50, beans but no grinder. Pot brew time = 20 s / speed.
  d1: g({ id: 'd1', tree: 'drip', tier: 1, station: 'drip', name: 'Thrift Store Special', price: 15, sell: 2, sticker: '$6', speed: 1, marks: 0, pot: { cups: 4, coldAfter: 45, miss: 0.12 }, quirks: { funny: 0.03, funnyText: 'That pot tasted faintly of 1997.', morning: 0.08, morningText: 'The Thrift Store Special\'s clock is flashing 12:00 again. It has since 1997.' }, blurb: 'A $6 coffee maker with a yellowed carafe. 4 cups a pot, goes cold fast, sometimes scalding.' }),
  d2: g({ id: 'd2', tree: 'drip', tier: 2, station: 'drip', name: 'Mister Kaffee 12-Cup', price: 40, sell: 15, sticker: '$35', speed: 20 / 14, marks: 0, pot: { cups: 8, coldAfter: 60, miss: 0.05 }, quirks: { funny: 0.03, funnyText: 'Mister Kaffee clicked itself off mid-rush. Someone clicked it back on.' }, blurb: 'The office classic. 8 cups a pot in 14 s.' }),
  d3: g({ id: 'd3', tree: 'drip', tier: 3, station: 'drip', name: 'Office Urn', price: 85, sell: 40, sticker: '$400', speed: 20 / 12, marks: 0, pot: { cups: 16, coldAfter: null, miss: 0.02 }, quirks: { funny: 0.03, funnyText: 'Someone from "accounting" took a free refill. Nobody stopped them.' }, blurb: 'A steel urn that keeps it hot all day. 16 cups in 12 s.' }),
  d4: g({ id: 'd4', tree: 'drip', tier: 4, station: 'drip', name: 'Twin-Batch Fetch-O', price: 160, sell: 80, sticker: '$2,500', speed: 2, marks: 0, pot: { cups: 24, coldAfter: null, miss: 0 }, blurb: 'Two pots at once, 10 s. The diner down the road has one.' }),
  // G10a: the drip branch's other side (doc §4.2 D4b/D5b). Its own row; the tiers keep the doc's numbers.
  d4b: g({ id: 'd4b', tree: 'pourOver', tier: 4, station: 'drip', name: 'Pour-Over Bar', price: 70, sell: 30, sticker: '$120', speed: 1, marks: 0, pour: { seconds: 8 }, flow: { chance: 0.02, seconds: 20 }, requires: { tree: 'drip', tier: 3, label: 'Office Urn' }, quirks: { spill: 0.03 }, blurb: 'A V60 cone and a gooseneck kettle. No pot: one handmade Pour-over at a time, 8 s. Unlocks the Pour-over ($4.50). The kettle sometimes pours on your shoe; now and then you hit flow state and pour twice as fast.' }),
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
