import type { PerkId } from '../data/perks';
import type { AreaId, DrinkFamily } from '../data/areas';
import type { AddOnWand, GearId, WandKind } from '../data/gear';
import type { FridgeId } from '../data/fridges';
import type { TwistId } from './taste';
import type { RoleId } from './roles';
import type { EggsState } from './eggs';
import type { EspressoState } from './espresso';
import type { ForecastId } from '../data/forecasts';
import type { CrewStats } from './stats';

export type PlayerId = string;
export type DrinkId = 'espresso' | 'latte' | 'coldBrew' | 'icedLatte' | 'mocha' | 'matcha' | 'special' | 'drip' | 'americano' | 'cappuccino' | 'doppio' | 'sweetCream' | 'cafeAuLait' | 'redEye' | 'pourOver';
export type SupplyId = 'beans' | 'milk' | 'concentrate' | 'flavour' | 'pastry';
export type ItemKind = 'grounds' | DrinkId;
export type StationKind = 'grinder' | 'espresso' | 'steamer' | 'coldBrewTap' | 'counter' | 'trash' | 'drip';
export type Phase = 'night' | 'day' | 'closing' | 'weekEnd' | 'ended';
export type ScenarioId = 'normal' | 'campusTown' | 'rainyWeek' | 'touristSeason';
export type Rarity = 'common' | 'uncommon' | 'rare';
export type Pace = 1 | 2 | 3 | 4 | 5;
export type EventKind = 'rushHour' | 'powerFlicker' | 'influencerVisit' | 'healthInspector';
export type CustomerKind = 'normal' | 'impatient' | 'group' | 'regular' | 'influencer';
export type Personality = 'rookie' | 'steady' | 'veteran' | 'hurried' | 'human'; // 'human' = tester stand-in
export type BotSkill = 1 | 2 | 3 | 4 | 5;
/** FB2 A3: `lift` a cold or stale drip pot off its machine, `dump` what is in hand (or the pot) at the back sink.
 *  FB2 A4: `fetch` a milk carton at the fridge, `stock` it at a milk station (or the lifted bar back on the bar),
 *  `stow` (lift) the milk or the bar during closing soon, `store` what is carried in the fridge. */
export type BotAction = 'insert' | 'take' | 'serve' | 'put' | 'trash' | 'ring' | 'refill' | 'lift' | 'dump' | 'fetch' | 'stock' | 'stow' | 'store' | 'whack';

export interface Vec2 {
  x: number;
  y: number;
}

export type MessKind = 'grounds' | 'spill';
export interface Mess { id: number; kind: MessKind; x: number; y: number; amount: number }
export interface Mop { pos: Vec2; heldBy: PlayerId | null }
export type RogueStage = 'walking' | 'waiting' | 'making' | 'leaving' | 'stormingOut';
export interface Rogue {
  customerId: number; name?: string; drink: DrinkId; stage: RogueStage;
  pos: Vec2; path: Vec2[]; station: string | null; ticksLeft: number; waitTicks: number;
}
/**
 * Mop steps (takeMop, clean, returnMop), `takeBox` (batch/pickup: a condiment box from the corner), and `drop`: put
 * what is in hand on the floor (no bin in the shop; a carried tool goes home).
 */
export type FloorAction = 'takeMop' | 'clean' | 'returnMop' | 'takeBox' | 'drop';
/** `makes`: on a bot's insert step, what the machine should make from what the bot will hold there (absent on old saves). */
export type BotStep = { kind: 'use'; station: string; action: BotAction; makes?: ItemKind } | { kind: 'idle'; node: Vec2 }
  | { kind: 'floor'; node: Vec2; action: FloorAction };

export interface PassItem {
  item: DrinkId;
  ticksLeft: number;
  /** P3 B5: the cup's sloppy marks. */
  slips?: number;
  /** Gear G4h: a too-hot/too-cold cup waiting on the pass. */
  temp?: boolean;
  /** Batch/pickup: who set the cup on the pickup counter (absent = unknown, or classic). */
  by?: PlayerId;
  /** Feedback 2 A2 (Gear): the tick the drink was made; it cools from here (src/sim/cooling.ts). Absent = fresh. */
  madeAt?: number;
}

/** Absolute state.tick at which the event starts. */
export interface ScheduledEvent {
  kind: EventKind;
  startTick: number;
}

export interface ActiveEvent {
  kind: EventKind;
  ticksLeft: number;
  customerId?: number;
}

export interface Regular {
  name: string;
  drink: DrinkId;
  visits: number;
  lost: number;
  /** Phase 3 B3: 0..5; absent = 0. */
  loyalty?: number;
  /** Gear G10b: drawn by top-tier gear; tips big for a perfect 3★ cup, little for 1★ or less. Absent = ordinary. */
  snob?: true;
}

export interface BotState {
  personality: Personality;
  reactionTicksLeft: number;
  yieldTicksLeft: number;
  plan: BotStep[];
  claim: number | null;
  mistakes: number;
  claimDrink: DrinkId | null;
  thinkTicksLeft: number;
  path: Vec2[];
  yields: number;
  nodeRank: number;
  /** The node pinned for the current 'use' step (recomputed when nodeRank changes). */
  target?: Vec2 | null;
  waitTicks: number;
  noticeTicksLeft: number;
  /** Gear G4d: the claim (customer id) this bot already re-poured once after a too-hot/too-cold cup. */
  retried?: number;
  /** Round 3 item 5: this bot pressed E at the till and is standing there until the ring-up finishes. */
  ringing?: true;
}

