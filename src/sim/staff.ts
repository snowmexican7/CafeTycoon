/**
 * Staff on the books (Gear runs). Round 3 item 3: the Strategist and the Marketer (src/sim/hires.ts) are hired at night
 * (`role` on the staff input) and draw their own daily wages at closing. Bot cut step 4a (Kennedy 2026-11-06): there are
 * no bot baristas to hire or fire any more and no crew wages; the solo robot cashier's daily charge is paid with the
 * wages. `wageEach` is what one of the second shop's baristas costs a day (src/sim/branch.ts).
 */
import { ECONOMY } from '../data/economy';
import { rentForDay } from './effects';
import { emitLog } from './log';
import { hireWagesForDay, isHired, type HireRole } from './hires';
import { strategistNight } from './strategist';
import { cashierOf } from './cashier';
import type { GameState, PlayerInput, TierId } from './types';

export const WAGE_BY_TIER: Record<TierId, number> = { stand: 1, cart: 3, cafe: 5 };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One barista's daily wage at the second shop (0 in classic runs). Paid by the hour: the tier's rate is for the
 * default day length, so a 60 s "quick" day pays 40% of it (B17).
 */
export function wageEach(state: GameState): number {
  if (!state.gear) return 0;
  const hours = Math.max(0, state.settings.dayLengthSec) / ECONOMY.dayLengthSec;
  return round2(WAGE_BY_TIER[state.tier ?? 'cafe'] * hours);
}

/**
 * Bot cut step 3: the robot cashier's daily charge (`ECONOMY.cashier.dailyCost`) when it is on shift: between days,
 * when the run has it switched on (it clocks in at the morning's syncCashier); during the day and at closing, when it
 * is behind the bar. Not part of `hireWages`.
 */
export function cashierWage(state: GameState): number {
  const onShift = state.phase === 'night' || state.phase === 'weekEnd' ? state.settings.cashier === true : cashierOf(state) !== undefined;
  return onShift ? ECONOMY.cashier.dailyCost : 0;
}

/** Wages owed at today's closing: the Strategist's and Marketer's (Round 3 item 3), plus the robot cashier's. */
export function wagesForDay(state: GameState): number {
  return round2(hireWagesForDay(state) + cashierWage(state));
}

/** Everything closing will take from the till: rent plus wages. */
export function billsForDay(state: GameState): number {
  return round2(rentForDay(state) + wagesForDay(state));
}

/**
 * A hire or a firing from the night board: the Strategist or the Marketer (one each, wage at closing, nothing up front;
 * a Strategist sets the peak prices at once). Gear runs, night only, people only; the input always names its `role`.
 */
export function applyStaffInput(state: GameState, input: Extract<PlayerInput, { kind: 'staff' }>): GameState {
  if (!state.gear || state.phase !== 'night') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot || !input.role) return state;
  return applyHireRole(state, input.role, input.action, input.playerId);
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

/**
 * Closing: pay the Strategist, the Marketer and the robot cashier. Recorded on the day as `wages` (`hireWages` is the
 * specialists' part).
 */
export function payWages(state: GameState): void {
  const hires = hireWagesForDay(state);
  const w = round2(hires + cashierWage(state));
  if (w <= 0) return;
  state.cash = round2(state.cash - w);
  state.today.wages = w;
  if (hires > 0) state.today.hireWages = hires;
}
