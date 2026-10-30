/**
 * FB1 WP5: the stations shop. Every back-bar station can be bought at night for a fixed price and
 * placed in a slot (or kept in `state.equipment` until there is room). The counter is not for sale.
 *
 * Night inputs (humans only, connected, night phase only; see sim/slots.ts for what they do):
 *  - `{ kind: 'equip'; playerId; station: StationKind }`: buy one `station` (not 'counter') at its
 *    `EQUIPMENT` price. It goes into the first empty slot, else into `state.equipment`.
 *  - `{ kind: 'slot'; playerId; index: number; station: StationKind | null }`: put `station` (taken from
 *    `state.equipment`) into slot `index` (0 .. slotCount(tier) - 1), or empty the slot with `null`.
 *    Whatever the slot held goes back to equipment. Rearranging is free.
 *
 * Prices: espresso 45, grinder 30, steamer 40, coldBrewTap 35, trash 15. They count in
 * `fittingsValue` at half, like cards.
 */
import type { StationKind } from '../sim/types';

export type EquipmentKind = Exclude<StationKind, 'counter' | 'drip'>; // G4d: the drip machine is Gear-only (data/gear.ts)

export interface EquipmentInfo {
  name: string;
  cost: number;
  blurb: string;
}

export const EQUIPMENT_KINDS: EquipmentKind[] = ['grinder', 'espresso', 'steamer', 'coldBrewTap', 'trash'];

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