export type SimEventKind =
  | 'cup.early'
  | 'cup.fumble'
  | 'pass.put'
  | 'pass.take'
  | 'pass.serve'
  | 'pass.stale'
  | 'trash'
  | 'bot.mistake'
  | 'event.start'
  | 'event.end'
  | 'inspection'
  | 'influencer'
  | 'espresso.shot'
  | 'espresso.collapse'
  | 'drop'
  | 'slip'
  | 'bump'
  | 'bump.spill'
  | 'customer.bump'
  | 'clean'
  | 'rogue.upset'
  | 'rogue.remade'
  | 'rogue.made'
  | 'rogue.stormed'
  | 'served'
  | 'challenge.won'
  | 'egg.cat'
  | 'egg.camper'
  | 'egg.nameMix'
  | 'egg.smoke'
  | 'egg.latteArt'
  | 'egg.secret'
  | 'closedEarly'
  | 'gear.quirk'
  | 'walkout'
  /** Batch/pickup (docs/superpowers/specs/2026-10-30-batch-pickup-design.md). */
  | 'till.rung'
  | 'till.start'
  | 'till.cancel'
  | 'pickup.take'
  | 'condiment.use'
  | 'condiment.black'
  | 'condiment.refill'
  | 'steep'
  /** P4 B6: someone (a person or a bot) picked up the branch's phone. */
  | 'call.answer'
  /** FB2 A3 (Gear runs): the back sink, drip pots and messes. */
  | 'sink.dump'
  | 'pot.lift'
  | 'pot.stale'
  | 'bin.leak'
  | 'mess.spawn'
  /** Feedback 2 A2: cups go cold (src/sim/cooling.ts). */
  | 'cup.cold'
  | 'pickup.cold'
  | 'pickup.takeBack'
  | 'review.bad'
  /** FB2 A4 (src/sim/fridge.ts): the fridge, milk out at the bar, putting away, spoiling at close, closing soon. */
  | 'fridge.take'
  | 'fridge.put'
  | 'milk.out'
  | 'milk.lift'
  | 'bar.lift'
  | 'fridge.auto'
  | 'supply.spoil'
  | 'closing.soon'
  /** FB2 B6: multi-drink orders (src/sim/orders.ts). */
  | 'order.combo'
  | 'order.office'
  | 'order.done'
  | 'order.lost'
  | 'office.call'
  /** FB2 C9 (src/sim/gear.ts): a wand added at night; the little wand clogging and being whacked clear. */
  | 'wand.add'
  | 'wand.clog'
  | 'wand.unclog'
  /** R3 6: tonight the cash first covers the next shop size ({ tier }). R3 7: the shop grew ({ from, to, diff }). */
  | 'grow.affordable'
  | 'grow.done';

/** R3 7: what a grow changes, before → after (src/sim/growth.ts growDiff). */
export interface GrowDiff {
  queue: { from: number; to: number };
  price: { from: number; to: number };
  traffic: { from: number; to: number };
  rent: { from: number; to: number };
  crowd: { from: string; to: string };
  unlocks: string[];
}

export interface SimEvent {
  seq: number;
  tick: number;
  kind: SimEventKind;
  data: Record<string, string | number | boolean | GrowDiff>;
}

/** R4 e: how a barista looks. The UI defines the ids (hairstyle, outfit...); the sim only stores and forwards them
 *  (src/sim/look.ts cleans them: 1-32 chars of A-Z a-z 0-9 _ # -, so a colour may be `#rrggbb`). Bots have none. */
export interface PlayerLook {
  hair: string;
  hairColor?: string;
  skin: string;
  outfit: string;
  shirtColor: string;
}

export interface Player {
  id: PlayerId;
  name: string;
  /** R4 e: the character look chosen by this person (absent = the UI draws its default). Editable at night/weekEnd. */
  look?: PlayerLook;
  pos: Vec2;
  moveDir: Vec2;
  interactQueued: boolean;
  holding: ItemKind | null;
  /** P3 B5: sloppy marks on the cup in hand (absent = 0). */
  cupSlips?: number;
  /** Gear G4h: the cup in hand came out too hot or too cold (half tip when served). */
  cupTemp?: boolean;
  /** Feedback 2 A2 (Gear): the made tick of the cup in hand (its clock keeps running); cleared when the hands empty. */
  heldSince?: number;
  connected: boolean;
  bot?: BotState;
  idleTicks: number;
  /** Espresso Easter egg (src/sim/espresso.ts); absent until they drink a shot today. */
  espresso?: EspressoState;
  /** 4-way unit vector from the last non-zero moveDir; starts facing down. */
  facing: Vec2;
  /** The latest move input, kept through a stun so a held key resumes motion. */
  heldDir: Vec2;
  stunTicksLeft: number;
  /** Bumps (src/sim/bumps.ts): ticks left walking at stagger speed after a collision (absent = 0). */
  staggerTicksLeft?: number;
  /** Bumps: ticks before this barista can be part of another bump (absent = 0). */
  bumpCooldown?: number;
  /** What the barista carries instead of a cup: the mop, a condiment stock box, or (FB2 A3) a drip pot on its way to the sink (Gear runs).
   *  FB2 A4: `milk`, a milk carton (from the fridge, or lifted off the bar at closing); `bar`, what was left on the
   *  condiment bar, lifted to put away in the fridge. Both hold `carry` servings. Neither is a cup: they don't cool. */
  tool: 'mop' | 'box' | 'pot' | 'milk' | 'bar' | null;
  /** FB2 A4: servings in the carried milk carton or bar box (absent with any other tool). */
  carry?: number;
  cleaningTicksLeft: number;
  cleaningMess: number | null;
  dropQueued: boolean;
  /** tileOf(pos) as of the last tile-entry check. */
  tile: Vec2;
  /** Phase 3 B1: this barista's role (src/sim/roles.ts). Absent = no role. */
  role?: RoleId;
}

