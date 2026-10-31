/*
 * G4g (playtest: "co-op with only espresso leaves one person with nothing to do"): the till is a job.
 * Gear runs only. Empty hands at the counter, with nothing on the pass for a waiting customer, ring up
 * the next customer in line who is still in the order stage: they move to pickup, relax (patience topped up
 * by half their max) and a clock starts. Set their drink on the pickup counter fast for a speed tip: within
 * 30 s +$0.50, within 60 s +$0.25. Anyone, bots included, can ring. No RNG.
 *
 * Round 3 item 5: ringing up takes time, by checkout tier (`TILL.ring`): the register 1.5 s, the kiosk 1.0 s,
 * and the top tier (Squarely) is self-order. One press of E at the till starts the ring (`GameState.ringUp`,
 * `ringProgress` is 0..1 for the UI bar); the person just stays at the till with empty hands until it finishes,
 * and walking away (or picking something up, being stunned, the customer leaving) cancels it. Self-order needs
 * nobody: the next customer in line orders by themselves after a short beat (`TILL.selfBeat`) with a smaller
 * patience boost. One ring at a time. Events: `till.start`, `till.cancel`, `till.rung` (`by: ''` for self-order).
 */
import type { CheckoutId, Customer, GameState, PlayerId } from './types';
import { TICK_RATE, secondsToTicks } from './constants';
import { emitLog } from './log';
import { checkoutOf } from './checkout';
import { nearestStation } from './movement';
import { spotOf } from './pickup';
import { DRINK_INFO } from '../data/drinks';

export const TILL = {
  patienceBoost: 0.5,
  /** Self-order: the smaller patience top-up (share of max). */
  selfBoost: 0.1,
  /** Self-order: seconds the screen takes per customer. */
  selfBeat: 1.0,
  /** Seconds a person takes to ring up, by the checkout in use; 'self' = customers order by themselves. */
  ring: { register: 1.5, kiosk: 1.0, squarely: 'self' } as Record<CheckoutId, number | 'self'>,
  fast: { seconds: 30, tip: 0.5 },
  ok: { seconds: 60, tip: 0.25 },
} as const;

/** Seconds a ring-up takes on this checkout (or 'self' for the self-order tier). */
export const ringSeconds = (checkout: CheckoutId): number | 'self' => TILL.ring[checkout];

/** The checkout in use is the self-order tier (Gear runs only). */
export const selfOrder = (state: GameState): boolean => state.gear === true && ringSeconds(checkoutOf(state).active) === 'self';

/** The next customer in line still in the order stage (none for campers, upset or already-rung customers). */
function nextToOrder(state: GameState): Customer | undefined {
  return state.customers.find((c) => c.egg !== 'camper' && (c.stage ?? 'order') === 'order' && !c.upset && c.rungAt === undefined);
}

/**
 * The next customer in line a person can ring up. None outside Gear runs, none while a ring is under way (one at a
 * time), and none in the self-order tier (the screen takes the orders).
 */
export function tillNext(state: GameState): Customer | undefined {
  if (state.gear !== true || state.ringUp || selfOrder(state)) return undefined;
  return nextToOrder(state);
}

/** The ring in progress, 0..1, or null when nobody is ringing. */
export function ringProgress(state: GameState): number | null {
  const r = state.ringUp;
  if (!r) return null;
  return Math.max(0, Math.min(1, (state.tick - r.startedAt) / Math.max(1, r.ticks)));
}

/** Start ringing up the next customer (E at the till). Returns false when there is nobody to ring, the till is busy or the player's hands are full. */
export function tillRingUp(state: GameState, playerId: PlayerId): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.holding !== null || player.tool) return false;
  const c = tillNext(state);
  if (!c) return false;
  const secs = ringSeconds(checkoutOf(state).active) as number; // tillNext is undefined for 'self'
  state.ringUp = { customer: c.id, by: playerId, startedAt: state.tick, ticks: secondsToTicks(secs) };
  emitLog(state, 'till.start', { customer: c.id, by: playerId, seconds: secs });
  return true;
}

/** The ring is done: the customer moves to pickup, with the person's boost (`by` set) or the screen's (`by` ''). */
function finishRing(state: GameState, c: Customer, by: PlayerId | ''): void {
  c.rungAt = state.tick;
  c.stage = 'pickup';
  const boost = by === '' ? TILL.selfBoost : TILL.patienceBoost;
  c.patienceLeft = Math.min(c.patienceMax, c.patienceLeft + c.patienceMax * boost);
  if (by !== '') {
    const what = DRINK_INFO[c.drink].name.toLowerCase();
    const n = c.items?.length ?? 1; // FB2 B6: a multi-drink ticket
    const text =
      n > 1
        ? `🧾 Rang up ${c.order === 'office' ? 'an office run' : 'an order'} of ${n} drinks. They pay when the last one is on the pickup counter.`
        : `🧾 Rang up ${c.name ? `${c.name}'s ` : 'a '}${what}. Set it on the pickup counter fast for a tip.`;
    emitLog(state, 'gear.quirk', { gear: '', text, by });
  }
  emitLog(state, 'till.rung', { customer: c.id, drink: c.drink, by });
}

function cancelRing(state: GameState): void {
  const r = state.ringUp;
  if (!r) return;
  delete state.ringUp;
  emitLog(state, 'till.cancel', { customer: r.customer, by: r.by });
}

/**
 * Each day tick (after the presses): a self-order screen picks up the next customer; a ring under way checks it
 * still holds (customer still waiting to order, ringer still at the till with free hands) and finishes on time.
 */
export function stepRingUp(state: GameState): void {
  if (state.gear !== true) {
    delete state.ringUp;
    return;
  }
  if (!state.ringUp && selfOrder(state)) {
    const c = nextToOrder(state);
    if (c) {
      state.ringUp = { customer: c.id, by: '', startedAt: state.tick, ticks: secondsToTicks(TILL.selfBeat) };
      emitLog(state, 'till.start', { customer: c.id, by: '', seconds: TILL.selfBeat });
    }
  }
  const r = state.ringUp;
  if (!r) return;
  const c = state.customers.find((x) => x.id === r.customer);
  if (!c || c.egg === 'camper' || (c.stage ?? 'order') !== 'order' || c.upset || c.rungAt !== undefined) return cancelRing(state);
  if (r.by !== '') {
    const p = state.players.find((x) => x.id === r.by);
    const at = p ? nearestStation(state, p.pos) : null;
    if (!p || !p.connected || p.holding !== null || p.tool || p.stunTicksLeft > 0 || !at || at.kind !== 'counter' || spotOf(at) !== 'till') return cancelRing(state);
  }
  if (state.tick - r.startedAt < r.ticks) return;
  delete state.ringUp;
  finishRing(state, c, r.by);
}

/** The speed tip for a rung customer served now (0 if never rung or slow). */
export function tillSpeedTip(state: GameState, c: Customer): number {
  if (c.rungAt === undefined) return 0;
  const secs = (state.tick - c.rungAt) / TICK_RATE;
  return secs <= TILL.fast.seconds ? TILL.fast.tip : secs <= TILL.ok.seconds ? TILL.ok.tip : 0;
}
