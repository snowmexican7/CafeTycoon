import { describe, expect, it } from 'vitest';
import { devHtml, devInput, isDevMode, pauseInput } from './dev';

describe('ui-3.5.1: dev mode', () => {
  it('is on only with ?dev=1', () => {
    expect(isDevMode('?dev=1')).toBe(true);
    expect(isDevMode('?room=ab&dev=1')).toBe(true);
    expect(isDevMode('')).toBe(false);
    expect(isDevMode('?dev=0')).toBe(false);
    expect(isDevMode('?dev')).toBe(false);
  });
  const night = { phase: 'night', isHost: true, devRun: true, paused: false };
  it('pause sends the sim devPause input, and un-pause sends it back', () => {
    expect(pauseInput(night, 'p1')).toEqual({ kind: 'devPause', playerId: 'p1', paused: true });
    expect(pauseInput({ ...night, paused: true }, 'p1')).toEqual({ kind: 'devPause', playerId: 'p1', paused: false });
    expect(pauseInput({ ...night, phase: 'weekEnd' }, 'p1')).not.toBeNull();
  });
  it('only the host of a dev run can pause, and only at night', () => {
    expect(pauseInput({ ...night, isHost: false }, 'p1')).toBeNull();
    expect(pauseInput({ ...night, phase: 'day' }, 'p1')).toBeNull();
    expect(pauseInput({ ...night, devRun: false }, 'p1')).toBeNull();
    expect(devHtml({ ...night, isHost: false }, true)).toMatch(/data-dev="pause"[^>]*disabled/);
    expect(devHtml({ ...night, devRun: false }, true)).toContain('Start a new game to use dev mode');
  });
  it('shows the DEV badge, the cash note and the pause toggle; the stubs stay off until the sim has them', () => {
    const h = devHtml(night, true);
    expect(h).toContain('>DEV<');
    expect(h).toContain('Cash stays topped up');
    expect(h).toContain('Pause night timer');
    expect(h).toMatch(/data-act="fillStock" disabled/);
    expect(devInput('fillStock', 'p1')).toBeNull();
    expect(devHtml({ ...night, paused: true }, true)).toContain('Start the night timer again');
  });
});
