import { ECONOMY } from '../data/economy';
import { TICK_RATE } from './constants';
import { computeModifiers } from './effects';
import { serveDrink } from './customers';
import { nearestStation } from './movement';
import type { GameState, ItemKind, PlayerId, StationKind, SupplyId } from './types';

type RecipeStation = Exclude<StationKind, 'counter' | 'trash'>;

/** What each working station takes from a barista's hands, what it gives back, and what it uses up. */
export const STATION_RECIPES: Record<RecipeStation, { takes: ItemKind | null; gives: ItemKind; consumes: SupplyId | null }> = {
  grinder: { takes: null, gives: 'grounds', consumes: 'beans' },
  espresso: { takes: 'grounds', gives: 'espresso', consumes: null },
  steamer: { takes: 'espresso', gives: 'latte', consumes: 'milk' },
  coldBrewTap: { takes: null, gives: 'coldBrew', consumes: 'concentrate' },
};

function isRecipeStation(kind: StationKind): kind is RecipeStation {
  return kind in STATION_RECIPES;
}

/** Stations keep working after you walk away; finished items wait on the station. */
export function stepStations(state: GameState): GameState {
  for (const s of state.stations) {
    if (s.busyTicksLeft > 0) {
      s.busyTicksLeft -= 1;
      if (s.busyTicksLeft === 0 && isRecipeStation(s.kind)) s.output = STATION_RECIPES[s.kind].gives;
    }
  }
  return state;
}

/** A barista presses "use" at the nearest station in range. First matching rule wins. */
export function interact(state: GameState, playerId: PlayerId): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  const station = nearestStation(state, player.pos);
  if (!station) return state;

  if (station.kind === 'trash') {
    player.holding = null;
    return state;
  }
  if (station.kind === 'counter') {
    return serveDrink(state, playerId);
  }

  const recipe = STATION_RECIPES[station.kind];
  if (station.output !== null && player.holding === null) {
    player.holding = station.output;
    station.output = null;
    return state;
  }
  const idle = station.busyTicksLeft === 0 && station.output === null;
  const hasSupply = recipe.consumes === null || state.supplies[recipe.consumes] >= 1;
  if (idle && player.holding === recipe.takes && hasSupply) {
    if (recipe.consumes !== null) state.supplies[recipe.consumes] -= 1;
    player.holding = null;
    const speed = computeModifiers(state).stationSpeed[station.kind];
    station.busyTicksLeft = Math.round((ECONOMY.stationSeconds[station.kind] / speed) * TICK_RATE);
  }
  return state;
}
