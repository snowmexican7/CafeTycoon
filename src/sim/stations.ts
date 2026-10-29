import { ECONOMY } from '../data/economy';
import { TICK_RATE } from './constants';
import { computeModifiers } from './effects';
import { eventActive } from './events';
import { emitLog } from './log';
import { counterInteract } from './pass';
import { tally } from './tally';
import { nearestStation } from './movement';
import { mopInteract } from './mop';
import { BASE_DRINKS, RECIPES, type Recipe, type RecipeStation } from '../data/drinks';
import { catBlocking, onStationFinished, tryClearSmoke, tryShooCat } from './eggs';
import type { GameState, ItemKind, PlayerId, StationKind, SupplyId } from './types';

/** Each working station's first (classic) recipe: what it takes, gives back and uses up. See RECIPES for all of them. */
export const STATION_RECIPES: Record<RecipeStation, { takes: ItemKind | null; gives: ItemKind; consumes: SupplyId | null }> = {
  grinder: { takes: null, gives: 'grounds', consumes: 'beans' },
  espresso: { takes: 'grounds', gives: 'espresso', consumes: null },
  steamer: { takes: 'espresso', gives: 'latte', consumes: 'milk' },
  coldBrewTap: { takes: null, gives: 'coldBrew', consumes: 'concentrate' },
};

function isRecipeStation(kind: StationKind): kind is RecipeStation {
  return kind in STATION_RECIPES;
}

/** A drink the café can make right now: a classic, or unlocked and on tonight's menu. Grounds always. */
export function recipeAllowed(state: GameState, gives: ItemKind): boolean {
  if (gives === 'grounds' || BASE_DRINKS.includes(gives)) return true;
  return (state.unlocked ?? BASE_DRINKS).includes(gives) && state.menu[gives] !== false;
}

/** The recipe a station runs for what is in hand (null = empty hands), or null when there is none. */
export function recipeFor(state: GameState, kind: StationKind, held: ItemKind | null): Recipe | null {
  if (!isRecipeStation(kind)) return null;
  return RECIPES[kind].find((r) => r.takes === held && recipeAllowed(state, r.gives)) ?? null;
}

/** Every supply the recipe uses is in stock. */
export function stocked(state: GameState, r: Recipe): boolean {
  return r.consumes.every((s) => state.supplies[s] >= 1);
}

/** Stations keep working after you walk away; finished items wait on the station. */
export function stepStations(state: GameState): GameState {
  if (eventActive(state, 'powerFlicker')) return state;
  for (const s of state.stations) {
    if (s.busyTicksLeft > 0) {
      s.busyTicksLeft -= 1;
      if (s.busyTicksLeft === 0 && s.occupiedBy !== null) s.occupiedBy = null; // a rogue's drink leaves with them
      else if (s.busyTicksLeft === 0 && isRecipeStation(s.kind)) {
        s.output = s.making ?? STATION_RECIPES[s.kind].gives;
        s.making = null;
        if (s.output) onStationFinished(state, s, s.output);
      }
    }
  }
  return state;
}

/** A barista presses "use" at the nearest station in range. First matching rule wins. */
export function interact(state: GameState, playerId: PlayerId): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  if (player.tool !== null) {
    mopInteract(state, player);
    return state;
  }
  // B8: pet the cat / dump a burnt shot before normal station use.
  if (tryShooCat(state, playerId) || tryClearSmoke(state, playerId)) return state;
  const station = nearestStation(state, player.pos);
  if (!station) {
    if (player.holding === null) mopInteract(state, player);
    return state;
  }
  if (station.occupiedBy !== null) return state;
  if (catBlocking(state, station.id)) return state;

  if (station.kind === 'trash') {
    if (player.holding !== null && player.holding !== 'grounds') {
      tally(state.today, 'wasted');
      emitLog(state, 'trash', { item: player.holding, by: playerId });
    }
    player.holding = null;
    return state;
  }
  if (station.kind === 'counter') {
    return counterInteract(state, playerId);
  }

  if (station.output !== null && player.holding === null) {
    player.holding = station.output;
    station.output = null;
    return state;
  }
  const idle = station.busyTicksLeft === 0 && station.output === null;
  const recipe = recipeFor(state, station.kind, player.holding);
  if (idle && recipe && stocked(state, recipe)) {
    for (const s of recipe.consumes) state.supplies[s] -= 1;
    player.holding = null;
    station.making = recipe.gives;
    const speed = computeModifiers(state).stationSpeed[station.kind];
    const seconds = recipe.seconds ?? ECONOMY.stationSeconds[station.kind as RecipeStation];
    station.busyTicksLeft = Math.round((seconds / speed) * TICK_RATE);
  }
  return state;
}
