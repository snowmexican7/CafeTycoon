import { describe, expect, it } from 'vitest';
import { closeEarlyHtml, closeEarlyKey, closeEarlyLabel, type CloseEarlyVM } from './closeEarly';

const vm = (p: Partial<CloseEarlyVM> = {}): CloseEarlyVM => ({ open: true, votes: 0, needed: 1, mine: false, hint: null, nudge: null, ...p });

describe('close early button (FB1 WP3)', () => {
  it('solo: hold C, no vote count', () => {
    const h = closeEarlyHtml(vm());
    expect(h).toContain('Close early');
    expect(h).toContain('hold C');
    expect(h).not.toContain('voted');
  });
  it('co-op: shows votes/needed and lets a voter undo', () => {
    expect(closeEarlyHtml(vm({ votes: 1, needed: 3 }))).toContain('1/3 voted');
    const mine = closeEarlyHtml(vm({ votes: 2, needed: 3, mine: true }));
    expect(mine).toContain('Voted to close');
    expect(mine).toContain('2/3 voted · tap to undo');
    expect(closeEarlyLabel(vm({ votes: 2, needed: 3, mine: true }))).toMatch(/take the vote back/);
  });
  it('nudge line when sold out or empty', () => {
    expect(closeEarlyHtml(vm({ hint: 'soldOut', nudge: "You're sold out" }))).toContain('ce-nudge');
    expect(closeEarlyHtml(vm())).not.toContain('ce-nudge');
  });
  it('key changes with the vote, not otherwise', () => {
    expect(closeEarlyKey(vm())).toBe(closeEarlyKey(vm()));
    expect(closeEarlyKey(vm())).not.toBe(closeEarlyKey(vm({ votes: 1, mine: true })));
    expect(closeEarlyKey(undefined)).toBe('');
  });
});

import { createRun } from '../sim/run';
import { closeEarlyVM } from './closeEarly';

describe('closeEarlyVM', () => {
  it('opens after the gate and marks my vote', () => {
    const s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'kim' }, { id: 'p2', name: 'Sam' }] });
    s.phase = 'day';
    s.phaseTicksLeft = s.settings.dayLengthSec * 60;
    expect(closeEarlyVM(s, 'p1').open).toBe(false);
    s.phaseTicksLeft = s.settings.dayLengthSec * 60 * 0.5;
    s.closeVotes = ['p2'];
    const a = closeEarlyVM(s, 'p2');
    expect(a.open).toBe(true);
    expect(a.mine).toBe(true);
    expect(a.nudge).toBeNull();
    expect(closeEarlyVM(s, 'p1').mine).toBe(false);
  });
});
