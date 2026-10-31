/*
 * FB2 C10: station rearranging (Gear runs).
 *
 * Each Gear morning opens with a pre-open (`ECONOMY.preOpenSeconds`, 15 s): `GameState.preOpenUntil` is the tick it
 * ends. Meanwhile the doors are shut (no walk-ins, no office run), the day clock and the day's events stand still,
 * people can walk about but not use anything, and bots wait. It ends when the time runs out, when every connected
 * person is ready (the night's `ready` input and `GameState.ready`, emptied when the pre-open starts), or when the
 * host sends `openDoors`. Events `preopen.start { until }`, `preopen.end`. The day's event schedule moves back by
 * however long the pre-open lasted, and bots drop their paths (they re-plan from where things now stand).
 *
 * In the pre-open a person can set a back-bar machine down somewhere else: `{ kind: 'moveStation', playerId, station,
 * to }`. `station` is the id of any station of a slot (a twin moves its machine); fixtures (the till, pickup, condiment
 * bar, sink, fridge, tray table, B8's syrup rack and any later fixed spot) never move; they count in every layout check. `to` is a whole tile in the bar area (x 1 to
 * width - 1, y 1 to the row above the till). On another slot's spot the two slots swap spots (`swapped` is true when
 * that slot holds a machine; an empty slot just takes the old spot); on a free tile the machine moves there. Refused
 * (`station.refuse { by, station }`) when the layout would then block anything that was fine before: a spawn point,
 * the door, the mop's home or the box corner covered or cut off, a station with no tile to work it from on the
 * floor, no idle tile by the till, or two stations overlapping. Else `station.place { by, station, to, swapped }`.
 *
 * Moves are kept in `GameState.slotPos` (one spot per slot) for the rest of the run. A night rebuild of the bar (a
 * gear buy or sale, a wand, a grow) builds the slots on their kept spots; if that layout has a problem the default
 * one doesn't, every slot goes back to its default spot (`slotPos` cleared, `station.reset`). So after a grow the
 * moves stay when they still fit, else the bigger shop's default layout wins.
 */
import { ECONOMY } from '../data/economy';
import { LAYOUT, layoutFor } from '../data/layout';
import { secondsToTicks } from './constants';
import { computeModifiers } from './effects';
import { floorWidth } from './growth';
import { emitLog } from './log';
import { applyMovement, blocked } from './movement';
import { slotGroups, slotSpots, twinPos } from './slots';
import { settle } from './spawn';
import { onTileEntry } from './floor';
import { trackTiles } from './tiles';
import { isWalkable, targetNodes, walkableNodes } from './bots/path';
import type { GameState, PlayerInput, Station, Vec2 } from './types';

const key = (v: Vec2) => `${v.x},${v.y}`;
const same = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;

/** True while the morning's pre-open runs. */
export function inPreOpen(state: GameState): boolean {
  return state.phase === 'day' && state.preOpenUntil !== undefined;
}

const people = (state: GameState) => state.players.filter((p) => p.connected && !p.bot);

/** Called as the doors would open on a Gear morning: start the pre-open (none with nobody connected to use it). */
export function beginPreOpen(state: GameState): void {
  if (state.gear !== true || state.phase !== 'day' || people(state).length === 0) return;
  state.preOpenUntil = state.tick + secondsToTicks(ECONOMY.preOpenSeconds);
  state.ready = [];
  emitLog(state, 'preopen.start', { until: state.preOpenUntil });
}

/** The pre-open ends: the day's events move back by its length, bots re-plan their paths. */
export function endPreOpen(state: GameState): void {
  if (state.preOpenUntil === undefined) return;
  const began = state.preOpenUntil - secondsToTicks(ECONOMY.preOpenSeconds);
  const lasted = Math.max(0, state.tick - began);
  for (const e of state.eventSchedule) e.startTick += lasted;
  delete state.preOpenUntil;
  state.ready = [];
  replan(state);
  emitLog(state, 'preopen.end');
}

/** Bots forget their paths and pinned tiles (stations may have moved). */
function replan(state: GameState): void {
  for (const p of state.players) {
    if (!p.bot) continue;
    p.bot.path = [];
    p.bot.target = null;
  }
}

/** A pre-open `ready`: the person is ready (the pre-open ends once every connected person is). */
export function preOpenReady(state: GameState, playerId: string): void {
  if (!inPreOpen(state)) return;
  const p = state.players.find((x) => x.id === playerId);
  if (!p || p.bot || state.ready.includes(p.id)) return;
  state.ready.push(p.id);
}

/** `openDoors`: the host ends the pre-open now. */
export function applyOpenDoors(state: GameState, input: Extract<PlayerInput, { kind: 'openDoors' }>): void {
  if (inPreOpen(state) && input.playerId === state.hostId) endPreOpen(state);
}

