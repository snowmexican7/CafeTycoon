/**
 * Bot cut step 3: the solo robot cashier. Kennedy 2026-11-06: bots are gone, but a solo run gets one small helper that
 * only rings customers up at the till (on by default, `Settings.cashier`; a solo start reads
 * `LocalSettings.soloCashier`). It is an ordinary `Player` with a `bot` state, so movement, collisions, snapshots and
 * the renderer handle it, every `!p.bot` guard leaves it out of person-only things, and inputs in its name are refused.
 * It costs `ECONOMY.cashier.dailyCost` a day at closing (src/sim/staff.ts).
 *
 * Each day and closing tick (`stepCashier`, just before the test-only bot driver):
 * - home is the till's interaction spot (the tile a person stands on to ring); it walks there along `findPath`;
 * - at home, with a customer to ring (`tillNext`) and nobody else ringing, it presses once, then stays put until the
 *   ring finishes (`stepRingUp` cancels a ring whose ringer walks off);
 * - it defers to people: while an empty-handed person (ringing up needs empty hands, so someone carrying a drink to
 *   the pickup counter isn't coming to ring) is within `ECONOMY.cashier.deferTiles` of the till spot (on it or a tile
 *   straight beside it, not diagonal), or someone else's ring-up runs, it never presses and waits on an idle tile next
 *   to the till (`idleNode`); it walks back only `ECONOMY.cashier.returnAfterSec` after the last tick a person counted
 *   (`BotState.personSeenTick`), so it doesn't dither back and forth on the small stand;
 * - at the self-order tier (Squarely) customers ring themselves, so it just waits on its idle tile;
 * - during the closing grace it keeps ringing the customers still in line (same rules);
 * - at night and the week's end it stands still.
 * No RNG and no wall clock: the same state gives the same moves.
 */
import { ECONOMY } from '../data/economy';
import { LAYOUT } from '../data/layout';
import { CASHIER_ID, makeBotState } from './botBody';
import { findPath, idleNode, nodeOf, targetNodes } from './path';
import { freeSpot } from './spawn';
import { floorFields } from './tiles';
import { nearestStation } from './movement';
import { selfOrder, tillNext } from './till';
import { secondsToTicks } from './constants';
import type { GameState, Player, Vec2 } from './types';

export { CASHIER_ID };

/** The till's station id (the batch/pickup counter spot where orders are rung up). */
const TILL_ID = 'counter';

export const CASHIER = {
  /** Close enough to a waypoint or a spot to count as there (the same radius `findPath` uses). */
  arriveRadius: ECONOMY.bots.arriveRadius,
  /** Someone within this many tiles of the next waypoint is in the way: re-route around them, else wait (no bumping people). */
  clearTiles: 0.7,
} as const;

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
const sameNode = (a: Vec2 | null | undefined, b: Vec2): boolean => !!a && a.x === b.x && a.y === b.y;

/** The robot cashier, when it is on the crew. */
export function cashierOf(state: GameState): Player | undefined {
  return state.players.find((p) => p.id === CASHIER_ID);
}

function newCashier(state: GameState): Player {
  const pos = freeSpot(state, LAYOUT.spawnPoints[state.players.length] ?? LAYOUT.door);
  return {
    id: CASHIER_ID,
    name: ECONOMY.cashier.name,
    pos,
    moveDir: { x: 0, y: 0 },
    interactQueued: false,
    holding: null,
    connected: true,
    bot: makeBotState('steady'),
    idleTicks: 0,
    ...floorFields(pos),
  };
}

/** Put the cashier on the crew when the run has it switched on, take it off when not. Called each morning (startDay). */
export function syncCashier(state: GameState): GameState {
  const here = cashierOf(state);
  if (state.settings.cashier === true) {
    if (!here) state.players.push(newCashier(state));
  } else if (here) {
    state.players = state.players.filter((p) => p !== here);
  }
  return state;
}

/** The till spot: the tile nearest the till from which a press rings up (the same targets a person or a bot uses). */
export function cashierHome(state: GameState): Vec2 | null {
  const till = state.stations.find((st) => st.id === TILL_ID);
  if (!till) return null;
  return targetNodes(state, till, till.pos)[0] ?? null;
}

