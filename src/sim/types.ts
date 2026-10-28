export type PlayerId = string;
export type DrinkId = 'espresso' | 'latte' | 'coldBrew';
export type SupplyId = 'beans' | 'milk' | 'concentrate';
export type ItemKind = 'grounds' | DrinkId;
export type StationKind = 'grinder' | 'espresso' | 'steamer' | 'coldBrewTap' | 'counter' | 'trash';
export type Phase = 'night' | 'day' | 'closing' | 'weekEnd' | 'ended';
export type ScenarioId = 'normal' | 'campusTown' | 'rainyWeek' | 'touristSeason';
export type Rarity = 'common' | 'uncommon' | 'rare';
export type Pace = 1 | 2 | 3 | 4 | 5;

export interface Vec2 {
  x: number;
  y: number;
}

export interface Player {
  id: PlayerId;
  name: string;
  pos: Vec2;
  moveDir: Vec2;
  interactQueued: boolean;
  holding: ItemKind | null;
  connected: boolean;
}

export interface Station {
  id: string;
  kind: StationKind;
  pos: Vec2;
  busyTicksLeft: number;
  output: ItemKind | null;
}

export interface Customer {
  id: number;
  drink: DrinkId;
  patienceLeft: number;
  patienceMax: number;
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
  | { kind: 'gamble'; chance: number; win: Effect[]; lose: Effect[] };

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
}

export interface DayStats {
  day: number;
  served: number;
  lost: number;
  turnedAway: number;
  sales: number;
  tips: number;
  rent: number;
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
}

export type PlayerInput =
  | { kind: 'move'; playerId: PlayerId; x: number; y: number; interact: boolean }
  | { kind: 'buy'; playerId: PlayerId; itemId: string }
  | { kind: 'restock'; playerId: PlayerId; supply: SupplyId; packs: number }
  | { kind: 'ready'; playerId: PlayerId }
  | { kind: 'weekEnd'; playerId: PlayerId; choice: 'stop' | 'continue' }
  | { kind: 'settings'; playerId: PlayerId; settings: Partial<Settings> }
  | { kind: 'join'; playerId: PlayerId; name: string }
  | { kind: 'leave'; playerId: PlayerId };

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
