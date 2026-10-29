import { describe, it, expect } from 'vitest';
import { main, type BalanceReport } from '../scripts/balanceCore';

describe('balance tester', () => {
  it('runs one short week through the tester entry point, deterministically', () => {
    const a = main(['--weeks', '1', '--seed', '3', '--day', '30', '--json']);
    expect(a.code).toBe(0);
    const r = JSON.parse(a.output) as BalanceReport;
    expect(r.weeks).toHaveLength(1);
    expect(r.weeks[0].days.length).toBeGreaterThan(0);
    expect(r.weeks[0].days.length).toBeLessThanOrEqual(7);
    expect(r.weeks[0].days.reduce((n, d) => n + d.served, 0)).toBeGreaterThan(0);
    expect(main(['--weeks', '1', '--seed', '3', '--day', '30', '--json']).output).toBe(a.output);
  });
  it('rejects bad options with exit code 2 and warns about an empty café', () => {
    expect(main(['--humans', '3', '--bots', '2']).code).toBe(2);
    expect(main(['--frobnicate']).code).toBe(2);
    expect(main(['--weeks', '1', '--day', '30', '--humans', '0', '--bots', '0']).output).toContain('No baristas');
  });
});