/**
 * A person (connected, not a bot) has the till: they stand within `deferTiles` of the till spot with empty hands and no
 * tool (only empty hands can ring, so someone carrying a drink to the pickup counter isn't coming for the till).
 */
function personAtTill(state: GameState, home: Vec2): boolean {
  return state.players.some((o) => !o.bot && o.connected && o.holding === null && !o.tool && dist(o.pos, home) <= ECONOMY.cashier.deferTiles);
}

/** Another body stands on (or next to) `node`. */
function inTheWay(state: GameState, self: Player, node: Vec2): boolean {
  return state.players.some((o) => o !== self && o.connected && dist(o.pos, node) <= CASHIER.clearTiles);
}

/** Pin `node` as where the cashier is heading; a new target drops the old path. */
function aim(p: Player, node: Vec2): void {
  const b = p.bot!;
  if (sameNode(b.target, node)) return;
  b.target = { ...node };
  b.path = [];
}

/** One tick of walking toward the pinned target, one tile centre at a time. True once standing on it. */
function walk(state: GameState, p: Player): boolean {
  const b = p.bot!;
  const node = b.target!;
  if (dist(p.pos, node) <= CASHIER.arriveRadius) {
    b.path = [];
    return true;
  }
  while (b.path.length > 0 && dist(p.pos, b.path[0]) <= CASHIER.arriveRadius) b.path.shift();
  if (b.path.length === 0) b.path = findPath(state, p.pos, node) ?? [];
  if (b.path.length === 0) {
    p.moveDir = { x: node.x - p.pos.x, y: node.y - p.pos.y }; // no path (or only an edge onto the node): head straight for it
    return false;
  }
  if (inTheWay(state, p, b.path[0])) {
    const others = state.players.filter((o) => o !== p && o.connected).map((o) => nodeOf(state, o.pos));
    const around = findPath(state, p.pos, node, others);
    if (!around || around.length === 0 || inTheWay(state, p, around[0])) return false; // wait for them to pass
    b.path = around;
  }
  p.moveDir = { x: b.path[0].x - p.pos.x, y: b.path[0].y - p.pos.y };
  return false;
}

/**
 * The cashier's tick (stepDay, day and closing, before the bot driver and the movement). Decides its moveDir and whether it presses
 * "use" at the till this tick; the normal interact → tillRingUp path does the ringing.
 */
export function stepCashier(state: GameState): void {
  const p = cashierOf(state);
  if (!p || !p.bot) return;
  p.moveDir = { x: 0, y: 0 };
  // Day and the closing grace (customers still in line get rung); night and the week's end: stand still.
  if ((state.phase !== 'day' && state.phase !== 'closing') || !p.connected || p.stunTicksLeft > 0) return;
  const home = cashierHome(state);
  if (!home) return;
  if (state.ringUp?.by === p.id) return; // mid-ring: stay put until it finishes
  const b0 = p.bot;
  const here = personAtTill(state, home);
  if (here) b0.personSeenTick = state.tick;
  const waiting = here || (b0.personSeenTick !== undefined && state.tick - b0.personSeenTick < secondsToTicks(ECONOMY.cashier.returnAfterSec));
  if (!waiting) delete b0.personSeenTick;
  const defer = selfOrder(state) || waiting || state.ringUp !== undefined;
  if (defer) {
    // Step aside (or stay aside): a free tile next to the till, picked once and kept while waiting.
    const b = p.bot;
    if (!b.target || sameNode(b.target, home)) aim(p, idleNode(state, p));
    walk(state, p);
    return;
  }
  aim(p, home);
  if (!walk(state, p)) return;
  const till = state.stations.find((st) => st.id === TILL_ID);
  if (nearestStation(state, p.pos)?.id !== till?.id) {
    p.moveDir = { x: home.x - p.pos.x, y: home.y - p.pos.y }; // edge onto the spot so the press reaches the till
    return;
  }
  if (p.holding === null && !p.tool && tillNext(state)) p.interactQueued = true;
}
