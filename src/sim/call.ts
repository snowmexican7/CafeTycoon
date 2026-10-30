/**
 * P4 B6 (lite): phone calls from the second shop. On some days, partway through opening hours, the
 * branch rings with a problem: a broken machine (pay to fix it, or it serves half today) or a big
 * office order (take it for a flat profit, but it eats some of the branch's cups). Any person on the
 * floor can answer from the HUD while it rings; a missed call counts as "let it ring".
 * Which days ring, what about and when come from a hash of the seed and day: no RNG draw, so
 * replays and guests agree. Travelling to the branch is deferred (two live floors).
 */
import { secondsToTicks } from './constants';
import type { GameState, PlayerInput } from './types';

export const CALL = {
  /** Chance a given day rings, once the branch has been open a full day. */
  chance: 0.45,
  /** It rings somewhere between 25% and 55% of the way through opening hours. */
  ringFrom: 0.25,
  ringSpan: 0.3,
  /** Seconds it rings before it counts as missed. */
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

const elapsed = (state: GameState): number => secondsToTicks(state.settings.dayLengthSec) - state.phaseTicksLeft;

/** The call that is ringing right now (day phase, inside its window, not yet answered), with seconds left. */
export function callRinging(state: GameState): (BranchCall & { secsLeft: number }) | null {
  if (state.phase !== 'day') return null;
  const c = callFor(state);
  if (!c || state.callAnswer?.day === state.day) return null;
  const t = elapsed(state);
  if (t < c.ringAt || t >= c.until) return null;
  return { ...c, secsLeft: Math.ceil((c.until - t) / secondsToTicks(1)) };
}

/** Mark today's call as having rung, once it first does (the day's tick calls this; review I2). */
export function noteCallRang(state: GameState): void {
  if (state.callRang !== state.day && callRinging(state)) state.callRang = state.day;
}

/** A person picks up (take = fix it / take the order) or lets it ring, while it rings. */
export function applyCall(state: GameState, input: Extract<PlayerInput, { kind: 'call' }>): void {
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || p.bot || !callRinging(state)) return;
  state.callAnswer = { day: state.day, take: input.take, by: p.name };
}

/** How today's call ended, for closing: null when there was no call, or the shop closed before it rang. */
export function callOutcome(state: GameState): { kind: CallKind; took: boolean; by?: string } | null {
  const c = callFor(state);
  if (!c) return null;
  const a = state.callAnswer?.day === state.day ? state.callAnswer : undefined;
  if (!a && state.callRang !== state.day) return null; // never rang (closed early): not a missed call
  return { kind: c.kind, took: !!a?.take, ...(a ? { by: a.by } : {}) };
}
