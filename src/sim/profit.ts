import type { DayStats } from './types';

/** The day's net: everything that moved the till during the day (sales, tips, bonuses, minus rent, fines and tab paid). */
export function profitOf(d: DayStats): number {
  return Math.round((d.sales + d.tips + (d.bonus ?? 0) - d.rent - (d.fines ?? 0) - (d.debtPaid ?? 0) - (d.twistCost ?? 0) - (d.checkoutFees ?? 0)) * 100) / 100;
}