export interface Station {
  id: string;
  kind: StationKind;
  pos: Vec2;
  busyTicksLeft: number;
  output: ItemKind | null;
  /** A rogue customer's id while they use the station. */
  occupiedBy: number | null;
  /** What the station is brewing (a station has several recipes since B5); null when idle. */
  making?: ItemKind | null;
  /** P3 B5: sloppy marks on the cup inside; the length of the current run; the tick its drink finished. */
  cupSlips?: number;
  busyTotal?: number;
  doneAt?: number;
  /** The tick `output` appeared (machine finished, or an R-drop); bots leave an item alone until it has sat a while. Absent = unknown. */
  outputSince?: number;
  /** Gear Tree: which tier of gear this station is (absent = today's machine, every non-Gear run). */
  gear?: GearId;
  /** Gear G9: the second side of a machine that shares a slot (the dual boiler's steam wand, a second group). */
  twin?: true;
  /**
   * FB2 C9: the machine's steam wand (absent = none). On an espresso machine (not its second group) it is what the UI
   * draws and offers "Add a wand" by; the wand itself is the 'steamer' twin beside it, which carries the same value.
   */
  wand?: WandKind;
  /** FB2 C9: on a wand's 'steamer' twin, the espresso machine it is on (a built-in wand's speed follows the machine). */
  wandOf?: GearId;
  /** Gear G10: a pour-over in "flow state" works at double speed until this tick. */
  flowUntil?: number;
  /** Gear Tree: cold brew batch cups left today (absent = no cap). */
  batchLeft?: number;
  /** Batch/pickup: how many of `batchLeft` were steeped the day before (poured first; absent = none). */
  batchOld?: number;
  /** Gear G4d: cups left in a drip machine's pot (absent = no pot brewed). */
  potLeft?: number;
  /** Gear G4d: the tick the pot goes cold (absent = never, or no pot). */
  potColdAt?: number;
  /** Gear G4d: this pot came out too hot or too cold (every cup from it complains). */
  potOff?: 'hot' | 'cold';
  /** FB2 A3: the pot is off the machine, carried by this player to the sink; the machine can't brew until it is back. */
  potOut?: PlayerId;
  /** FB2 A3: the pot sat overnight with cups in it: no pour and no brew until it is dumped at the sink. */
  stale?: true;
  /** Gear G5: the Pod-o-Matic jammed (FB2 C9: or the little wand clogged); empty hands at it whack it back to life. */
  jammed?: true;
  /** Gear G5: dead until tonight (no gear does this since the battery whisk retired in FB2 C9; kept for quirks). */
  dead?: true;
  /** Gear G5: uses left before the battery whisk dies today. */
  usesToDie?: number;
  /** Gear G5: Lucky Sock day, the sock's lint mark is off. */
  lucky?: true;
}

export interface Customer {
  id: number;
  drink: DrinkId;
  patienceLeft: number;
  patienceMax: number;
  kind?: CustomerKind; // absent = 'normal'
  extra?: DrinkId[];
  name?: string;
  upset?: { ticksLeft: number };
  /** Easter egg pack 2 (B8): Wi-Fi camper or a name mix-up. */
  egg?: 'camper' | 'nameMix';
  /** Name printed on the cup when `egg === 'nameMix'`. */
  wrongName?: string;
  /** P3 B7: asked for the signature drink by name. */
  sig?: true;
  /** Gear G4g: the tick the till rang them up (absent = not rung). */
  rungAt?: number;
  /** Batch/pickup: waiting to order at the till, or rung up and waiting at pickup (absent = 'order'). */
  stage?: 'order' | 'pickup';
  /**
   * FB2 B6 (Gear runs): a multi-drink ticket (a group, a combo, an office run). Each cup taken marks one item done;
   * the whole ticket pays when the last item is taken. `drink` is the first item still to come and `extra` the rest
   * (kept in step, so views that read drink/extra still work). Absent = a one-drink order (or a classic group).
   */
  items?: OrderItem[];
  /** FB2 B6: what kind of multi-drink ticket this is (absent for groups and one-drink orders). */
  order?: 'combo' | 'office';
  /** Round 4 c: the ticks a person bumped into them in the last few seconds (oldest first; absent = none). */
  bumpedAt?: number[];
}

