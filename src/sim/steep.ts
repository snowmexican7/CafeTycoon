/*
 * Batch/pickup (docs/superpowers/specs/2026-10-30-batch-pickup-design.md §2): cold brew is steeped at night.
 * Gear runs only. The crew sets a sticky target for tomorrow's cups (absent = the taps' full cap); leftovers
 * from today count first and concentrate pays only for the top-up.
 *
 *  - `STEEP.maxInput`: the largest number the night input accepts (the sim clamps to the taps' cap).
 *  - `tapCap(station)`: a cold brew tap's daily cap (its gear's `batch`; 0 for no gear or no cap).
 *  - `steepCap(state)`: the taps' caps added up (0 outside Gear runs).
 *  - `steepTarget(state)`: tonight's target, never above the cap.
 *  - `steepPlan(state)`: how tomorrow's cups would be made from leftovers and concentrate.
 *  - `applySteepInput(state, input)`: the night input (Gear, night, connected people only; ignored with no cap).
 *  - `steepMorning(state)`: the morning top-up: leftovers fill the taps first (poured oldest first), concentrate is
 *    charged for the fresh top-up only; cups with no tap to go in are poured out with a note.
 *  - `steepClosing(state)`: at closing, cups left in a tap that were steeped the day before are poured out
 *    (wasted tally); the rest keep one more day in `coldBrewLeft`.
 *
 * Must not import ./gear (sim/gear.ts and others will import this). Pure, no RNG.
 */
import { GEAR } from '../data/gear';
import { emitLog } from './log';
import { tally } from './tally';
import type { GameState, PlayerInput, Station } from './types';

export const STEEP = { maxInput: 200 } as const;

/** How many cups this station steeps a day: a cold brew tap's gear batch, else 0. */
export function tapCap(s: Station): number {
  if (s.kind !== 'coldBrewTap' || !s.gear) return 0;
  return GEAR[s.gear].batch ?? 0;
}

/** Every tap's cap added up (two taps pool); 0 outside a Gear run. */
export function steepCap(state: GameState): number {
  if (state.gear !== true) return 0;
  return state.stations.reduce((sum, s) => sum + tapCap(s), 0);
}

/** Tomorrow's target: the sticky choice (absent = the full cap), never above the cap. */
export function steepTarget(state: GameState): number {
  const cap = steepCap(state);
  return Math.min(state.steep ?? cap, cap);
}

export interface SteepPlan {
  cap: number;
  target: number;
  /** Cups carried over from today (never more than the cap). */
  leftover: number;
  /** Fresh cups needed on top of the leftovers. */
  topUp: number;
  /** Fresh cups the concentrate can pay for (one each). */
  paid: number;
  /** Fresh cups that can't be paid for. */
  short: number;
}

/** Leftovers first, then concentrate for the top-up only. */
export function steepPlan(state: GameState): SteepPlan {
  const cap = steepCap(state);
  const target = steepTarget(state);
  const leftover = Math.min(state.coldBrewLeft ?? 0, cap);
  const topUp = Math.max(0, target - leftover);
  const paid = Math.min(topUp, Math.floor(state.supplies.concentrate ?? 0));
  return { cap, target, leftover, topUp, paid, short: topUp - paid };
}

/** Night input: set tomorrow's steep target (sticky), clamped to the taps' cap. */
export function applySteepInput(state: GameState, input: Extract<PlayerInput, { kind: 'steep' }>): GameState {
  if (state.gear !== true || state.phase !== 'night') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  const cap = steepCap(state);
  if (cap === 0) return state;
  state.steep = Math.min(input.cups, cap);
  return state;
}

const cupsWord = (n: number) => `${n} cup${n === 1 ? '' : 's'}`;

/**
 * The morning: fill the taps in slot order up to each tap's cap, yesterday's cups first, then fresh ones
 * (concentrate charged for those only). Gear runs only. A shop with no cap (no tap) pours the leftovers out.
 */
export function steepMorning(state: GameState): void {
  if (state.gear !== true) return;
  const plan = steepPlan(state);
  const left = state.coldBrewLeft ?? 0;
  const taps = state.stations.filter((s) => s.kind === 'coldBrewTap');
  for (const s of taps) {
    delete s.batchLeft;
    delete s.batchOld;
  }
  delete state.coldBrewLeft;
  if (left > plan.cap) {
    state.morningNotes.push(`${cupsWord(left - plan.cap)} of yesterday's cold brew had no tap to go in and were poured out.`);
  }
  if (plan.cap === 0) return;
  state.supplies.concentrate = Math.max(0, (state.supplies.concentrate ?? 0) - plan.paid);
  let old = plan.leftover;
  let fresh = plan.paid;
  for (const s of taps) {
    const cap = tapCap(s);
    if (cap === 0) continue;
    const takeOld = Math.min(cap, old);
    const takeFresh = Math.min(cap - takeOld, fresh);
    old -= takeOld;
    fresh -= takeFresh;
    s.batchLeft = takeOld + takeFresh;
    if (takeOld > 0) s.batchOld = takeOld;
  }
  if (plan.short > 0) state.morningNotes.push(`Only ${plan.paid} of ${plan.topUp} cold brews could steep: not enough concentrate.`);
  emitLog(state, 'steep', { cups: plan.leftover + plan.paid, paid: plan.paid });
}

/**
 * Closing: yesterday's cups still in a tap are poured out (wasted); today's unsold cups are kept for one more day.
 * Gear runs only. Never touches the inspector (finishDay calls this after judging).
 */
export function steepClosing(state: GameState): void {
  if (state.gear !== true) return;
  let keep = 0;
  let waste = 0;
  for (const s of state.stations) {
    if (s.kind !== 'coldBrewTap') continue;
    const total = Math.max(0, s.batchLeft ?? 0);
    const old = Math.min(total, Math.max(0, s.batchOld ?? 0));
    waste += old;
    keep += total - old;
    delete s.batchLeft;
    delete s.batchOld;
  }
  if (waste > 0) tally(state.today, 'wasted', waste);
  if (keep > 0) state.coldBrewLeft = keep;
  else delete state.coldBrewLeft;
}
