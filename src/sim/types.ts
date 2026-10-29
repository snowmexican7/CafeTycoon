import type { RoleId } from './roles';
import type { EggsState } from './eggs';
import type { EspressoState } from './espresso';
import type { ForecastId } from '../data/forecasts';
import type { CrewStats } from './stats';

export type PlayerId = string;
export type DrinkId = 'espresso' | 'latte' | 'coldBrew' | 'icedLatte' | 'mocha' | 'matcha' | 'special';
export type SupplyId = 'beans' | 'milk' | 'concentrate' | 'flavour' | 'pastry';
export type ItemKind = 'grounds' | DrinkId;
export type StationKind = 'grinder' | 'espresso' | 'steamer' | 'coldBrewTap' | 'counter' | 'trash';
export type Phase = 'night' | 'day' | 'closing' | 'weekEnd' | 'ended';
export type ScenarioId = 'normal' | 'campusTown' | 'rainyWeek' | 'touristSeason';
export type Rarity = 'common' | 'uncommon' | 'rare';
export type Pace = 1 | 2 | 3 | 4 | 5;
export type EventKind = 'rushHour' | 'powerFlicker' | 'influencerVisit' | 'healthInspector';
export type CustomerKind = 'normal' | 'impatient' | 'group' | 'regular' | 'influencer';
export type Personality = 'rookie' | 'steady' | 'veteran' | 'human'; // 'human' = tester stand-in
export type BotSkill = 1 | 2 | 3 | 4 | 5;
export type BotAction = 'insert' | 'take' | 'serve' | 'put' | 'trash';

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
export type FloorAction = 'takeMop' | 'clean' | 'returnMop';
export type BotStep = { kind: 'use'; station: string; action: BotAction } | { kind: 'idle'; node: Vec2 }
  | { kind: 'floor'; node: Vec2; action: FloorAction };

export interface PassItem {
  item: DrinkId;
  ticksLeft: number;
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
}

export type SimEventKind =
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
  | 'egg.secret';

export interface SimEvent {
  seq: number;
  tick: number;
  kind: SimEventKind;
  data: Record<string, string | number | boolean>;
}

export interface Player {
  id: PlayerId;
  name: string;
  pos: Vec2;
  moveDir: Vec2;
  interactQueued: boolean;
  holding: ItemKind | null;
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
  tool: 'mop' | null;
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
  influencer?: 'served' | 'lost' | null;
  /** Espresso Easter egg: ambulance bill run up today, and hospital tab paid off from today's profit. */
  ambulance?: number;
  debtPaid?: number;
  rogues?: number;
  /** Chaos pack: baristas who slipped on a mess today (a receipt line, nothing else). */
  slips?: number;
  /** Perfect serves today (patience left ≥ threshold). */
  perfect?: number;
  /** Challenge tip paid at closing (folded into bonus too). */
  challengeBonus?: number;
  /** Challenge ids won today. */
  challengesWon?: string[];
}

/** The whole game. Plain data, JSON-safe, stepped by pure functions. */
export interface GameState {
  seed: number;
  rng: number;
  tick: number;
  phase: Phase;
  phaseTicksLeft: number;
  day: number;
  unlimited: boolean;
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
  players: Player[];
  stations: Station[];
  customers: Customer[];
  nextCustomerId: number;
  today: DayStats;
  days: DayStats[];
  morningNotes: string[];
  pass: PassItem[];
  menu: Record<DrinkId, boolean>;
  /** Phase 3 B2: price steps per drink ($0.25 each); absent or 0 = list price. */
  priceSteps?: Partial<Record<DrinkId, number>>;
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
  | { kind: 'role'; playerId: PlayerId; role: RoleId | null }
  | { kind: 'settings'; playerId: PlayerId; settings: Partial<Settings> }
  | { kind: 'espresso'; playerId: PlayerId }
  | { kind: 'join'; playerId: PlayerId; name: string }
  | { kind: 'leave'; playerId: PlayerId }
  | { kind: 'drop'; playerId: PlayerId }
  /** Secret menu code (B8): short word or Konami-style sequence. */
  | { kind: 'secret'; playerId: PlayerId; code: string };

export interface CreateRunOptions {
  seed: number;
  hostId: PlayerId;
  players: { id: PlayerId; name: string }[];
  settings?: Partial<Settings>;
}

export interface RunRecord {
  date: string;
  seed: number;
  scenario: ScenarioId;
  players: string[];
  daysCompleted: number;
  score: number;
  itemsBought: string[];
}
