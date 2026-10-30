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
 *    `SLOT_POSITIONS`, then the counter. Default slots give exactly the pre-WP5 stations. With `gear` (Gear runs),
 *    the pickup counter and the condiment bar follow the counter (kind 'counter', ids `pickup`, `condiments`).
 *  - `ensureCounterSpots(state)`: a Gear run gets whichever of those two spots is missing (old saves).
 *  - `growSlots(state, to)`: on growing, owned stations (placed + equipment, per kind) and the tier's gifts are
 *    conserved: per kind `equipment = max(0, owned + max(0, defaults(to) - defaults(from)) - defaults(to))`, the new
 *    tier's defaults go on the floor, the surplus stays in `equipment` (kind order grinder, espresso, steamer,
 *    coldBrewTap, trash), and the stations are rebuilt.
 *  - `applySlotInput(state, { kind: 'slot', playerId, index, station: StationKind | null })` and
 *    `applyEquipInput(state, { kind: 'equip', playerId, station })`: the two night inputs (see
 *    data/equipment.ts); `state.equipLog?: { station, day, by }[]` records each purchase and
 *    `equipmentSpent(state)` sums their prices.
 *  - `reasonOff(state, drink): 'noStation' | 'noStock' | 'off' | null`: why a drink is off the
 *    board, checked in that order (null = it is on).
 *
 * Pure: no RNG, and the order of everything follows the slot order.
 */
import { ECONOMY } from '../data/economy';
import { EQUIPMENT, EQUIPMENT_KINDS } from '../data/equipment';
import type { EquipmentKind } from '../data/equipment';
import { GEAR, type GearId } from '../data/gear';
import { batchOut } from './gear';
import { CONDIMENTS_ID, PICKUP_ID, SLOT_POSITIONS, layoutFor } from '../data/layout';
import { canMake, tierOf } from './growth';
import type { DrinkId, GameState, PlayerInput, Station, StationKind, TierId } from './types';

export type SlotContent = StationKind | null;

/**
 * Gear G9: how far a twin station sits from its slot. Bots stand on whole tiles one row below: from the slot's
 * own tile the main side is nearest; from the next tile over, only the twin is within reach (0.55 → 1.097 tiles
 * away, inside the 1.1 interact range), and the neighbouring slot is not.
 */
export const TWIN_OFFSET = 0.55;

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
export function stationsFromSlots(tier: TierId | undefined, slots: readonly SlotContent[], gear?: readonly (GearId | null)[]): Station[] {
  const positions = SLOT_POSITIONS[tier ?? 'cafe'];
  const seen = new Map<StationKind, number>();
  const out: Station[] = [];
  positions.forEach((pos, i) => {
    const kind = slots[i] ?? null;
    if (kind === null || kind === 'counter') return;
    const n = (seen.get(kind) ?? 0) + 1;
    seen.set(kind, n);
    const st: Station = { id: n === 1 ? kind : `${kind}-${n}`, kind, pos: { ...pos }, busyTicksLeft: 0, output: null, occupiedBy: null };
    const gid = gear?.[i];
    if (gid) st.gear = gid;
    out.push(st);
    // Gear G9: a machine with two sides is two (or three) stations in one slot, TWIN_OFFSET apart, so a barista
    // picks a side by standing nearer it. The first twin goes right (left on the floor's last column, where no
    // one can stand to its right); a second twin takes the other side.
    const twins = gid ? (GEAR[gid].twin ?? []) : [];
    const right = pos.x + 1 <= layoutFor(tier).width - 1;
    twins.forEach((tk, j) => {
      const side = (j === 0) === right ? 1 : -1;
      const tn = (seen.get(tk) ?? 0) + 1;
      seen.set(tk, tn);
      const tw: Station = { id: tn === 1 ? tk : `${tk}-${tn}`, kind: tk, pos: { x: pos.x + side * TWIN_OFFSET, y: pos.y }, busyTicksLeft: 0, output: null, occupiedBy: null, twin: true };
      if (tk === kind && gid) tw.gear = gid;
      out.push(tw);
    });
  });
  const counter = layoutFor(tier).stations.find((s) => s.kind === 'counter');
  if (counter) out.push({ id: counter.id, kind: counter.kind, pos: { ...counter.pos }, busyTicksLeft: 0, output: null, occupiedBy: null });
  // Batch/pickup: Gear shops get the pickup counter and the condiment bar after the till (the till stays first).
  if (gear) out.push(...counterSpots(tier));
  return out;
}

/** The Gear-run counter spots beside the till: the pickup counter, then the condiment bar (fresh and idle). */
function counterSpots(tier: TierId | undefined): Station[] {
  const l = layoutFor(tier);
  return [
    { id: PICKUP_ID, kind: 'counter', pos: { ...l.pickup }, busyTicksLeft: 0, output: null, occupiedBy: null },
    { id: CONDIMENTS_ID, kind: 'counter', pos: { ...l.condiments }, busyTicksLeft: 0, output: null, occupiedBy: null },
  ];
}

