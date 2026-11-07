/**
 * ui-3.10.0 (bot cut Phase 2): the receipt's wages line. Bot baristas and crew wages are gone, so what's left on
 * `DayStats.wages` is the solo robot cashier's daily charge (`ECONOMY.cashier.dailyCost`, $1) plus the Strategist /
 * Marketer hires (`DayStats.hireWages`). The receipt shows one "Wages" total with a sub-row per payee.
 */
import type { GameState } from '../sim/types';

export interface WageRow {
  label: string;
  amount: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Who the specialists' share went to, from `GameState.staff` (falls back to both names). */
export function specialistsLabel(staff: GameState['staff'] | undefined): string {
  const names = [staff?.strategist ? 'Strategist' : '', staff?.marketer ? 'Marketer' : ''].filter(Boolean);
  return names.length ? names.join(' + ') : 'Strategist / Marketer';
}

/** Sub-rows under "Wages": the robot cashier's part (wages minus the hires) and the specialists' part. */
export function wageRows(wages: number | undefined, hireWages: number | undefined, staff: GameState['staff'] | undefined, money: (n: number) => string): WageRow[] {
  const w = wages ?? 0;
  if (w <= 0) return [];
  const hires = Math.min(w, hireWages ?? 0);
  const cashier = r2(w - hires);
  const rows: WageRow[] = [];
  if (cashier > 0) rows.push({ label: 'Robot cashier', amount: money(cashier) });
  if (hires > 0) rows.push({ label: specialistsLabel(staff), amount: money(hires) });
  return rows;
}
