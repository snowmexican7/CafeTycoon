/**
 * FB1 WP5: station slots. The back bar is a row of fixed slots per tier (`SLOT_POSITIONS`); each
 * holds one station or nothing, and the floor's stations are rebuilt from the slots. The counter is
 * not a slot: it is always appended last, where it has always been.
 *
 * Shapes:
 *  - `state.slots?: (StationKind | null)[]`: one entry per slot of the tier, left to right
 *    (absent = the tier's defaults, as every run before WP5).
 *  - `state.equipment?: StationKind[]`: stations the crew owns but has not placed (absent = none).
 *  - `defaultSlots(tier): (StationKind | null)[]`: the tier layout's stations in slot order, null
 *    where the layout has none (the café's sixth slot).
 *  - `slotCount(tier): number`.
 *  - `stationsFromSlots(tier, slots): Station[]`: fresh idle stations in slot order (empty slots
 *    skipped), ids `kind` for the first of a kind then `kind-2`, `kind-3`, …, positions from
 *    `SLOT_POSITIONS`, then the counter. Default slots give exactly the pre-WP5 stations.
 *  - `growSlots(state, from, to)`: on growing, machines placed beyond `from`'s defaults (by count per
 *    kind) go to `equipment`, slots reset to `to`'s defaults and the stations are rebuilt.
 *  - `reasonOff(state, drink): 'noStation' | 'noStock' | 'off' | null`: why a drink is off the
 *    board, checked in that order (null = it is on).
 *
 * Pure: no RNG, and the order of everything follows the slot order.
 */
import { ECONOMY } from '../data/economy';
import { SLOT_POSITIONS, layoutFor } from '../data/layout';
import { canMake } from './growth';
import type { DrinkId, GameState, Station, StationKind, TierId } from './types';

export type SlotContent = StationKind | null;
export type OffReason = 'noStation' | 'noStock' | 'off';

/** How many back-bar slots the tier has (absent = the café). */
export function slotCount(tier: TierId | undefined): number {
  return SLOT_POSITIONS[tier ?? 'cafe'].length;
}

/** The tier's default loadout, one entry per slot: the layout's station at that position, else null. */
export function defaultSlots(tier: TierId | undefined): SlotContent[] {
  const stations = layoutFor(tier).stations;
  return SLOT_POSITIONS[tier ?? 'cafe'].map((pos) => stations.find((s) => s.kind !== 'counter' && s.pos.x === pos.x && s.pos.y === pos.y)?.kind ?? null);
}

/** Fresh, idle stations for the slots (in slot order), the counter last. */
export function stationsFromSlots(tier: TierId | undefined, slots: readonly SlotContent[]): Station[] {
  const positions = SLOT_POSITIONS[tier ?? 'cafe'];
  const seen = new Map<StationKind, number>();
  const out: Station[] = [];
  positions.forEach((pos, i) => {
    const kind = slots[i] ?? null;
    if (kind === null || kind === 'counter') return;
    const n = (seen.get(kind) ?? 0) + 1;
    seen.set(kind, n);
    out.push({ id: n === 1 ? kind : `${kind}-${n}`, kind, pos: { ...pos }, busyTicksLeft: 0, output: null, occupiedBy: null });
  });
  const counter = layoutFor(tier).stations.find((s) => s.kind === 'counter');
  if (counter) out.push({ id: counter.id, kind: counter.kind, pos: { ...counter.pos }, busyTicksLeft: 0, output: null, occupiedBy: null });
  return out;
}

/** Growing from `from` to `to`: extra machines (beyond `from`'s defaults) go to equipment, the new tier's defaults go in. */
export function growSlots(state: GameState, from: TierId | undefined, to: TierId): void {
  const left = new Map<StationKind, number>();
  for (const k of defaultSlots(from)) if (k !== null) left.set(k, (left.get(k) ?? 0) + 1);
  const extras: StationKind[] = [];
  for (const k of state.slots ?? defaultSlots(from)) {
    if (k === null) continue;
    const n = left.get(k) ?? 0;
    if (n > 0) left.set(k, n - 1);
    else extras.push(k);
  }
  state.equipment = [...(state.equipment ?? []), ...extras];
  state.slots = defaultSlots(to);
  state.stations = stationsFromSlots(to, state.slots);
}

/** Why a drink is off the board: no station for it, a supply has run out, or the crew switched it off (null = on). */
export function reasonOff(state: GameState, drink: DrinkId): OffReason | null {
  if (!canMake(state, drink)) return 'noStation';
  if (ECONOMY.drinkSupplies[drink].some((s) => (state.supplies[s] ?? 0) < 1)) return 'noStock';
  if (!state.menu[drink]) return 'off';
  return null;
}
