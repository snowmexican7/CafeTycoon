/**
 * Phase 3 B15: the bot baristas are hired staff. In a Gear run each crew bot on the books draws a
 * daily wage at closing (stand $1, cart $3, café $5: the stand's line is machine-bound, so a bot
 * there adds little and costs little; the bigger shops lean on their crew). At night any person
 * on the crew can hire one more (up to the four spots behind the bar) or let the newest one go.
 * Classic runs keep free bots. Agency temps (the hire-temp card) and tester stand-ins never draw a wage.
 */
import { ECONOMY } from '../data/economy';
import { BOT_IDS, botsFor, humanCount, syncBots, wantedBots } from './bots/roster';
import { rentForDay } from './effects';
import type { GameState, PlayerInput, TierId } from './types';

export const WAGE_BY_TIER: Record<TierId, number> = { stand: 1, cart: 3, cafe: 5 };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The crew bots on the books right now (not temps, not stand-ins). */
export function staff(state: GameState): GameState['players'] {
  return state.players.filter((p) => p.bot && BOT_IDS.includes(p.id));
}

/**
 * How many are on the books: between days, the crew that clocks in tomorrow (bots only clock in at
 * the morning's syncBots); during the day and at closing, the bots actually behind the bar.
 */
export function crewCount(state: GameState): number {
  return state.phase === 'night' || state.phase === 'weekEnd' ? Math.max(wantedBots(state), staff(state).length) : staff(state).length;
}

/** Their names, in roster order (hires take the lowest free id, firings drop the highest). */
export function crewNames(state: GameState): string[] {
  const here = staff(state).map((p) => p.name);
  const n = crewCount(state);
  return here.length >= n ? here : ECONOMY.bots.names.slice(0, n);
}

/**
 * One hired barista's daily wage (0 in classic runs). Paid by the hour: the tier's rate is for the
 * default day length, so a 60 s "quick" day pays 40% of it (B17: quick-day Gear runs were going
 * bankrupt on wages alone).
 */
export function wageEach(state: GameState): number {
  if (!state.gear) return 0;
  const hours = Math.max(0, state.settings.dayLengthSec) / ECONOMY.dayLengthSec;
  return round2(WAGE_BY_TIER[state.tier ?? 'cafe'] * hours);
}

/** Wages owed at today's closing. */
export function wagesForDay(state: GameState): number {
  return round2(wageEach(state) * crewCount(state));
}

/** Everything closing will take from the till: rent plus wages. */
export function billsForDay(state: GameState): number {
  return round2(rentForDay(state) + wagesForDay(state));
}

/** Room for one more hire behind the bar? */
export function canHire(state: GameState): boolean {
  const n = crewCount(state);
  return !!state.gear && n < ECONOMY.bots.names.length && botsFor(n + 1, humanCount(state)) > n;
}

/** A hire or a firing, from the night board. Gear runs, night only, people only. */
export function applyStaffInput(state: GameState, input: Extract<PlayerInput, { kind: 'staff' }>): GameState {
  if (!state.gear || state.phase !== 'night') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  const n = crewCount(state);
  if (input.action === 'hire') {
    if (!canHire(state)) return state;
    state.settings.bots = n + 1;
  } else {
    if (n === 0) return state;
    state.settings.bots = n - 1;
  }
  syncBots(state);
  return state;
}

/** Closing: pay the crew. Recorded on the day as `wages`. */
export function payWages(state: GameState): void {
  const w = round2(wageEach(state) * staff(state).length);
  if (w <= 0) return;
  state.cash = round2(state.cash - w);
  state.today.wages = w;
}
