/**
 * Gear Tree G2 (docs/GEAR_TREE.md): the sim side of a Gear run. Everything here is a no-op unless
 * `state.gear === true`, which only `createRun({ gear: true })` sets (the UI only with `?gear=1`).
 *
 *  - `gearStart(state)`: the run starts with $120, no supplies, an empty back bar and a free
 *    cardboard-box bin in the last slot. The first night is "Pick your gear".
 *  - `applyGearInput(state, input)`: night only, connected humans only.
 *      buy:  pay `price`. If the crew already has a lower tier of the same tree in a slot, the new
 *            one replaces it in place and the old one is traded in for its `sell` value (an upgrade).
 *            Otherwise it goes into the first empty slot; with no empty slot nothing happens.
 *            Buying a tier you already have, or a lower one than you have, does nothing.
 *      sell: empty slot `index` and get its `sell` value back.
 *  - `gearSpeed(station)` / `gearMarks(station)`: the machine's speed (1 = today) and the slip marks it
 *    puts on every cup. Stations with no gear id: 1 and 0, exactly as before.
 *  - `gearMorning(state)`: refill each capped cold brew station's batch for the day.
 *  - `batchOut(state)`: a Gear run whose cold brew stations have all used up today's batch (cold
 *    brew drinks are then sold out, the existing sold-out flow).
 *  - `growGearSlots(state, to)`: growing keeps the gear in its slots and adds empty ones.
 *
 * Classic `equip` and `slot` inputs do nothing in a Gear run (the Gear tab replaces the stations shop).
 * Pure and deterministic: no RNG.
 */
import { GEAR, GEAR_START, type GearId } from '../data/gear';
import { SLOT_POSITIONS } from '../data/layout';
import { stationsFromSlots, slotCount } from './slots';
import type { GameState, PlayerInput, Station, StationKind, TierId } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

export const isGearRun = (state: GameState): boolean => state.gear === true;

/** Turn a fresh run into a Gear run (called by createRun before the first night). */
export function gearStart(state: GameState): void {
  state.gear = true;
  state.cash = GEAR_START.cash;
  state.startingCash = GEAR_START.cash;
  for (const k of Object.keys(state.supplies) as (keyof typeof state.supplies)[]) state.supplies[k] = 0;
  const n = slotCount(state.tier);
  const slots: (StationKind | null)[] = Array.from({ length: n }, () => null);
  const gear: (GearId | null)[] = Array.from({ length: n }, () => null);
  GEAR_START.freeGear.forEach((id, i) => {
    const at = n - 1 - i;
    slots[at] = GEAR[id].station;
    gear[at] = id;
  });
  state.slots = slots;
  state.slotGear = gear;
  state.equipment = [];
  state.gearLog = [];
  state.stations = stationsFromSlots(state.tier, slots, gear);
}

function rebuild(state: GameState): void {
  state.stations = stationsFromSlots(state.tier, state.slots ?? [], state.slotGear ?? []);
}

export function applyGearInput(state: GameState, input: Extract<PlayerInput, { kind: 'gear' }>): GameState {
  if (!isGearRun(state) || state.phase !== 'night') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  const slots = [...(state.slots ?? [])];
  const gear = [...(state.slotGear ?? [])];
  while (gear.length < slots.length) gear.push(null);
  if (input.action === 'sell') {
    const i = input.index;
    const id = gear[i];
    if (!Number.isInteger(i) || i < 0 || i >= slots.length || !id) return state;
    state.cash = round2(state.cash + GEAR[id].sell);
    slots[i] = null;
    gear[i] = null;
    state.gearLog = [...(state.gearLog ?? []), { gear: id, action: 'sell', day: state.day, by: p.name, cash: GEAR[id].sell }];
  } else {
    const want = GEAR[input.gear];
    if (!want) return state;
    // the highest tier of this tree already in a slot
    let at = -1;
    gear.forEach((id, i) => {
      if (id && GEAR[id].tree === want.tree && (at < 0 || GEAR[id].tier > GEAR[gear[at]!].tier)) at = i;
    });
    if (at >= 0 && GEAR[gear[at]!].tier >= want.tier) return state;
    const tradeIn = at >= 0 ? GEAR[gear[at]!].sell : 0;
    if (state.cash + tradeIn < want.price) return state;
    if (at < 0) {
      at = slots.findIndex((x, i) => x === null && i < slotCount(state.tier));
      if (at < 0) return state;
    } else {
      state.gearLog = [...(state.gearLog ?? []), { gear: gear[at]!, action: 'sell', day: state.day, by: p.name, cash: tradeIn }];
    }
    state.cash = round2(state.cash + tradeIn - want.price);
    slots[at] = want.station;
    gear[at] = want.id;
    state.gearLog = [...(state.gearLog ?? []), { gear: want.id, action: 'buy', day: state.day, by: p.name, cash: -want.price }];
  }
  state.slots = slots;
  state.slotGear = gear;
  rebuild(state);
  return state;
}

export function gearSpeed(s: Station): number {
  return s.gear ? GEAR[s.gear].speed : 1;
}

export function gearMarks(s: Station): number {
  return s.gear ? GEAR[s.gear].marks : 0;
}

export function gearMorning(state: GameState): void {
  if (!isGearRun(state)) return;
  for (const s of state.stations) {
    const cap = s.gear ? GEAR[s.gear].batch : undefined;
    if (cap !== undefined) s.batchLeft = cap;
    else delete s.batchLeft;
  }
}

/** True when a Gear run has cold brew stations and every one has used up today's batch. */
export function batchOut(state: GameState): boolean {
  if (!isGearRun(state)) return false;
  const taps = state.stations.filter((s) => s.kind === 'coldBrewTap');
  return taps.length > 0 && taps.every((s) => s.batchLeft === 0);
}

/** Growing a Gear run: gear stays in its slots, the bigger shop adds empty ones. */
export function growGearSlots(state: GameState, to: TierId): void {
  const n = SLOT_POSITIONS[to].length;
  const slots = [...(state.slots ?? [])];
  const gear = [...(state.slotGear ?? [])];
  while (slots.length < n) slots.push(null);
  while (gear.length < n) gear.push(null);
  state.slots = slots.slice(0, n);
  state.slotGear = gear.slice(0, n);
  state.stations = stationsFromSlots(to, state.slots, state.slotGear);
}
