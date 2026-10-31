/**
 * The menu tab's "no station on the floor" note (from the sim's `reasonOff`).
 *
 * ui-3.7.1 (Round 4 f follow-up): the classic Spend › Stations board, its view model and the slot/equip
 * inputs are deleted. Only the menu note is left here, because src/sim/gearPourOver.test.ts imports
 * `stationMenuNote` from this path, and the file name stays so that import keeps working.
 */
import { BASE_DRINKS, DRINK_INFO } from '../data/drinks';
import { DRINK_STATIONS } from '../sim/growth';
import { reasonOff } from '../sim/slots';
import type { DrinkId, GameState, StationKind } from '../sim/types';

type FloorStation = Exclude<StationKind, 'counter'>;

const STATION_SHORT: Record<FloorStation, string> = { grinder: 'Grinder', espresso: 'Espresso', steamer: 'Steam wand', coldBrewTap: 'Cold brew', trash: 'Bin', drip: 'Drip machine' };

const isFloor = (k: StationKind | null | undefined): k is FloorStation => !!k && k !== 'counter';

/** Drinks the crew knows that have no station on the floor, with the missing station kinds. */
export function missingStations(state: GameState): { drink: DrinkId; need: FloorStation[] }[] {
  const have = new Set(state.stations.map((s) => s.kind));
  return (state.unlocked ?? BASE_DRINKS)
    .filter((d) => reasonOff(state, d) === 'noStation')
    .map((d) => ({ drink: d, need: DRINK_STATIONS[d].filter((k): k is FloorStation => isFloor(k) && !have.has(k)) }));
}

/** The menu tab's note when a known drink has no station (from reasonOff), else undefined. */
export function stationMenuNote(state: GameState): string | undefined {
  const missing = missingStations(state);
  if (!missing.length) return undefined;
  const need = [...new Set(missing.flatMap((m) => m.need))];
  const drinks = missing.map((m) => DRINK_INFO[m.drink].short).join(', ');
  return `No ${need.map((k) => STATION_SHORT[k].toLowerCase()).join(' or ')} on the floor: ${drinks} ${missing.length > 1 ? 'wait' : 'waits'}`;
}
