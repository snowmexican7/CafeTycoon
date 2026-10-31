/**
 * Round 3 item 3: two hires beside the baristas, both Gear runs only, both daily wages paid at closing with the crew's.
 *
 *   Strategist ($1/day)  the night forecast is honest, and the price calculator's best prices are set for the
 *                        current crowd at every night start (and the moment they are hired). Hand-set prices stand
 *                        until the next night start.
 *   Marketer ($2/day)    +15% walk-ins at whatever the prices are (a traffic modifier, `MARKETER_TRAFFIC`).
 *
 * `GameState.staff` holds who is on the books. Constants and predicates live here (no imports from the rest of the
 * sim) so effects.ts, forecast.ts and staff.ts can all read them without a cycle.
 */
import { ECONOMY } from '../data/economy';
import type { GameState } from './types';

export type HireRole = 'strategist' | 'marketer';
export const HIRE_ROLES: readonly HireRole[] = ['strategist', 'marketer'];

/** Daily wage at the default day length (like the crew's, paid by the hour: a 60 s quick day pays 40%). */
export const HIRE_WAGE: Record<HireRole, number> = { strategist: 1, marketer: 2 };
/** The marketer's walk-in multiplier. */
export const MARKETER_TRAFFIC = 1.15;

const round2 = (n: number) => Math.round(n * 100) / 100;

export const hasStrategist = (state: GameState): boolean => state.staff?.strategist === true;
export const hasMarketer = (state: GameState): boolean => state.staff?.marketer === true;
export const isHired = (state: GameState, role: HireRole): boolean => state.staff?.[role] === true;

/** One hire's wage for today's day length. */
export function hireWage(state: GameState, role: HireRole): number {
  return round2(HIRE_WAGE[role] * (Math.max(0, state.settings.dayLengthSec) / ECONOMY.dayLengthSec));
}

/** What the hired strategist and marketer cost for today (0 outside Gear runs). */
export function hireWagesForDay(state: GameState): number {
  if (!state.gear) return 0;
  return round2(HIRE_ROLES.filter((r) => isHired(state, r)).reduce((n, r) => n + hireWage(state, r), 0));
}
