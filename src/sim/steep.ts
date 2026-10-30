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
 *
 * Must not import ./gear (sim/gear.ts and others will import this). Pure, no RNG.
 */
import { GEAR } from '../data/gear';
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
