import { describe, expect, it } from 'vitest';
import { specialistsLabel, wageRows } from './wagesLine';
import { ECONOMY } from '../data/economy';

const money = (n: number) => `$${n.toFixed(2)}`;

describe('ui-3.10.0 receipt wages line (bot cut Phase 2)', () => {
  it('reads as the robot cashier alone on a solo day with no hires', () => {
    expect(wageRows(ECONOMY.cashier.dailyCost, undefined, undefined, money)).toEqual([{ label: 'Robot cashier', amount: '$1.00' }]);
  });
  it('splits the cashier from the Strategist / Marketer', () => {
    expect(wageRows(13, 12, { strategist: true }, money)).toEqual([
      { label: 'Robot cashier', amount: '$1.00' },
      { label: 'Strategist', amount: '$12.00' },
    ]);
    expect(wageRows(20, 20, { strategist: true, marketer: true }, money)).toEqual([{ label: 'Strategist + Marketer', amount: '$20.00' }]);
  });
  it('shows nothing without wages', () => {
    expect(wageRows(0, 0, undefined, money)).toEqual([]);
    expect(specialistsLabel(undefined)).toBe('Strategist / Marketer');
  });
});
