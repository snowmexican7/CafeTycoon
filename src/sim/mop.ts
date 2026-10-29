import { ECONOMY } from '../data/economy';
import { LAYOUT } from '../data/layout';
import { isOut } from './espresso';
import { emitLog } from './log';
import type { GameState, Mess, Player, Vec2 } from './types';

const M = ECONOMY.mess;
const RANGE = ECONOMY.interactRangeTiles;

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** The mess nearest `pos` within interact range of its tile centre; ties go to the lower index. */
export function nearestMess(state: GameState, pos: Vec2): Mess | null {
  let best: Mess | null = null;
  let bestDist: number = RANGE;
  for (const m of state.messes) {
    const d = dist(pos, m);
    if (d < bestDist || (best === null && d <= bestDist)) {
      best = m;
      bestDist = d;
    }
  }
  return best;
}

/** The player carrying the mop, or null when nobody (connected, not out cold) does. */
function mopHolder(state: GameState): Player | null {
  const id = state.mop.heldBy;
  if (id === null) return null;
  const p = state.players.find((x) => x.id === id);
  return p && p.connected && !isOut(p) && p.tool === 'mop' ? p : null;
}

function stopCleaning(p: Player): void {
  p.cleaningTicksLeft = 0;
  p.cleaningMess = null;
}

/** Track A: "use" with the mop in hand, or with empty hands and no station in range. */
export function mopInteract(state: GameState, player: Player): void {
  if (player.tool === 'mop') {
    if (player.cleaningTicksLeft !== 0) return;
    const mess = nearestMess(state, player.pos);
    if (!mess) return;
    player.cleaningTicksLeft = M.cleanTicks;
    player.cleaningMess = mess.id;
    return;
  }
  if (player.tool !== null || player.holding !== null) return;
  if (mopHolder(state) !== null) return;
  if (dist(player.pos, state.mop.pos) > RANGE) return;
  // A stale holder (gone or disconnected) loses any claim on the mop.
  const stale = state.players.find((x) => x.id === state.mop.heldBy);
  if (stale && stale.tool === 'mop') {
    stale.tool = null;
    stopCleaning(stale);
  }
  player.tool = 'mop';
  state.mop.heldBy = player.id;
}

/** Put the mop back in its corner from anywhere (R while carrying it, or its holder gone). */
export function returnMop(state: GameState, p: Player): void {
  p.tool = null;
  stopCleaning(p);
  sendHome(state);
}

function sendHome(state: GameState): void {
  const home = LAYOUT.mopHome;
  state.mop = { pos: { ...home }, heldBy: null };
  emitLog(state, 'drop', { item: 'mop', x: home.x, y: home.y });
}

/** Track A: the mop follows its holder; count down cleaning and remove the cleaned mess. */
export function stepCleaning(state: GameState): void {
  if (state.mop.heldBy !== null) {
    const holder = mopHolder(state);
    if (holder) state.mop.pos = { ...holder.pos };
    else {
      const stale = state.players.find((x) => x.id === state.mop.heldBy);
      if (stale && stale.tool === 'mop') returnMop(state, stale);
      else sendHome(state);
    }
  }

  for (const p of state.players) {
    if (p.cleaningTicksLeft === 0) continue;
    const mess = state.messes.find((m) => m.id === p.cleaningMess);
    // A stun, moving, losing the mop, or the mess already gone (another mop got there first) cancels it.
    if (p.stunTicksLeft > 0 || p.tool !== 'mop' || p.moveDir.x !== 0 || p.moveDir.y !== 0 || !mess) {
      stopCleaning(p);
      continue;
    }
    p.cleaningTicksLeft -= 1;
    if (p.cleaningTicksLeft > 0) continue;
    state.messes = state.messes.filter((m) => m !== mess);
    emitLog(state, 'clean', { player: p.id, x: mess.x, y: mess.y });
    p.cleaningMess = null;
  }
}
