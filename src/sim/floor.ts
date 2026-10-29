import { ECONOMY } from '../data/economy';
import { isOut } from './espresso';
import { emitLog } from './log';
import { rngInt, rngNext } from './rng';
import { tally } from './tally';
import { tileAhead, tileOf } from './tiles';
import { isWalkable, nodeOf } from './bots/path';
import type { GameState, Mess, MessKind, Player, Vec2 } from './types';

const M = ECONOMY.mess;
const NEIGHBOURS: Vec2[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

function messAt(state: GameState, tile: Vec2): Mess | undefined {
  return state.messes.find((m) => m.x === tile.x && m.y === tile.y);
}

/**
 * Put a mess on a tile: a new one at amount 1, or merged into the one already there (a spill
 * landing on grounds makes it a spill). At the cap nothing is placed or merged.
 */
export function placeMess(state: GameState, kind: MessKind, tile: Vec2): boolean {
  if (state.messes.length >= M.max) return false;
  const here = messAt(state, tile);
  if (here) {
    here.amount = Math.min(1, here.amount + M.mergeAdd);
    if (kind === 'spill') here.kind = 'spill';
    return true;
  }
  state.messes.push({ id: state.nextMessId++, kind, x: tile.x, y: tile.y, amount: 1 });
  return true;
}

/** The player's own tile if walkable, else the nearest walkable node. */
function ownTile(state: GameState, p: Player): Vec2 {
  const own = tileOf(p.pos);
  return isWalkable(state, own) ? own : nodeOf(state, p.pos);
}

/** Where a floor drop lands: the tile in front, else the own tile, else the nearest walkable node. */
export function dropTile(state: GameState, p: Player): Vec2 {
  const front = tileAhead(p);
  return isWalkable(state, front) ? front : ownTile(state, p);
}

/** Grounds spread and slips when a player enters a tile, in `entered` order (not a collapsed barista). */
export function onTileEntry(state: GameState, entered: Player[]): void {
  for (const p of entered) {
    if (isOut(p)) continue;
    const mess = messAt(state, p.tile);
    if (!mess) continue;
    if (mess.kind === 'grounds') spread(state, mess);
    else slip(state, p);
  }
}

function spread(state: GameState, source: Mess): void {
  if (source.amount < M.spreadMin) return;
  if (rngNext(state) >= M.spreadChance) return;
  const half = source.amount * M.spreadFactor;
  const candidates: Vec2[] = [];
  for (const d of NEIGHBOURS) {
    const t = { x: source.x + d.x, y: source.y + d.y };
    if (!isWalkable(state, t)) continue;
    const there = messAt(state, t);
    if (there ? there.kind === 'grounds' && there.amount < half : state.messes.length < M.max) candidates.push(t);
  }
  if (candidates.length > 0) {
    const target = candidates[rngInt(state, candidates.length)];
    const there = messAt(state, target);
    if (there) there.amount = half;
    else state.messes.push({ id: state.nextMessId++, kind: 'grounds', x: target.x, y: target.y, amount: half });
  }
  // Trampled dirt wears out on every hit, spread or not.
  source.amount -= M.spreadLoss;
  if (source.amount < M.minAmount) state.messes = state.messes.filter((m) => m !== source);
}

function slip(state: GameState, p: Player): void {
  if (rngNext(state) >= M.slipChance) return;
  const [lo, hi] = M.stunTicks;
  const ticks = lo + rngInt(state, hi - lo + 1);
  p.stunTicksLeft = ticks;
  p.moveDir = { x: 0, y: 0 };
  p.interactQueued = false;
  p.dropQueued = false;
  p.cleaningTicksLeft = 0;
  p.cleaningMess = null;
  const data: Record<string, string | number> = { player: p.id, x: p.tile.x, y: p.tile.y, ticks };
  const item = p.holding;
  if (item !== null && placeMess(state, item === 'grounds' ? 'grounds' : 'spill', p.tile)) {
    p.holding = null;
    if (item !== 'grounds') tally(state.today, 'wasted');
    data.item = item;
  }
  tally(state.today, 'slips');
  emitLog(state, 'slip', data);
}

/** Cleanliness drifts down with each mess on the floor and recovers when there are none. */
export function stepCleanliness(state: GameState): void {
  const n = state.messes.length;
  const next = n > 0 ? state.cleanliness - M.dirtPerMessPerTick * n : state.cleanliness + M.recoverPerTick;
  state.cleanliness = Math.min(100, Math.max(0, next));
}

/** The tiles bots path around (spills). */
export function spillTiles(state: GameState): Vec2[] {
  return state.messes.filter((m) => m.kind === 'spill').map((m) => ({ x: m.x, y: m.y }));
}

/** A held drink hits the floor as a spill on the player's own tile; false at the cap. */
export function spillHeld(state: GameState, p: Player): boolean {
  const item = p.holding;
  if (item === null || item === 'grounds') return false;
  const tile = ownTile(state, p);
  if (!placeMess(state, 'spill', tile)) return false;
  tally(state.today, 'wasted');
  p.holding = null;
  emitLog(state, 'drop', { item, x: tile.x, y: tile.y, by: p.id });
  return true;
}
