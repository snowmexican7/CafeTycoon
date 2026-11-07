import { describe, expect, it } from 'vitest';
import { easeOfWand, wandEaseChip, wandEaseVM } from './wandEase';
import { WAND_EASE } from '../sim/handmade';
import { gearStats } from './gearVM';

describe('ui-3.10.0 wand ease on gear cards', () => {
  it('maps each wand to the sim ease tier', () => {
    expect(easeOfWand('weak')).toBe(0);
    expect(easeOfWand('strong')).toBe(1);
    expect(easeOfWand('built', 'e5')).toBe(2);
    expect(easeOfWand('built', 'e6')).toBe(3);
  });
  it('shows pips and the foam band from WAND_EASE, never wand seconds', () => {
    expect(wandEaseVM(0).pips).toBe('●○○○');
    expect(wandEaseVM(3).pips).toBe('●●●●');
    const x = WAND_EASE[1]!.perfect / WAND_EASE[0]!.perfect;
    expect(wandEaseVM(1).text).toContain(`×${Number.isInteger(x) ? x : x.toFixed(1).replace(/\.0$/, '')}`);
    expect(wandEaseChip(wandEaseVM(2))).toContain('data-ease="2"');
    for (const id of ['e5', 'e6'] as const) {
      expect(gearStats(id)).toContain('Steam wand built in (milk');
      expect(gearStats(id)).not.toMatch(/\d s steam/);
    }
  });
});
