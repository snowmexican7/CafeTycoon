/**
 * DEPRECATED (Round 4 f, Kennedy 2026-10-31): the classic stations shop is deleted from the sim (Gear runs are the
 * game): the `slot` / `equip` inputs are refused by validateInput and nothing in src/sim reads this file. It stays only
 * because the UI's classic Stations board (src/ui/stationsVM.ts, night.ts `stationsBoard`) still imports it. Delete it
 * with that board.
 */
import type { StationKind } from '../sim/types';

export type EquipmentKind = Exclude<StationKind, 'counter' | 'drip'>; // G4d: the drip machine is Gear-only (data/gear.ts)

export interface EquipmentInfo {
  name: string;
  cost: number;
  blurb: string;
}

export const EQUIPMENT_KINDS: EquipmentKind[] = ['grinder', 'espresso', 'steamer', 'coldBrewTap', 'trash'];

/** A station kind the classic shop sold (any StationKind but the counter and the drip machine). Was in sim/slots.ts. */
export const isEquipmentKind = (k: unknown): k is EquipmentKind => typeof k === 'string' && (EQUIPMENT_KINDS as string[]).includes(k);

export const EQUIPMENT: Record<EquipmentKind, EquipmentInfo> = {
  espresso: {
    name: 'Espresso machine',
    cost: 45,
    blurb: 'A second one halves the queue at the shot pull, and it hisses like a happy cat.',
  },
  grinder: {
    name: 'Bean grinder',
    cost: 30,
    blurb: 'Whirrs through the beans. Every drink starts here, so a spare keeps the morning rush honest.',
  },
  steamer: {
    name: 'Milk steamer',
    cost: 40,
    blurb: 'Warm, frothy and the reason lattes and matcha exist at all.',
  },
  coldBrewTap: {
    name: 'Cold-brew keg',
    cost: 35,
    blurb: 'Slow, smooth and chilly, steeped for the iced-coffee crowd.',
  },
  trash: {
    name: 'Bin',
    cost: 15,
    blurb: 'Where spent grounds and botched drinks go, instead of the floor.',
  },
};