/** FB2 B6: one drink on a multi-drink ticket. Once taken (`done`) it remembers how the cup came, for the bill. */
export interface OrderItem {
  drink: DrinkId;
  done: boolean;
  /** Who set the cup down, its sloppy marks, an off-temperature or lukewarm cup (half tip), black coffee (tip ×0.8). */
  by?: PlayerId;
  slips?: number;
  temp?: true;
  black?: true;
  /** The cup was cold: taken, never paid. */
  cold?: true;
}

/** P3 B7: the crew's signature drink. `premium` is in $0.50 steps; `since` is the day the recipe was set. */
/** P3 B9: the rival café. `scouted` is the night (by `day`) the crew last peeked; `copy` is its knock-off of a signature. */
export interface Rival {
  scouted?: number;
  copy?: { drink: DrinkId; twist: TwistId; since: number; price: number; day: number };
  /** P4 B1: the day the crew countered the rival's happy hour (prices down that day). */
  counter?: number;
  /** P4 F2: the day our stamp card came out (answers the rival's loyalty card for good). */
  stamps?: number;
}

/** P4 B4: a second shop run off-screen (see sim/branch.ts). `spent` is what opening it cost. */
export interface Branch { area: AreaId; staff: number; openedDay: number; spent: number; by: string; /** P4 B5: value of stock sent from home, spent on the branch's cups first. */ stockCredit?: number }

/** P4 B2: one week of a season: its profit target (none for week 1) and the score it added. */
export interface SeasonWeek { week: number; target: number | null; profit: number }
/** P4 B2: `base` is the week-1 score (floored); `startScore` the run score when the current week began. */
export interface Season { base: number; startScore: number; weeks: SeasonWeek[]; done?: true }

/** P3 B10: parody ad platforms, and how a campaign landed. */
export type AdId = 'palmbook' | 'nextdoorish' | 'linkedout' | 'glimpse' | 'tiktak';
export type AdOutcome = 'flop' | 'ok' | 'viral';
/** A campaign booked at night for `day`; `outcome` is filled in when the doors open. */
/** P3 B11: what a pitch is for. */
export type PitchKind = 'promo' | 'item';
export type PitchTier = 'passed' | 'meh' | 'greenlit' | 'ovation';
/** P3 B11: a scored pitch for `day` (the coming day when pitched at night). */
export interface PitchResult {
  day: number;
  by: string;
  kind: PitchKind;
  text: string;
  /** One score (0-10) and one verdict line per judge. */
  scores: number[];
  verdicts: string[];
  total: number;
  tier: PitchTier;
  panel: string;
  notes: string[];
  /** Promo: traffic multiplier. Item: tip rate added. */
  boost: number;
}

/** P3 B13: the growth path, smallest first. */
export type TierId = 'stand' | 'cart' | 'cafe';

/** P3 B12: the checkout path. */
export type CheckoutId = 'register' | 'kiosk' | 'squarely';
/** Owned checkouts (always the register) and the one in use; `since` is the day the latest was installed. */
export interface CheckoutState {
  owned: CheckoutId[];
  active: CheckoutId;
  since?: number;
  by?: string;
}

export interface AdCampaign {
  id: AdId;
  day: number;
  by: string;
  outcome?: AdOutcome;
}

export interface Signature {
  name: string;
  drink: DrinkId;
  twist: TwistId;
  premium: number;
  since: number;
}

export type Effect =
  | { kind: 'stationSpeed'; station: StationKind; mul: number }
  | { kind: 'moveSpeed'; mul: number }
  | { kind: 'price'; drink?: DrinkId; mul: number }
  | { kind: 'traffic'; mul: number }
  | { kind: 'patience'; mul: number }
  | { kind: 'tipRate'; add: number }
  | { kind: 'orderBias'; drink: DrinkId; mul: number }
  | { kind: 'supplyCost'; supply: SupplyId; mul: number }
  /** P3 B4: fresh stock spoils at this multiple of the usual share overnight. */
  | { kind: 'spoil'; mul: number }
  | { kind: 'gamble'; chance: number; win: Effect[]; lose: Effect[] }
  /** Neighbourhood days: tilt every hot or every iced drink at once (src/data/drinks.ts). */
  | { kind: 'orderTag'; tag: 'hot' | 'iced'; mul: number }
  /** Reweight one kind of walk-in in the customer mix. */
  | { kind: 'customerMix'; customer: 'impatient' | 'group' | 'regular'; mul: number }
  /** Make one event likelier (or rarer) when today's events are drawn. */
  | { kind: 'eventOdds'; event: EventKind; mul: number }
  /** Spots in the queue (campers take tables, so the line fills sooner). */
  | { kind: 'queue'; add: number }
  /** Menu variety (B5): put a drink on the menu for good, from the night it is bought. */
  | { kind: 'unlock'; drink: DrinkId }
  /** Upgrade cards (B6): stars added to (or taken off) the rating at each closing. */
  | { kind: 'quality'; add: number }
  /** A temp barista (a rookie bot) clocks in for the day, if a spot is free. */
  | { kind: 'temp' }
  /** Weather radio: tomorrow's events are drawn at night and shown on the paper. */
  | { kind: 'reveal' };

/** Upgrade paths (B6): faster hands, better cups, more people through the door. */
export type CardPath = 'speed' | 'quality' | 'reach';
/** Card sets (B6): owning two cards of a set switches on its bonus (src/data/cardSets.ts). */
export type CardSetId = 'espressoBar' | 'milkLab' | 'coldBar' | 'cosyCorner' | 'kerbAppeal' | 'craft' | 'crewKit' | 'fullMenu';

