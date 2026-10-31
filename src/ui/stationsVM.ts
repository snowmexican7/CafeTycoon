/**
 * FB1 WP5: the Spend › Stations card. Pure view model over the slot/equipment sim (sim/slots.ts):
 * one tile per back-bar slot, the spares in the back room, the fixed-price shop, and a one-line
 * trade-off for what the current loadout gives up ("No bin: trash hits the floor").
 */
import { EQUIPMENT, EQUIPMENT_KINDS, type EquipmentKind } from '../data/equipment';
import { BASE_DRINKS, DRINK_INFO } from '../data/drinks';
import { DRINK_STATIONS } from '../sim/growth';
import { defaultSlots, reasonOff, slotCount } from '../sim/slots';
import type { DrinkId, GameState, StationKind } from '../sim/types';

// G10a fix: 'drip' (Gear-only) is here too, so a drip drink with no drip machine names it instead of crashing.
export const STATION_ICON: Record<EquipmentKind | 'drip', string> = { grinder: '⚙️', espresso: '☕', steamer: '🥛', coldBrewTap: '🧊', trash: '🗑️', drip: '🫖' };
export const STATION_SHORT: Record<EquipmentKind | 'drip', string> = { grinder: 'Grinder', espresso: 'Espresso', steamer: 'Steam wand', coldBrewTap: 'Cold brew', trash: 'Bin', drip: 'Drip machine' };

export interface SlotTileVM {
  index: number;
  kind: EquipmentKind | null;
  /** "Espresso", "Espresso 2", or "Empty". */
  name: string;
  icon: string;
}
export interface StationsVM {
  slots: SlotTileVM[];
  /** Owned but not placed, grouped: [{ kind, n }]. */
  spares: { kind: EquipmentKind; name: string; icon: string; n: number }[];
  shop: { kind: EquipmentKind; name: string; icon: string; cost: number; blurb: string; affordable: boolean; owned: number }[];
  /** The headline trade-off of the current loadout, if any. */
  tradeoff: string | null;
  /** Every trade-off line, most serious first. */
  notes: string[];
}

const isKind = (k: StationKind | null | undefined): k is EquipmentKind => !!k && k !== 'counter';

/** Drinks the crew knows that have no station on the floor, with the missing station kinds. */
export function missingStations(state: GameState): { drink: DrinkId; need: EquipmentKind[] }[] {
  const have = new Set(state.stations.map((s) => s.kind));
  return (state.unlocked ?? BASE_DRINKS)
    .filter((d) => reasonOff(state, d) === 'noStation')
    .map((d) => ({ drink: d, need: DRINK_STATIONS[d].filter((k): k is EquipmentKind => isKind(k) && !have.has(k)) }));
}

export function stationNotes(state: GameState): string[] {
  const count = (k: StationKind) => state.stations.filter((s) => s.kind === k).length;
  const out: string[] = [];
  const missing = missingStations(state);
  if (count('grinder') === 0 && missing.length) out.push('No grinder: nothing on the menu can be made');
  const byStation = new Map<EquipmentKind, DrinkId[]>();
  for (const m of missing) for (const k of m.need) if (k !== 'grinder') byStation.set(k, [...(byStation.get(k) ?? []), m.drink]);
  for (const [k, drinks] of byStation) out.push(`No ${STATION_SHORT[k].toLowerCase()}: ${drinks.map((d) => DRINK_INFO[d].short).join(', ')} ${drinks.length > 1 ? 'are' : 'is'} off`);
  if (count('trash') === 0) out.push('No bin: trash hits the floor');
  for (const k of EQUIPMENT_KINDS) if (count(k) > 1) out.push(`${count(k)} ${k === 'trash' ? 'bins' : `${STATION_SHORT[k].toLowerCase()}s`}: ${k === 'trash' ? 'less walking to bin' : 'two can work at once'}`);
  return out;
}

export function stationsVM(state: GameState): StationsVM {
  const slots = state.slots ?? defaultSlots(state.tier);
  const seen = new Map<EquipmentKind, number>();
  const tiles: SlotTileVM[] = Array.from({ length: slotCount(state.tier) }, (_, i) => {
    const k = slots[i] ?? null;
    if (!isKind(k)) return { index: i, kind: null, name: 'Empty', icon: '＋' };
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return { index: i, kind: k, name: n > 1 ? `${STATION_SHORT[k]} ${n}` : STATION_SHORT[k], icon: STATION_ICON[k] };
  });
  const eq: EquipmentKind[] = []; // Round 4 f (sim): state.equipment is gone with the classic shop. TODO(Grok): delete this board.
  const spares = EQUIPMENT_KINDS.filter((k) => eq.includes(k)).map((k) => ({ kind: k, name: STATION_SHORT[k], icon: STATION_ICON[k], n: eq.filter((x) => x === k).length }));
  const owned = (k: EquipmentKind) => slots.filter((x) => x === k).length + eq.filter((x) => x === k).length;
  const shop = EQUIPMENT_KINDS.map((k) => ({ kind: k, name: EQUIPMENT[k].name, icon: STATION_ICON[k], cost: EQUIPMENT[k].cost, blurb: EQUIPMENT[k].blurb, affordable: state.cash >= EQUIPMENT[k].cost, owned: owned(k) }));
  const notes = stationNotes(state);
  return { slots: tiles, spares, shop, tradeoff: notes[0] ?? null, notes };
}

/** The menu tab's note when a known drink has no station (from reasonOff), else undefined. */
export function stationMenuNote(state: GameState): string | undefined {
  const missing = missingStations(state);
  if (!missing.length) return undefined;
  const need = [...new Set(missing.flatMap((m) => m.need))];
  const drinks = missing.map((m) => DRINK_INFO[m.drink].short).join(', ');
  return `No ${need.map((k) => STATION_SHORT[k].toLowerCase()).join(' or ')} on the floor: ${drinks} ${missing.length > 1 ? 'wait' : 'waits'}`;
}
