import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../data/economy';
import { dayOptions, DEFAULT_DAY_LENGTH } from './title';

describe('day length options', () => {
  it('labels the real default, not a hardcoded one', () => {
    expect(DEFAULT_DAY_LENGTH).toBe(ECONOMY.dayLengthSec);
    const html = dayOptions(ECONOMY.dayLengthSec);
    const defaults = html.match(/(\d+) s · default/g) ?? [];
    expect(defaults).toEqual([`${ECONOMY.dayLengthSec} s · default`]);
    expect(html).toContain(`value="${ECONOMY.dayLengthSec}" selected`);
    expect(html).not.toContain('120 s · default');
  });
});
