import { ACCURACY, cupIntoStation, cupOutOfStation, markCup } from './accuracy';
import { roleMachineTime } from './roles';
import { ECONOMY } from '../data/economy';
import { TICK_RATE } from './constants';
import { computeModifiers } from './effects';
import { eventActive } from './events';
import { emitLog } from './log';
import { counterInteract } from './pass';
import { gearAfterUse, gearBlocked, gearMarks, gearPolish, gearPotFinished, gearPotPour, gearRecipe, gearSpeed, gearTempMiss } from './gear';
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
  drip: { takes: null, gives: 'drip', consumes: 'beans' },
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
  const all = RECIPES[kind].filter((r) => r.takes === held && recipeAllowed(state, r.gives));
  // G6 (doc §6 recipe clash): a latte at the steamer could become a mocha or a cappuccino. Make what the
  // oldest waiting ticket wants; otherwise the first match (classic runs only ever have one match).
  if (all.length > 1) {
    const want = state.customers.find((c) => !c.upset && all.some((r) => r.gives === c.drink));
    if (want) return all.find((r) => r.gives === want.drink)!;
  }
  return all[0] ?? null;
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
        s.doneAt = state.tick;
        s.outputSince = state.tick;
        gearPotFinished(state, s); // G4d: a drip machine fills its pot
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
  if (player.holding === null) { delete player.cupSlips; delete player.cupTemp; } // P3 B5: empty hands, no cup, no marks
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
    // G4d: a drip pot keeps pouring until it's empty; pot cups don't "sit" (they go cold instead).
    const pour = gearPotPour(state, station);
    if (!pour.more) {
      station.output = null;
      delete station.outputSince;
    }
    const doneAt = station.doneAt;
    cupOutOfStation(state, player, station, pour.pot ? Infinity : ACCURACY.sitSeconds * TICK_RATE);
    if (pour.more && doneAt !== undefined) station.doneAt = doneAt;
    if (pour.temp) gearTempMiss(state, station, player, pour.temp);
    return state;
  }
  // P3 B5: pull it early. Empty hands at a machine near the end of its run take the drink now, one star off.
  if (player.holding === null && station.busyTicksLeft > 0 && station.making && station.busyTotal && station.busyTicksLeft <= station.busyTotal * ACCURACY.earlyShare) {
    player.holding = station.making;
    station.making = null;
    station.busyTicksLeft = 0;
    delete station.doneAt;
    cupOutOfStation(state, player, station, Infinity);
    markCup(player);
    emitLog(state, 'cup.early', { by: playerId, item: player.holding });
    return state;
  }
  const idle = station.busyTicksLeft === 0 && station.output === null;
  if (idle && gearBlocked(state, station, player)) return state;
  const own = gearRecipe(station, player.holding);
  const recipe = own !== undefined ? (own && recipeAllowed(state, own.gives) ? own : null) : recipeFor(state, station.kind, player.holding);
  if (idle && recipe && stocked(state, recipe) && station.batchLeft !== 0) {
    for (const s of recipe.consumes) state.supplies[s] -= 1;
    cupIntoStation(player, station);
    // Gear Tree: a capped cold brew batch runs down; cheap gear marks the cup.
    if (station.batchLeft !== undefined) station.batchLeft -= 1;
    const gm = gearMarks(station);
    if (gm > 0) station.cupSlips = Math.min(ACCURACY.maxStars, (station.cupSlips ?? 0) + gm);
    else gearPolish(station);
    player.holding = null;
    station.making = recipe.gives;
    const speed = computeModifiers(state).stationSpeed[station.kind];
    const seconds = recipe.seconds ?? ECONOMY.stationSeconds[station.kind as RecipeStation];
    station.busyTicksLeft = Math.round(((seconds * roleMachineTime(state, playerId)) / (speed * gearSpeed(station, state.tick))) * TICK_RATE);
    station.busyTotal = station.busyTicksLeft;
    gearAfterUse(state, station, player);
  } else if (idle && !recipe && player.holding !== null && player.holding !== 'grounds' && isRecipeStation(station.kind)) {
    // P3 B5: a cup offered to a station with no step for it: the wrong order, one star off.
    markCup(player);
    emitLog(state, 'cup.fumble', { by: playerId, item: player.holding, station: station.kind });
  }
  return state;
}