/** Tomorrow's events as heard on the weather radio: kinds and ticks after opening. */
export interface RadioReport {
  day: number;
  events: { kind: EventKind; offset: number }[];
}

export interface CatalogueItem {
  id: string;
  name: string;
  category: 'equipment' | 'pos' | 'seating' | 'decor' | 'marketing' | 'staff' | 'oddball';
  cost: number;
  rarity: Rarity;
  duration: 'permanent' | 'tomorrow';
  effects: Effect[];
  requires?: string[];
  excludes?: string[];
  flavor: string;
  /** B6: which upgrade path the card belongs to. */
  path: CardPath;
  /** B6: owning two of a set switches on the set bonus (permanent cards only). */
  set?: CardSetId;
  /** B6: a spicy card has a real downside next to its upside. */
  spicy?: boolean;
}

export interface OwnedItem {
  itemId: string;
  effects: Effect[];
}

export interface Scenario {
  id: ScenarioId;
  name: string;
  note: string;
  effects: Effect[];
}

/** Off (0), a fixed count, or 'auto' (fill empty seats). */
export type BotsChoice = Settings['bots'];

export interface Settings {
  dayLengthSec: number;
  nightLengthSec: number;
  pace: Pace;
  bots: number | 'auto';
  botSkill: BotSkill;
}

/** One optional daily challenge and its live progress (B7). */
export interface ChallengeProgress {
  id: string;
  label: string;
  blurb: string;
  need: number;
  have: number;
  reward: number;
  done: boolean;
  failed: boolean;
}

/** Gear G8 (doc §8): a big buy or sell waiting on a majority of connected humans. */
export interface GearVote { by: PlayerId; byName: string; action: 'buy' | 'sell'; gear: GearId; index?: number; amount: number; yes: PlayerId[]; no: PlayerId[]; /** FB2 C9: a wand bought with the machine. */ wand?: AddOnWand }

export interface DayStats {
  day: number;
  served: number;
  lost: number;
  turnedAway: number;
  sales: number;
  tips: number;
  rent: number;
  wasted?: number;
  fines?: number;
  bonus?: number;
  botMistakes?: number;
  lostRegulars?: number;
  /** P3 B4: fresh stock thrown out at closing, and what it had cost. */
  spoiled?: Partial<Record<SupplyId, number>>;
  spoiledValue?: number;
  /** P3 B4: pastries sold on the side. */
  pastries?: number;
  inspection?: 'pass' | 'fail' | null;
  events?: EventKind[];
  drinks?: Record<DrinkId, number>;
  /** Gear G7: tips per drink family today (Gear runs only; the receipt's per-family lines). */
  tipsByFamily?: Partial<Record<'espresso' | 'milky' | 'iced' | 'filter', number>>;
  influencer?: 'served' | 'lost' | null;
  /** Espresso Easter egg: ambulance bill run up today, and hospital tab paid off from today's profit. */
  ambulance?: number;
  debtPaid?: number;
  rogues?: number;
  /** Chaos pack: baristas who slipped on a mess today (a receipt line, nothing else). */
  slips?: number;
  /** Bumps: collisions between baristas today, and how many of them knocked something out of someone's hands. */
  bumps?: number;
  bumpSpills?: number;
  /** Round 4 c: people walking into customers today. */
  customerBumps?: number;
  /** Perfect serves today (patience left ≥ threshold). */
  perfect?: number;
  /** P3 B5: cups scored today and their stars summed. */
  cups?: number;
  cupStars?: number;
  perfectCups?: number;
  /** P3 B6: combos discovered today, the day's summed (stars − 3) over twisted cups, and twist cost. */
  combosFound?: string[];
  comboStarSum?: number;
  twistCost?: number;
  /** P3 B7: signature serves, their summed (stars − 3), and the bonus they earned. */
  sigServed?: number;
  sigStarSum?: number;
  sigBonus?: number;
  /** P3 B10: the ad that ran today and how it landed. */
  ad?: { id: AdId; outcome: AdOutcome };
  /** P3 B12: what the checkout cost today (card fees plus the kiosk licence). */
  checkoutFees?: number;
  /** P3 B15: wages paid to the hired bot baristas at closing (Gear runs; absent = none). */
  wages?: number;
  /** Challenge tip paid at closing (folded into bonus too). */
  challengeBonus?: number;
  /** Challenge ids won today. */
  challengesWon?: string[];
  /** FB1 WP3: seconds that were left on the day clock when a unanimous vote closed the shop (absent = ran to the bell). */
  closedEarly?: number;
  /** FB1 WP4: people who walked up to a sold-out board and left (absent until it happens; migrated to 0). */
  soldOutWalkouts?: number;
  /** Round 3 money: would-be customers who read the board and left over the price (absent until it happens; never lost or turned away). */
  priceWalkouts?: number;
  /** P4 B3 manager report: summed wait (ticks from arrival to the hand-off) over served customers. */
  waitTicks?: number;
  /** P4 B3: takings (price + tip) per drink today. */
  takingsByDrink?: Partial<Record<DrinkId, number>>;
  /** P4 B3: who handed off what today: serves and takings per player (bots included). */
  byPlayer?: Record<PlayerId, { serves: number; takings: number }>;
  /** P4 B4: the second shop's day (its profit is already in the till). */
  branch?: { served: number; walked: number; takings: number; costs: number; profit: number; fromStock?: number; /** P4 B6: today's phone call and how it ended. */ call?: { kind: 'machine' | 'order'; took: boolean; by?: string } };
  /** FB1 WP4: seconds into the day when the board first sold out. */
  soldOutAt?: number;
  /** Batch/pickup: drip and cold brew customers who found the condiment bar empty and took it black. */
  blackCoffees?: number;
  /** FB2 A4: condiment servings left out on the bar at closing and thrown out (their cost is in `spoiledValue`). */
  spoiledBar?: number;
  /** FB2 B6: how today's office run ended (absent = none came). */
  office?: 'served' | 'lost';
  /** FB2 B6: cups served to office runs beyond the first (an office run counts as one customer for reputation). */
  officeExtra?: number;
}

