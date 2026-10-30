import { ECONOMY } from '../data/economy';
import { LAYOUT } from '../data/layout';
import { findPath, nodeOf, targetNodes } from './bots/path';
import { TICK_RATE, secondsToTicks } from './constants';
import { emitLog } from './log';
import { STATION_RECIPES } from './stations';
import type { Customer, DrinkId, GameState, Rogue, Station, StationKind, Vec2 } from './types';

/** The kind of station a rogue heads for first, by drink (the first of a kind has the kind as its id). */
export const ROGUE_STATION: Record<DrinkId, StationKind> = {
  espresso: 'espresso', latte: 'steamer', coldBrew: 'coldBrewTap', icedLatte: 'coldBrewTap', mocha: 'steamer', matcha: 'steamer', special: 'steamer', drip: 'drip', americano: 'espresso', cappuccino: 'steamer', doppio: 'espresso', sweetCream: 'coldBrewTap', cafeAuLait: 'steamer', redEye: 'espresso',
};

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** A rogue is active while one walks the floor or a queued customer is upset (at most one at a time). */
export function rogueActive(state: GameState): boolean {
  return state.rogue !== null || state.customers.some((c) => c.upset);
}

/** A connected person (not a bot) within interact range of `st`. Bots never block a rogue: they yield to it. */
function playerNear(state: GameState, st: Station): boolean {
  return state.players.some((p) => !p.bot && p.connected && dist(p.pos, st.pos) <= ECONOMY.interactRangeTiles);
}

/** Idle, empty and unoccupied, not a person's station: an idle recipe station a rogue can reach. */
export function isFreeForRogue(state: GameState, st: Station, from: Vec2): boolean {
  return (
    st.kind in STATION_RECIPES &&
    st.busyTicksLeft === 0 &&
    st.output === null &&
    st.occupiedBy === null &&
    !playerNear(state, st) &&
    targetNodes(state, st, from).length > 0
  );
}

/**
 * The nearest free station of the drink's own kind (not excluded); else the nearest free recipe
 * station. Ties go to the lower array index, which within a kind is the fixed id (`espresso` before
 * `espresso-2`). With one station per kind this is the drink's own station whenever it is free.
 */
export function pickStation(state: GameState, from: Vec2, drink: DrinkId, exclude: string | null): Station | null {
  const free = state.stations.filter((st) => st.id !== exclude && isFreeForRogue(state, st, from));
  const nearest = (list: Station[]): Station | null => {
    let best: Station | null = null;
    for (const st of list) if (best === null || dist(st.pos, from) < dist(best.pos, from)) best = st;
    return best;
  };
  return nearest(free.filter((st) => st.kind === ROGUE_STATION[drink])) ?? nearest(free);
}

/** No station for them: they head for the door and leave. */
export function stormOut(state: GameState): void {
  const r = state.rogue;
  if (!r) return;
  r.stage = 'stormingOut';
  r.station = null;
  r.waitTicks = 0;
  r.ticksLeft = 0;
  r.path = findPath(state, r.pos, LAYOUT.door) ?? [];
  emitLog(state, 'rogue.stormed', { drink: r.drink });
}

/** Pick a station (excluding `exclude`) and walk to it; nothing free (or reachable) storms out. */
function headForStation(state: GameState, r: Rogue, exclude: string | null): void {
  const st = pickStation(state, r.pos, r.drink, exclude);
  const path = st ? findPath(state, r.pos, targetNodes(state, st, r.pos)[0]) : null;
  if (!st || path === null) {
    stormOut(state);
    return;
  }
  r.stage = 'walking';
  r.station = st.id;
  r.path = path;
  r.waitTicks = 0;
  r.ticksLeft = 0;
}

/** The upset customer's window ran out: they go rogue from the customer side of the counter. */
export function startRogue(state: GameState, c: Customer): void {
  state.rogue = {
    customerId: c.id,
    name: c.name,
    drink: c.drink,
    stage: 'walking',
    pos: { ...LAYOUT.rogueStart },
    path: [],
    station: null,
    ticksLeft: 0,
    waitTicks: 0,
  };
  headForStation(state, state.rogue, null);
}

/** Along the path at 0.8× base speed, through everyone; snap to a waypoint within reach and drop it. */
function moveRogue(r: Rogue): void {
  const next = r.path[0];
  if (!next) return;
  const reach = (ECONOMY.moveSpeedTilesPerSecond * ECONOMY.rogue.speed) / TICK_RATE;
  const d = dist(r.pos, next);
  if (d <= reach) {
    r.pos = { ...next };
    r.path.shift();
  } else {
    r.pos = { x: r.pos.x + ((next.x - r.pos.x) / d) * reach, y: r.pos.y + ((next.y - r.pos.y) / d) * reach };
  }
}

function make(state: GameState, r: Rogue, st: Station): void {
  const ticks = secondsToTicks(ECONOMY.rogue.makeSeconds);
  st.occupiedBy = r.customerId;
  st.busyTicksLeft = ticks;
  r.ticksLeft = ticks;
  r.waitTicks = 0;
  r.stage = 'making';
  for (const supply of ECONOMY.drinkSupplies[r.drink]) {
    if (state.supplies[supply] >= 1) state.supplies[supply] -= 1;
  }
}

/** At the station (just arrived, or waiting): re-pick, wait for the player to move, or make. */
function atStation(state: GameState, r: Rogue, arriving: boolean): void {
  const st = state.stations.find((s) => s.id === r.station);
  if (!st || st.busyTicksLeft > 0 || st.output !== null || st.occupiedBy !== null) {
    headForStation(state, r, r.station);
    return;
  }
  if (playerNear(state, st)) {
    if (arriving) {
      r.stage = 'waiting';
      r.waitTicks = 0;
      return;
    }
    r.waitTicks += 1;
    if (r.waitTicks >= secondsToTicks(ECONOMY.rogue.waitSeconds)) headForStation(state, r, st.id);
    return;
  }
  make(state, r, st);
}

/** The rogue customer's walk, wait, make and leave. Deterministic from the state (no rng). */
export function stepRogue(state: GameState): void {
  const r = state.rogue;
  if (!r) return;
  switch (r.stage) {
    case 'walking':
      moveRogue(r);
      if (r.path.length === 0) atStation(state, r, true);
      return;
    case 'waiting':
      atStation(state, r, false);
      return;
    case 'making': {
      const st = state.stations.find((s) => s.id === r.station);
      if (st && st.occupiedBy === r.customerId) {
        r.ticksLeft = st.busyTicksLeft;
        return;
      }
      emitLog(state, 'rogue.made', { drink: r.drink });
      r.stage = 'leaving';
      r.station = null;
      r.ticksLeft = 0;
      r.path = findPath(state, r.pos, LAYOUT.door) ?? [];
      return;
    }
    case 'leaving':
    case 'stormingOut':
      moveRogue(r);
      if (r.path.length === 0) state.rogue = null;
      return;
  }
}

/** The tiles bots path around (the rogue's tile). */
export function rogueTiles(state: GameState): Vec2[] {
  return state.rogue ? [nodeOf(state, state.rogue.pos)] : [];
}

/** True when the rogue stands within yield radius of `at` (bots yield to them). */
export function rogueNear(state: GameState, at: Vec2): boolean {
  return state.rogue !== null && dist(state.rogue.pos, at) <= ECONOMY.bots.yieldRadius;
}