/** A Gear run gets whichever counter spot it is missing (appended, so each appears once). */
export function ensureCounterSpots(state: GameState): void {
  if (state.gear !== true) return;
  for (const spot of counterSpots(state.tier)) {
    if (!state.stations.some((s) => s.id === spot.id)) state.stations.push(spot);
  }
}

const KIND_ORDER: EquipmentKind[] = EQUIPMENT_KINDS;

/**
 * Growing into `to`: owned stations and the tier's gifts are conserved. Per kind,
 * `equipmentAfter = ownedBefore + max(0, defaultCount(to) - defaultCount(fromTier)) - defaultCount(to)`, clamped at 0, where
 * ownedBefore = placed + equipment. The new tier's defaults go on the floor; a kind the tier adds (the cart's steamer) is a
 * gift on top of what the crew owns, so a steamer bought on the stand is not swallowed by it. A grinder removed into
 * equipment before growing is not duplicated. Surplus stays in `equipment` in the stable kind order.
 */
export function growSlots(state: GameState, to: TierId): void {
  const from = tierOf(state);
  const fromSlots = state.slots ?? defaultSlots(state.tier);
  const count = (list: readonly SlotContent[], k: StationKind) => list.filter((x) => x === k).length;
  const toDefaults = defaultSlots(to);
  const fromDefaults = defaultSlots(from);
  const equipment: StationKind[] = [];
  for (const k of KIND_ORDER) {
    const owned = count(fromSlots, k) + count(state.equipment ?? [], k);
    const gift = Math.max(0, count(toDefaults, k) - count(fromDefaults, k));
    const extra = Math.max(0, owned + gift - count(toDefaults, k));
    for (let i = 0; i < extra; i++) equipment.push(k);
  }
  state.equipment = equipment;
  state.slots = toDefaults;
  state.stations = stationsFromSlots(to, state.slots);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A station kind the shop sells (any StationKind but the counter). */
export const isEquipmentKind = (k: unknown): k is EquipmentKind => typeof k === 'string' && (EQUIPMENT_KINDS as string[]).includes(k);

/** Night input: put a station from equipment into a slot, or empty the slot (`null`). The old content goes to equipment. Free. */
export function applySlotInput(state: GameState, input: Extract<PlayerInput, { kind: 'slot' }>): GameState {
  if (state.phase !== 'night' || state.gear) return state; // Gear runs use the gear input (sim/gear.ts)
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  const slots = [...(state.slots ?? defaultSlots(state.tier))];
  const i = input.index;
  if (!Number.isInteger(i) || i < 0 || i >= slotCount(state.tier) || i >= slots.length) return state;
  const want = input.station;
  if (want !== null && !isEquipmentKind(want)) return state;
  const equipment = [...(state.equipment ?? [])];
  const had = slots[i] ?? null;
  if (want === had) return state;
  if (want !== null) {
    const at = equipment.indexOf(want);
    if (at < 0) return state;
    equipment.splice(at, 1);
  }
  if (had !== null) equipment.push(had);
  slots[i] = want;
  state.slots = slots;
  state.equipment = equipment;
  state.stations = stationsFromSlots(state.tier, slots);
  return state;
}

/** Night input: buy a station at its fixed price. It goes into the first empty slot, else into equipment. */
export function applyEquipInput(state: GameState, input: Extract<PlayerInput, { kind: 'equip' }>): GameState {
  if (state.phase !== 'night' || state.gear) return state; // Gear runs use the gear input (sim/gear.ts)
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  if (!isEquipmentKind(input.station)) return state;
  const cost = EQUIPMENT[input.station].cost;
  if (state.cash < cost) return state;
  state.cash = round2(state.cash - cost);
  const slots = [...(state.slots ?? defaultSlots(state.tier))];
  const free = slots.indexOf(null);
  if (free >= 0 && free < slotCount(state.tier)) {
    slots[free] = input.station;
    state.slots = slots;
    state.stations = stationsFromSlots(state.tier, slots);
  } else {
    state.slots = slots;
    state.equipment = [...(state.equipment ?? []), input.station];
  }
  state.equipLog = [...(state.equipLog ?? []), { station: input.station, day: state.day, by: p.name }];
  return state;
}

/** Everything the crew has paid the stations shop this run (for the fittings value). */
export function equipmentSpent(state: GameState): number {
  return (state.equipLog ?? []).reduce((a, e) => a + EQUIPMENT[e.station as EquipmentKind].cost, 0);
}

/** Why a drink is off the board: no station for it, a supply has run out, or the crew switched it off (null = on). */
export function reasonOff(state: GameState, drink: DrinkId): OffReason | null {
  if (!canMake(state, drink)) return 'noStation';
  if (ECONOMY.drinkSupplies[drink].some((s) => (state.supplies[s] ?? 0) < 1)) return 'noStock';
  if (ECONOMY.drinkSupplies[drink].includes('concentrate') && batchOut(state)) return 'noStock';
  if (!state.menu[drink]) return 'off';
  return null;
}
