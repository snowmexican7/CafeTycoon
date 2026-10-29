import type { EspressoState } from './espresso';
import type { ForecastId } from '../data/forecasts';

export type PlayerId = string;
export type DrinkId = 'espresso' | 'latte' | 'coldBrew';
export type SupplyId = 'beans' | 'milk' | 'concentrate';
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
  | 'served';

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
}

export interface Station {
  id: string;
  kind: StationKind;
  pos: Vec2;
  busyTicksLeft: number;
  output: ItemKind | null;
  /** A rogue customer's id while they use the station. */
  occupiedBy: number | null;
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
  | { kind: 'gamble'; chance: number; win: Effect[]; lose: Effect[] }
  /** Neighbourhood days: tilt every hot or every iced drink at once (src/data/drinks.ts). */
  | { kind: 'orderTag'; tag: 'hot' | 'iced'; mul: number }
  /** Reweight one kind of walk-in in the customer mix. */
  | { kind: 'customerMix'; customer: 'impatient' | 'group' | 'regular'; mul: number }
  /** Make one event likelier (or rarer) when today's events are drawn. */
  | { kind: 'eventOdds'; event: EventKind; mul: number }
  /** Spots in the queue (campers take tables, so the line fills sooner). */
  | { kind: 'queue'; add: number };

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
}

export type PlayerInput =
  | { kind: 'move'; playerId: PlayerId; x: number; y: number; interact: boolean }
  | { kind: 'buy'; playerId: PlayerId; itemId: string }
  | { kind: 'restock'; playerId: PlayerId; supply: SupplyId; packs: number }
  | { kind: 'ready'; playerId: PlayerId }
  | { kind: 'weekEnd'; playerId: PlayerId; choice: 'stop' | 'continue' }
  | { kind: 'menu'; playerId: PlayerId; drink: DrinkId; on: boolean }
  | { kind: 'settings'; playerId: PlayerId; settings: Partial<Settings> }
  | { kind: 'espresso'; playerId: PlayerId }
  | { kind: 'join'; playerId: PlayerId; name: string }
  | { kind: 'leave'; playerId: PlayerId }
  | { kind: 'drop'; playerId: PlayerId };

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
