/**
 * P4 B6 (lite): phone calls from the second shop. On some days, partway through opening hours, the
 * branch rings with a problem: a broken machine (pay to fix it, or it serves half today) or a big
 * office order (take it for a flat profit, but it eats some of the branch's cups). Bot cut: nobody answers;
 * the branch decides itself when the call first rings (`branchTakesCall`), and the HUD shows it as a heads-up.
 * Which days ring, what about and when come from a hash of the seed and day: no RNG draw, so
 * replays and guests agree. Travelling to the branch is deferred (two live floors).
 */
import { secondsToTicks } from './constants';
import { emitLog } from './log';
import type { GameState } from './types';

export const CALL = {
  /** Chance a given day rings, once the branch has been open a full day. */
  chance: 0.45,
  /** It rings somewhere between 25% and 55% of the way through opening hours. */
  ringFrom: 0.25,
  ringSpan: 0.3,
  /** Seconds it rings (the heads-up's window). */
  answerSec: 25,
  repair: 25,
  orderProfit: 30,
  orderCups: 10,
} as const;

export type CallKind = 'machine' | 'order';
export interface BranchCall { kind: CallKind; /** Ticks after opening when it starts ringing. */ ringAt: number; /** Ticks after opening when it stops. */ until: number }

function hash(seed: number, day: number, salt: number): number {
  let h = Math.imul((seed >>> 0) ^ 0x85ebca6b, 2654435761) ^ Math.imul(day * 31 + salt, 40503);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Today's call from the branch, if any (pure). */
export function callFor(state: GameState, day = state.day): BranchCall | null {
  const b = state.branch;
  if (!state.gear || !b || b.openedDay >= day) return null;
  if (hash(state.seed, day, 1) >= CALL.chance) return null;
  const dayTicks = secondsToTicks(state.settings.dayLengthSec);
  const ringAt = Math.floor(dayTicks * (CALL.ringFrom + hash(state.seed, day, 2) * CALL.ringSpan));
  return { kind: hash(state.seed, day, 3) < 0.5 ? 'machine' : 'order', ringAt, until: Math.min(dayTicks, ringAt + secondsToTicks(CALL.answerSec)) };
}

export const elapsed = (state: GameState): number => secondsToTicks(state.settings.dayLengthSec) - state.phaseTicksLeft;

/**
 * Bot cut: the branch handles its own calls. An office order is taken unless yesterday's branch day lost
 * people (`walked === 0`); a broken machine is fixed when the branch has two or more staff. Pure.
 */
export function branchTakesCall(state: GameState, kind: CallKind): boolean {
  if (kind === 'order') return (state.days.at(-1)?.branch?.walked ?? 0) === 0;
  return (state.branch?.staff ?? 0) >= 2;
}

/** Today's decision, once the call has rung (else undefined). */
const decided = (state: GameState): { day: number; take: boolean } | undefined => (state.callDecision?.day === state.day ? state.callDecision : undefined);

/**
 * The call that is ringing right now (day phase, inside its window), with seconds left and what the branch does
 * about it. It rings for its whole window: a heads-up, nobody answers it.
 */
export function callRinging(state: GameState): (BranchCall & { secsLeft: number; take: boolean }) | null {
  if (state.phase !== 'day') return null;
  const c = callFor(state);
  if (!c) return null;
  const t = elapsed(state);
  if (t < c.ringAt || t >= c.until) return null;
  return { ...c, secsLeft: Math.ceil((c.until - t) / secondsToTicks(1)), take: decided(state)?.take ?? branchTakesCall(state, c.kind) };
}

/** The day's tick calls this: when today's call first rings, the branch decides and logs `call.outcome`. */
export function noteCallRang(state: GameState): void {
  if (decided(state)) return;
  const c = callRinging(state);
  if (!c) return;
  state.callDecision = { day: state.day, take: c.take };
  emitLog(state, 'call.outcome', { kind: c.kind, take: c.take });
}

/** How today's call ended, for closing: null when there was no call, or the shop closed before it rang. */
export function callOutcome(state: GameState): { kind: CallKind; took: boolean } | null {
  const c = callFor(state);
  const d = decided(state);
  return c && d ? { kind: c.kind, took: d.take } : null;
}