/** The whole game. Plain data, JSON-safe, stepped by pure functions. */
export interface GameState {
  /** P3 B16: the head start this run opened with (Gear runs only; absent in old saves). */
  perk?: PerkId;
  seed: number;
  rng: number;
  tick: number;
  phase: Phase;
  phaseTicksLeft: number;
  day: number;
  unlimited: boolean;
  /** R4 a: a dev run (`?dev=1`): cash is kept topped up, nothing is saved to meta, records or history. Set only when true. */
  dev?: true;
  /** R4 a: the host paused the night (dev runs only): the night timer stops; cleared when the shop opens. */
  devPaused?: true;
  /** P4 B2: the four-week season started by Keep going after week 1 (Gear runs). */
  season?: Season;
  /** P4 B4: the second shop, once opened. */
  branch?: Branch;
  bankrupt: boolean;
  hostId: PlayerId;
  settings: Settings;
  cash: number;
  startingCash: number;
  reputation: number;
  supplies: Record<SupplyId, number>;
  scenario: ScenarioId;
  owned: OwnedItem[];
  activeTomorrow: OwnedItem[];
  hand: string[];
  boughtTonight: string[];
  ready: PlayerId[];
  /** Relaxed night only: ticks left on the last call. Absent means no last call has started. */
  lastCall?: number;
  players: Player[];
  stations: Station[];
  customers: Customer[];
  nextCustomerId: number;
  today: DayStats;
  days: DayStats[];
  morningNotes: string[];
  /** FB1 WP3: connected humans who have voted to close early (absent = nobody; cleared each phase). */
  closeVotes?: PlayerId[];
  /** P4 B6: who answered the branch's phone call, and whether they fixed it / took the order. */
  callAnswer?: { day: number; take: boolean; by: string };
  /** Review I2: the day today's branch call first rang (absent = it hasn't, so closing doesn't count it as missed). */
  callRang?: number;
  /**
   * FB2 B6: today's office run (Gear, cart and café, from day 3), drawn at day start: it walks in `at` ticks after
   * opening (the phone rings `ORDERS.office.callSeconds` before); `called` once it rang, `came` its customer id.
   */
  office?: { day: number; at: number; called?: true; came?: number };
  /**
   * Round 3 item 5: the ring-up in progress at the till (Gear runs; absent = nobody is ringing). `by` is the person
   * ringing, or '' for a self-order screen. Done when `tick - startedAt >= ticks`; `ringProgress(state)` (src/sim/till.ts) is 0..1.
   */
  ringUp?: { customer: number; by: PlayerId | ''; startedAt: number; ticks: number };
  /** FB1 WP3: tick stamp of when the queue last emptied (absent while someone is queued). */
  emptySince?: number;
  pass: PassItem[];
  menu: Record<DrinkId, boolean>;
  /** Phase 3 B2: price steps per drink ($0.25 each); absent or 0 = list price. */
  priceSteps?: Partial<Record<DrinkId, number>>;
  /** P3 B6: tonight's house twist per drink, and the combos discovered so far ("drink:twist" -> stars). */
  twists?: Partial<Record<DrinkId, TwistId>>;
  tasteBook?: Record<string, number>;
  /** P3 B8: the taste season each notebook entry was learned in (absent = season 0). */
  tasteSeason?: Record<string, number>;
  /** P3 B7: the signature drink, if the crew has designed one. */
  signature?: Signature;
  /** P3 B9: Starbuck$ down the street. */
  rival?: Rival;
  /** P3 B10: the ad campaign booked for tomorrow (or running today). */
  ad?: AdCampaign;
  /** P3 B12: the checkout path (absent = the register only). */
  checkout?: CheckoutState;
  /** P3 B13: how big the shop is (absent = the café, as every run before B13). */
  tier?: TierId;
  /** P3 B13: each time the crew grew the shop this run (the tier grown into, the coming day, who did it). */
  tierLog?: { tier: TierId; day: number; by: string }[];
  /** R3 6: tonight's `grow.affordable` has fired (reset each night). */
  growNudged?: true;
  /** FB1 WP5: what stands in each back-bar slot, left to right (absent = the tier's defaults; see sim/slots.ts). */
  slots?: (StationKind | null)[];
  /** FB1 WP5: stations the crew owns but has not placed (absent = none). */
  equipment?: StationKind[];
  /** FB1 WP5: each station bought from the stations shop (what, the coming day, who bought it). */
  equipLog?: { station: StationKind; day: number; by: string }[];
  /** Gear Tree (docs/GEAR_TREE.md): true for a Gear run (absent = today's game; off unless created with `gear`). */
  gear?: true;
  /** Batch/pickup: the sticky cold brew steep target for tomorrow (Gear runs; absent = the taps' full cap). */
  steep?: number;
  /** Batch/pickup: fresh cold brew cups carried overnight (absent = none). */
  coldBrewLeft?: number;
  /** Batch/pickup: the condiment bar (Gear runs; absent in classic runs). */
  condiments?: { servings: number };
  /** Batch/pickup: condiment stock boxes waiting in the corner (Gear runs). */
  condimentBoxes?: number;
  /** FB2 A4: the fridge the crew bought (the cube at the stand, the Udder-Matic at the café; absent = none bought). The shop's
   *  fridge is the better of this and the one its size comes with (sim/fridge.ts `fridgeGear`). `supplies.milk` is inside it. */
  fridge?: FridgeId;
  /** FB2 A4: milk servings out at the bar, where the steamer, a steam wand and the tap draw from (Gear runs; absent = 0). */
  milkOut?: number;
  /** FB2 A4: condiment servings put away in the fridge at closing; they go back on the bar next morning (absent = 0). */
  barAway?: number;
  /** FB2 A4: an open co-op proposal to buy a $50+ fridge card (the Udder-Matic); voted with the gear vote input, one
   *  proposal (gear or fridge) at a time, lapses at opening. The result goes to `gearVoteLast`. */
  fridgeVote?: { by: PlayerId; byName: string; fridge: FridgeId; amount: number; yes: PlayerId[]; no: PlayerId[] };
  /** FB2 A4: the tick "closing soon" began today (Gear runs; absent = not yet, or night). */
  closingSoonAt?: number;
  /** Gear Tree G6: drinks served this run, for drinks that level up with use (absent = none yet). */
  gearServed?: Partial<Record<DrinkId, number>>;
  /** Gear Tree G6: drinks learned today, for tomorrow's morning note (cleared each morning). */
  gearLearned?: string[];
  /** Gear Tree G7c: walk-ins today who asked for a loved family you don't serve (for tomorrow's morning note). */
  gearAsked?: Partial<Record<DrinkFamily, number>>;
  /** Gear Tree: the gear in each slot, parallel to `slots` (Gear runs only). */
  slotGear?: (GearId | null)[];
  /** FB2 C9: the add-on wand on each slot's espresso machine, parallel to `slots` (absent or null = none; built-in wands aren't listed). */
  slotWand?: (AddOnWand | null)[];
  /** Gear Tree: every buy, upgrade and sale (what, the coming day, who, the cash change). */
  /** Gear G8: an open co-op proposal for a big buy/sell (night only; lapses at opening). */
  gearVote?: GearVote;
  /** Gear G8: how the last proposal ended (shown on the board until the next one). */
  gearVoteLast?: { text: string; passed: boolean };
  /** FB2 C9: `wand` = a wand bought or sold with the machine (its price is in `cash`); action 'wand' = one added later. */
  gearLog?: { gear: GearId; action: 'buy' | 'sell' | 'wand'; day: number; by: string; cash: number; wand?: AddOnWand }[];
  /** P3 B11: the latest pitch to the panel (it applies on its `day` when green-lit). */
  pitch?: PitchResult;
  eventSchedule: ScheduledEvent[];
  events: ActiveEvent[];
  regulars: Regular[];
  log: SimEvent[];
  nextLogSeq: number;
  /** Espresso Easter egg: unpaid hospital tab, paid off from future profits. Absent = 0. */
  debt?: number;
  messes: Mess[];
  nextMessId: number;
  cleanliness: number;
  mop: Mop;
  rogue: Rogue | null;
  /** Neighbourhood forecast for state.day (at night: the coming day), from src/sim/forecast.ts. */
  forecast: ForecastId;
  /** Drinks the café knows how to make (B5): base drinks, day unlocks and card unlocks, in DRINK_IDS order. */
  unlocked: DrinkId[];
  /** Drinks that joined the menu tonight (day unlocks and cards), for the night banner. */
  freshDrinks?: DrinkId[];
  /** Re-rolls of the hand tonight (B6); each costs more. Absent = 0. */
  rerolls?: number;
  /** Weather radio (B6): tomorrow's events, drawn at night. */
  radio?: RadioReport;
  /** Optional daily challenges for state.day (B7); dealt at startDay. */
  challenges?: ChallengeProgress[];
  /** Preview of tomorrow's challenges, shown on the night paper (B7). */
  challengePreview?: ChallengeProgress[];
  /** Easter egg pack 2 (B8): cat, camper, smoke, latte art, secret menu. */
  eggs?: EggsState;
  /** Per-player counters for the week's awards (B10), tallied from the log. Absent on old saves. */
  crew?: CrewStats;
}