/** One pre-open tick: people walk (nothing is used: interact, drop and so B8's jug and steam presses do nothing; step.ts drops `syrup`), then the end checks. */
export function stepPreOpen(state: GameState): void {
  applyMovement(state, computeModifiers(state).moveSpeed);
  onTileEntry(state, trackTiles(state));
  for (const p of state.players) {
    p.interactQueued = false;
    p.dropQueued = false;
  }
  const crew = people(state);
  const allReady = crew.length > 0 && crew.every((p) => state.ready.includes(p.id));
  if (state.tick >= (state.preOpenUntil ?? 0) || allReady || crew.length === 0) endPreOpen(state);
}

// ---------------------------------------------------------------------------------------------- the layout

/** The stations of each slot, as they stand now (by id, from the slots); an empty slot has none. */
function groups(state: GameState): Station[][] {
  const ids = slotGroups(state.tier, state.slots ?? [], state.slotGear ?? [], state.slotWand ?? [], state.slotPos).map((g) => g.map((x) => x.id));
  return ids.map((g) => g.map((id) => state.stations.find((x) => x.id === id)).filter((x): x is Station => x !== undefined));
}

/** The slot a station belongs to (a twin: its machine's), or -1 for a fixture or an unknown id. */
function slotOf(state: GameState, id: string): number {
  return groups(state).findIndex((g) => g.some((x) => x.id === id));
}

/** The row just above the till: the bar area's last row. */
function lastBarRow(state: GameState): number {
  const till = state.stations.find((x) => x.id === 'counter') ?? layoutFor(state.tier).stations.find((x) => x.kind === 'counter');
  return (till?.pos.y ?? LAYOUT.height - 1) - 1;
}

/** A whole tile in the bar area. */
function inBar(state: GameState, to: Vec2): boolean {
  return Number.isInteger(to.x) && Number.isInteger(to.y) && to.x >= 1 && to.x <= floorWidth(state) - 1 && to.y >= 1 && to.y <= lastBarRow(state);
}

/**
 * What is wrong with the floor as it stands (keys, so a move can be judged against the layout before it): a spawn
 * point, the door, the mop's home or the box corner covered or cut off from the floor (one not under a fixture),
 * a station with no working tile on the floor, no idle tile by the till, two stations of different slots (or a slot
 * and a fixture) overlapping. "The floor" is the walkable area around the door.
 */
export function layoutProblems(state: GameState): Set<string> {
  const out = new Set<string>();
  const w = floorWidth(state);
  const l = layoutFor(state.tier);
  const bySlot = groups(state);
  const inSlots = new Set(bySlot.flat().map((x) => x.id));
  const fixed = state.stations.filter((x) => !inSlots.has(x.id));
  // The floor: walkable tiles connected to the door (else to the first walkable tile).
  const nodes = walkableNodes(state);
  const open = new Set(nodes.map(key));
  const start = open.has(key(LAYOUT.door)) ? LAYOUT.door : nodes[0];
  const floor = new Set<string>();
  if (start) {
    const todo = [start];
    floor.add(key(start));
    while (todo.length > 0) {
      const n = todo.pop()!;
      for (const d of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
        const m = { x: n.x + d.x, y: n.y + d.y };
        if (open.has(key(m)) && !floor.has(key(m))) {
          floor.add(key(m));
          todo.push(m);
        }
      }
    }
  }
  for (const t of [...LAYOUT.spawnPoints, LAYOUT.door, l.mopHome, l.boxCorner]) {
    if (blocked(t, fixed, w)) continue; // under a fixture from the start (the stand's sink on a spawn point)
    if (!isWalkable(state, t) || !floor.has(key(t))) out.add(`tile:${key(t)}`);
  }
  for (const st of state.stations) {
    if (!targetNodes(state, st, st.pos).some((n) => floor.has(key(n)))) out.add(`reach:${st.id}`);
  }
  const till = state.stations.find((x) => x.id === 'counter');
  if (till && !nodes.some((n) => floor.has(key(n)) && Math.hypot(n.x - till.pos.x, n.y - till.pos.y) <= 2 && n.y <= till.pos.y)) out.add('idle');
  const owner = new Map<string, number>();
  bySlot.forEach((g, i) => g.forEach((x) => owner.set(x.id, i)));
  const all = state.stations;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      const oa = owner.get(a.id);
      if (oa !== undefined && oa === owner.get(b.id)) continue; // a machine and its own twins
      if (Math.abs(a.pos.x - b.pos.x) < 1 && Math.abs(a.pos.y - b.pos.y) < 1) out.add(`overlap:${[a.id, b.id].sort().join('|')}`);
    }
  }
  return out;
}

/** Every problem in `after` was already in `before`. */
const noWorse = (before: Set<string>, after: Set<string>) => [...after].every((k) => before.has(k));

