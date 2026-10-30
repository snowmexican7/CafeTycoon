/*
 * G4g (playtest: "co-op with only espresso leaves one person with nothing to do"): the till is a job.
 * Gear runs only. Empty hands at the counter, with nothing on the pass for a waiting customer, ring up
 * the next customer in line who hasn't been rung: they relax (patience topped up) and a clock starts.
 * Hand their drink off fast for a speed tip: within 30 s +$0.50, within 60 s +$0.25. Unrung customers
 * are still served exactly as before, so in solo the till is optional but worth a press.
 * Bots never ring (bot-side till work is in BACKLOG for Claude). No RNG.
 */
import type { Customer, GameState, PlayerId } from './types';
import { TICK_RATE } from './constants';
import { emitLog } from './log';
import { DRINK_INFO } from '../data/drinks';

export const TILL = { patienceBoost: 0.25, fast: { seconds: 30, tip: 0.5 }, ok: { seconds: 60, tip: 0.25 } } as const;

/** The next customer in line the till can ring up (none outside Gear runs, none for campers). */
export function tillNext(state: GameState): Customer | undefined {
  if (state.gear !== true) return undefined;
  return state.customers.find((c) => c.egg !== 'camper' && c.rungAt === undefined && !c.upset);
}

/** Ring up the next customer. Returns false when there is nobody to ring (or a bot pressed). */
export function tillRingUp(state: GameState, playerId: PlayerId): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.bot || player.holding !== null) return false;
  const c = tillNext(state);
  if (!c) return false;
  c.rungAt = state.tick;
  c.patienceLeft = Math.min(c.patienceMax, c.patienceLeft + c.patienceMax * TILL.patienceBoost);
  const what = DRINK_INFO[c.drink].name.toLowerCase();
  emitLog(state, 'gear.quirk', { gear: '', text: `🧾 Rang up ${c.name ? `${c.name}'s ` : 'a '}${what}. Hand it off fast for a tip.`, by: playerId });
  return true;
}

/** The speed tip for a rung customer served now (0 if never rung or slow). */
export function tillSpeedTip(state: GameState, c: Customer): number {
  if (c.rungAt === undefined) return 0;
  const secs = (state.tick - c.rungAt) / TICK_RATE;
  return secs <= TILL.fast.seconds ? TILL.fast.tip : secs <= TILL.ok.seconds ? TILL.ok.tip : 0;
}