export type PlayerInput =
  | { kind: 'move'; playerId: PlayerId; x: number; y: number; interact: boolean }
  | { kind: 'buy'; playerId: PlayerId; itemId: string }
  | { kind: 'reroll'; playerId: PlayerId }
  | { kind: 'restock'; playerId: PlayerId; supply: SupplyId; packs: number }
  | { kind: 'ready'; playerId: PlayerId }
  | { kind: 'weekEnd'; playerId: PlayerId; choice: 'stop' | 'continue' }
  | { kind: 'menu'; playerId: PlayerId; drink: DrinkId; on: boolean }
  | { kind: 'price'; playerId: PlayerId; drink: DrinkId; step: number }
  | { kind: 'twist'; playerId: PlayerId; drink: DrinkId; twist: TwistId | null }
  | { kind: 'scout'; playerId: PlayerId }
  | { kind: 'rivalCounter'; playerId: PlayerId; on?: boolean }
  | { kind: 'stampCard'; playerId: PlayerId }
  /** P3 B15: hire one more bot barista, or let the newest one go. Gear runs, night only. */
  | { kind: 'staff'; playerId: PlayerId; action: 'hire' | 'fire' }
  | { kind: 'branch'; playerId: PlayerId; action: 'open' | 'staff' | 'send' | 'close'; area?: AreaId; staff?: number; supply?: SupplyId }
  | { kind: 'ad'; playerId: PlayerId; ad: AdId | null }
  | { kind: 'checkout'; playerId: PlayerId; checkout: CheckoutId }
  | { kind: 'grow'; playerId: PlayerId; tier: TierId }
  | { kind: 'slot'; playerId: PlayerId; index: number; station: StationKind | null }
  | { kind: 'equip'; playerId: PlayerId; station: StationKind }
  /** Batch/pickup: tomorrow's cold brew steep target (sticky). Gear runs, night only, people only. */
  | { kind: 'steep'; playerId: PlayerId; cups: number }
  /** Batch/pickup: buy condiment stock boxes ($6 each). Gear runs, night only, people only. */
  | { kind: 'condimentBox'; playerId: PlayerId; boxes: number }
  /** FB2 A4: buy a fridge card on offer (the Dorm Room Cube at a shop with no fridge, the Udder-Matic at the café). Gear, night, people only. */
  | { kind: 'fridge'; playerId: PlayerId; fridge: FridgeId }
  /** Gear Tree: buy a tier (an upgrade trades in the lower tier of its tree) or sell the gear in slot `index`. Night only. */
  | { kind: 'gear'; playerId: PlayerId; action: 'buy'; gear: GearId; /** FB2 C9: an add-on wand bought with it (E3: weak; E4: weak or strong). */ wand?: AddOnWand }
  /** FB2 C9: add a wand to (or upgrade the wand on) the espresso machine `station` (its station id). Night only, people only. */
  | { kind: 'wand'; playerId: PlayerId; station: string; wand: AddOnWand }
  | { kind: 'gear'; playerId: PlayerId; action: 'sell'; index: number }
  | { kind: 'gear'; playerId: PlayerId; action: 'vote'; yes: boolean }
  | { kind: 'pitch'; playerId: PlayerId; pitchKind: PitchKind; text: string }
  | { kind: 'signature'; playerId: PlayerId; sig: { name: string; drink: DrinkId; twist: TwistId; premium: number } | null }
  | { kind: 'role'; playerId: PlayerId; role: RoleId | null }
  | { kind: 'settings'; playerId: PlayerId; settings: Partial<Settings> }
  | { kind: 'espresso'; playerId: PlayerId }
  /** FB1 WP3: vote (on) or withdraw (off) to close the shop early; every connected human must agree. */
  | { kind: 'closeEarly'; playerId: PlayerId; on: boolean }
  /** R4 a: host only, dev runs only, night or week-end only: stop (or restart) the night timer. */
  | { kind: 'devPause'; playerId: PlayerId; paused: boolean }
  | { kind: 'call'; playerId: PlayerId; take: boolean }
  | { kind: 'join'; playerId: PlayerId; name: string; look?: PlayerLook }
  /** R4 e: set my own look (night or week end only; a bad look is refused). */
  | { kind: 'look'; playerId: PlayerId; look: PlayerLook }
  | { kind: 'leave'; playerId: PlayerId }
  | { kind: 'drop'; playerId: PlayerId }
  /** Secret menu code (B8): short word or Konami-style sequence. */
  | { kind: 'secret'; playerId: PlayerId; code: string };

export interface CreateRunOptions {
  seed: number;
  hostId: PlayerId;
  players: { id: PlayerId; name: string; look?: PlayerLook }[];
  settings?: Partial<Settings>;
  /** P3 B13: the size the run opens at (absent = the café; new games from the title start at the stand). */
  tier?: TierId;
  /** Gear Tree: start a Gear run ($120, no stations, no supplies). The sim default stays classic (old saves, golden tests); since v3.0.0 the UI sets it for every new run (`?gear=0` opts out). */
  gear?: boolean;
  /** P3 B16: a head start earned in earlier runs (Gear runs only; applied once at createRun). */
  perk?: PerkId;
  /** R4 a: a dev run (`?dev=1`): unlimited cash, a pausable night, never saved to meta, records or history. */
  dev?: boolean;
}

export interface RunRecord {
  date: string;
  seed: number;
  scenario: ScenarioId;
  players: string[];
  daysCompleted: number;
  score: number;
  itemsBought: string[];
  /** R4 a: set on a dev run's line; the history store drops these. */
  dev?: true;
}