/** Put a slot's stations (machine first, then its twins) on `pos`. */
function place(state: GameState, group: Station[], pos: Vec2): void {
  group.forEach((st, j) => {
    st.pos = j === 0 ? { ...pos } : twinPos(state.tier, pos, j - 1);
  });
}

interface Plan {
  slot: number;
  other: number; // the slot whose spot `to` is (-1: a free tile)
  spots: Vec2[];
}

/** Where slot `slot` would go for a drop on `to` (null: not a spot it can go to), without judging the layout. */
function planMove(state: GameState, slot: number, to: Vec2): Plan | null {
  if (!inBar(state, to)) return null;
  const spots = slotSpots(state.tier, state.slotPos);
  const bySlot = groups(state);
  // On another slot: its spot, or a tile one of its stations covers (a twin's tile).
  let other = spots.findIndex((p, i) => i !== slot && same(p, to));
  if (other < 0) other = bySlot.findIndex((g, i) => i !== slot && g.some((x) => same({ x: Math.round(x.pos.x), y: Math.round(x.pos.y) }, to)));
  const next = spots.map((p) => ({ ...p }));
  if (other >= 0) {
    next[other] = { ...spots[slot] };
    next[slot] = { ...spots[other] };
  } else {
    next[slot] = { ...to };
  }
  return { slot, other, spots: next };
}

/** Try a plan on a copy of the floor: the stations as they would stand, or null if the layout gets worse than `before`. */
function judge(state: GameState, plan: Plan, before: Set<string>): Station[] | null {
  const trial: GameState = { ...state, stations: state.stations.map((x) => ({ ...x, pos: { ...x.pos } })), slotPos: plan.spots };
  const bySlot = groups(trial);
  bySlot.forEach((g, i) => place(trial, g, plan.spots[i]));
  return noWorse(before, layoutProblems(trial)) ? trial.stations : null;
}

/** Keep `slotPos` lean: null where a slot stands on its default spot, absent when every slot does. */
function storeSpots(state: GameState, spots: Vec2[]): void {
  const defaults = slotSpots(state.tier);
  const kept = spots.map((p, i) => (defaults[i] && same(p, defaults[i]) ? null : { ...p }));
  if (kept.every((p) => p === null)) delete state.slotPos;
  else state.slotPos = kept;
}

/** The `moveStation` input (pre-open, people only). */
export function applyMoveStation(state: GameState, input: Extract<PlayerInput, { kind: 'moveStation' }>): void {
  if (!inPreOpen(state) || state.gear !== true) return;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return;
  const refuse = () => emitLog(state, 'station.refuse', { by: p.id, station: input.station });
  const slot = slotOf(state, input.station);
  if (slot < 0) return refuse();
  const machine = groups(state)[slot][0];
  const plan = planMove(state, slot, input.to);
  if (!plan) return refuse();
  const stations = judge(state, plan, layoutProblems(state));
  if (!stations) return refuse();
  state.stations = stations;
  storeSpots(state, plan.spots);
  for (const x of state.players) settle(state, x); // anyone standing where a machine landed steps off it
  replan(state);
  const swapped = plan.other >= 0 && groups(state)[plan.other].length > 0;
  emitLog(state, 'station.place', { by: p.id, station: machine.id, to: { ...plan.spots[slot] }, swapped });
}

/**
 * The tiles `station` (a station id; a twin stands for its machine) could be set down on now: every bar-area tile a
 * `moveStation` would accept, its own spot included (row by row). Empty for a fixture, an unknown id, or outside a
 * Gear run. For the UI's ghost outline.
 */
export function validStationSpots(state: GameState, station: string): Vec2[] {
  if (state.gear !== true) return [];
  const slot = slotOf(state, station);
  if (slot < 0) return [];
  const out: Vec2[] = [];
  const before = layoutProblems(state);
  for (let y = 1; y <= lastBarRow(state); y++) {
    for (let x = 1; x <= floorWidth(state) - 1; x++) {
      const plan = planMove(state, slot, { x, y });
      if (plan && judge(state, plan, before)) out.push({ x, y });
    }
  }
  return out;
}

/**
 * After a night rebuild of the bar on its kept spots: if that layout has a problem the default layout doesn't, the
 * kept spots go (`slotPos` cleared, `station.reset`) and `rebuild` builds the bar again on the default spots.
 */
export function keepMovesOrReset(state: GameState, rebuild: () => void): void {
  if (!state.slotPos) return;
  const moved = layoutProblems(state);
  const kept = state.slotPos;
  const stations = state.stations;
  delete state.slotPos;
  rebuild();
  const defaults = layoutProblems(state);
  if (noWorse(defaults, moved)) {
    state.slotPos = kept;
    state.stations = stations;
    return;
  }
  emitLog(state, 'station.reset');
}
