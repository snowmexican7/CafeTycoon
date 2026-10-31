import { describe, expect, it } from 'vitest';
import { devHtml, devInput, isDevMode, pauseToggle } from './dev';

describe('ui-3.5.1: dev mode', () => {
  it('is on only with ?dev=1', () => {
    expect(isDevMode('?dev=1')).toBe(true);
    expect(isDevMode('?room=ab&dev=1')).toBe(true);
    expect(isDevMode('')).toBe(false);
    expect(isDevMode('?dev=0')).toBe(false);
    expect(isDevMode('?dev')).toBe(false);
  });
  const night = { phase: 'night', isHost: true, nightLengthSec: 120 };
  it('pausing sends a relaxed night and remembers the old length; un-pausing puts it back', () => {
    const t = pauseToggle(night, { saved: null })!;
    expect(t).toEqual({ send: 0, saved: 120 });
    expect(pauseToggle({ ...night, nightLengthSec: 0 }, { saved: 120 })).toEqual({ send: 120, saved: null });
  });
  it('only the host can pause, and only at night', () => {
    expect(pauseToggle({ ...night, isHost: false }, { saved: null })).toBeNull();
    expect(pauseToggle({ ...night, phase: 'day' }, { saved: null })).toBeNull();
    expect(devHtml({ ...night, isHost: false }, { saved: null }, true)).toMatch(/data-dev="pause"[^>]*disabled/);
  });
  it('shows the DEV badge and the pause toggle; the stubs stay off until the sim has them', () => {
    const h = devHtml(night, { saved: null }, true);
    expect(h).toContain('>DEV<');
    expect(h).toContain('Pause night timer');
    expect(h).toMatch(/data-act="unlimitedMoney" disabled/);
    expect(devInput('unlimitedMoney', 'p1')).toBeNull();
    expect(devHtml({ ...night, nightLengthSec: 0 }, { saved: 120 }, true)).toContain('Start the night timer again');
  });
});
