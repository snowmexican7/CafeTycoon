import { ECONOMY } from '../data/economy';
import { LAYOUT } from '../data/layout';
import { secondsToTicks } from './constants';
import { emitLog } from './log';
import { syncBots } from './bots/roster';
import type { GameState, Player, PlayerId, Vec2 } from './types';

/**
 * Easter egg: a barista can knock back a shot of espresso (Q, near the espresso machine).
 * Each shot today is stronger than the last; one too many and an ambulance comes for them.
 * Self-contained on purpose: everything lives on the optional `Player.espresso` and
 * `GameState.debt` fields, and the sim calls in through four small hooks
 * (input, start of a day tick, movement speed, day end / next morning).
 */
export const ESPRESSO = {
  /** Speed bonus of the 1st..5th shot of the day. The next one after these is a collapse. */
  boosts: [0.3, 0.35, 0.4, 0.45, 0.5],
  boostSeconds: 15,
  /** Beans used per shot. With no beans the machine just sputters and nothing happens. */
  beansPerShot: 1,
  ambulanceBill: 150,
  /** Share of each day's positive profit that goes to paying off the hospital tab. */
  repayShare: 0.5,
  /** The collapse gag, in seconds from the moment they fall: down, siren, paramedics in, wheeled out. */
  collapse: { fall: 1.2, ambulanceArrives: 3, medicsReach: 5.5, wheeledOut: 9.5 },
} as const;

export interface EspressoState {
  /** Shots today (the hidden counter). */
  shots: number;
  boostTicksLeft: number;
  /** Current speed multiplier while boosted (1.3 .. 1.5). */
  mul: number;
  /** state.tick when they collapsed today, or null. */
  collapsedAt: number | null;
  /** Where they fell. */
  fellAt: Vec2 | null;
  /** Out for the rest of today. */
  out: boolean;
}

export function espressoOf(p: Player): EspressoState | undefined {
  return p.espresso;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function fresh(): EspressoState {
  return { shots: 0, boostTicksLeft: 0, mul: 1, collapsedAt: null, fellAt: null, out: false };
}

/** True while this barista is collapsed or off at the hospital. */
export function isOut(p: Player): boolean {
  return p.espresso?.out === true;
}

/** Ticks since they collapsed (null if they didn't). */
export function collapseAge(state: GameState, p: Player): number | null {
  const at = p.espresso?.collapsedAt;
  return at == null ? null : state.tick - at;
}

export function canDrinkEspresso(state: GameState, p: Player): boolean {
  if (p.bot || !p.connected || isOut(p)) return false;
  if (state.phase !== 'day' && state.phase !== 'closing') return false;
  if (state.supplies.beans < ESPRESSO.beansPerShot) return false;
  const machine = state.stations.find((s) => s.kind === 'espresso');
  return !!machine && Math.hypot(p.pos.x - machine.pos.x, p.pos.y - machine.pos.y) <= ECONOMY.interactRangeTiles;
}

/** Hook: the `espresso` input. Bots never drink (step ignores bot inputs; this checks again). */
export function drinkEspresso(state: GameState, playerId: PlayerId): GameState {
  const p = state.players.find((x) => x.id === playerId);
  if (!p || !canDrinkEspresso(state, p)) return state;
  const e = (p.espresso ??= fresh());
  state.supplies.beans -= ESPRESSO.beansPerShot;
  e.shots += 1;
  if (e.shots <= ESPRESSO.boosts.length) {
    e.mul = 1 + ESPRESSO.boosts[e.shots - 1];
    e.boostTicksLeft = secondsToTicks(ESPRESSO.boostSeconds);
    emitLog(state, 'espresso.shot', { by: p.id, shot: e.shots });
    return state;
  }
  collapse(state, p);
  return state;
}

function collapse(state: GameState, p: Player): void {
  const e = p.espresso!;
  e.out = true;
  e.boostTicksLeft = 0;
  e.mul = 1;
  e.collapsedAt = state.tick;
  e.fellAt = { ...p.pos };
  p.holding = null;
  p.moveDir = { x: 0, y: 0 };
  p.interactQueued = false;
  state.today.ambulance = round2((state.today.ambulance ?? 0) + ESPRESSO.ambulanceBill);
  emitLog(state, 'espresso.collapse', { by: p.id, name: p.name });
  // A bot covers the empty spot if the crew has room for one (humanCount skips people who are out).
  syncBots(state);
}

/** Hook: start of every day/closing tick. Counts the boost down and keeps the collapsed still. */
export function stepEspresso(state: GameState): void {
  const wheelOut = secondsToTicks(ESPRESSO.collapse.wheeledOut);
  for (const p of state.players) {
    const e = p.espresso;
    if (!e) continue;
    if (e.boostTicksLeft > 0) {
      e.boostTicksLeft -= 1;
      if (e.boostTicksLeft === 0) e.mul = 1;
    }
    if (e.out) {
      p.moveDir = { x: 0, y: 0 };
      p.interactQueued = false;
      p.holding = null;
      // once the paramedics have wheeled them out, the body is off the floor
      if (e.collapsedAt !== null && state.tick - e.collapsedAt === wheelOut) p.pos = { ...LAYOUT.door };
    }
  }
}

/** Hook: movement speed multiplier for this barista. */
export function espressoSpeed(p: Player): number {
  const e = p.espresso;
  return e && e.boostTicksLeft > 0 && !e.out ? e.mul : 1;
}

/**
 * Hook: doors shut (after rent). Today's ambulance goes on the tab, and the tab is paid off from
 * today's profit (never more than the cash on hand, so a broke crew isn't bankrupted by it).
 */
export function settleEspresso(state: GameState): void {
  const d = state.today;
  const profit = d.sales + d.tips - d.rent;
  const owed = state.debt ?? 0;
  if (owed > 0 && profit > 0) {
    const pay = round2(Math.min(owed, profit * ESPRESSO.repayShare, Math.max(0, state.cash)));
    if (pay > 0) {
      state.cash = round2(state.cash - pay);
      d.debtPaid = pay;
      state.debt = round2(owed - pay);
    }
  }
  if (d.ambulance) state.debt = round2((state.debt ?? 0) + d.ambulance);
  for (const p of state.players) {
    if (p.espresso) {
      p.espresso.boostTicksLeft = 0;
      p.espresso.mul = 1;
    }
  }
}

/** Hook: the doors open on a new day. Anyone who collapsed is back (sheepish), counters reset. */
export function espressoMorning(state: GameState): void {
  let back = false;
  for (const p of state.players) {
    const e = p.espresso;
    if (!e) continue;
    if (e.out) {
      back = true;
      state.morningNotes.push(`${p.name} is back from the ER. The $${ESPRESSO.ambulanceBill} ambulance ride is on the tab. Maybe switch to decaf.`);
    }
    p.espresso = undefined;
  }
  if (back) syncBots(state); // the cover bot goes home
}
