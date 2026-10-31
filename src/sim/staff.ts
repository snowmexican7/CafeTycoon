/**
 * Phase 3 B15: the bot baristas are hired staff. In a Gear run each crew bot on the books draws a
 * daily wage at closing (stand $1, cart $3, café $5: the stand's line is machine-bound, so a bot
 * there adds little and costs little; the bigger shops lean on their crew). At night any person
 * on the crew can hire one more (up to the four spots behind the bar) or let the newest one go.
 * Round 3 item 3: the Strategist and Marketer (src/sim/hires.ts) are hired the same way (`role` on the staff input)
 * and draw their own daily wages at the same closing. Classic runs keep free bots. Agency temps (the hire-temp card) and tester stand-ins never draw a wage.
 */
import { ECONOMY } from '../data/economy';
import { BOT_IDS, botsFor, humanCount, syncBots, wantedBots } from './bots/roster';
import { rentForDay } from './effects';
import { emitLog } from './log';
import { hireWagesForDay, isHired, type HireRole } from './hires';
import { strategistNight } from './strategist';
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

/**
 * Review M6: the bots the crew actually hired (the bots setting for everyone on the crew, connected or not).
 * A cover bot that syncBots adds when somebody drops or collapses is not on the books.
 */
export function hiredCount(state: GameState): number {
  const people = state.players.filter((p) => (p.bot ? p.bot.personality === 'human' : true)).length;
  return botsFor(state.settings.bots, people);
}

/** The bots that draw a wage today. */
const paidCount = (state: GameState): number => Math.min(crewCount(state), hiredCount(state));

/** Wages owed at today's closing: the crew's, plus the Strategist's and Marketer's (Round 3 item 3). */
export function wagesForDay(state: GameState): number {
  return round2(wageEach(state) * paidCount(state) + hireWagesForDay(state));
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

/**
 * A hire or a firing, from the night board. Gear runs, night only, people only. With a `role` it is the Strategist or
 * the Marketer (one each, wage at closing, nothing up front; a Strategist sets the peak prices at once); without one,
 * a barista.
 */
export function applyStaffInput(state: GameState, input: Extract<PlayerInput, { kind: 'staff' }>): GameState {
  if (!state.gear || state.phase !== 'night') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  if (input.role) return applyHireRole(state, input.role, input.action, input.playerId);
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

/** Round 3 item 3: put the Strategist or the Marketer on the books, or let them go. */
function applyHireRole(state: GameState, role: HireRole, action: 'hire' | 'fire', by: string): GameState {
  const on = isHired(state, role);
  if (action === 'hire') {
    if (on) return state;
    state.staff = { ...(state.staff ?? {}), [role]: true };
    emitLog(state, 'staff.hire', { role, by });
    if (role === 'strategist') strategistNight(state);
    return state;
  }
  if (!on) return state;
  const rest = { ...state.staff };
  delete rest[role];
  if (Object.keys(rest).length) state.staff = rest;
  else delete state.staff;
  emitLog(state, 'staff.fire', { role, by });
  return state;
}

/** Closing: pay the crew, the Strategist and the Marketer. Recorded on the day as `wages` (`hireWages` is the specialists' part). */
export function payWages(state: GameState): void {
  const crew = round2(wageEach(state) * Math.min(staff(state).length, hiredCount(state)));
  const hires = hireWagesForDay(state);
  const w = round2(crew + hires);
  if (w <= 0) return;
  state.cash = round2(state.cash - w);
  state.today.wages = w;
  if (hires > 0) state.today.hireWages = hires;
}
