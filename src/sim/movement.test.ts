import { describe, it, expect } from 'vitest';
import { applyMovement, nearestStation } from './movement';
import { createRun } from './run';

const base = () => {
  const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
  s.players[0].pos = { x: 6, y: 4 };
  return s;
};

describe('movement', () => {
  it('moves at 4 tiles per second along a normalised direction', () => {
    const s = base();
    s.players[0].moveDir = { x: 1, y: 1 };
    const t = applyMovement(s, 1);
    expect(t.players[0].pos.x).toBeCloseTo(6 + 4 / 60 / Math.SQRT2);
    expect(t.players[0].pos.y).toBeCloseTo(4 + 4 / 60 / Math.SQRT2);
    const w = base();
    w.players[0].moveDir = { x: 1, y: 1 };
    expect(applyMovement(w, 1.15).players[0].pos.x).toBeCloseTo(6 + 4.6 / 60 / Math.SQRT2);
  });

  it('stops at walls and station tiles, per axis', () => {
    const s = base();
    s.players[0].pos = { x: 0.36, y: 4 };
    s.players[0].moveDir = { x: -1, y: 0 };
    expect(applyMovement(s, 1).players[0].pos.x).toBeCloseTo(0.36);
    const u = base();
    u.players[0].pos = { x: 3, y: 1.86 }; // just below the espresso machine at (3,1)
    u.players[0].moveDir = { x: 1, y: -1 };
    const v = applyMovement(u, 1);
    expect(v.players[0].pos.y).toBeCloseTo(1.86);
    expect(v.players[0].pos.x).toBeGreaterThan(3);
  });

  it('finds the nearest station within range only', () => {
    const s = base();
    expect(nearestStation(s, { x: 3, y: 2 })!.id).toBe('espresso');
    expect(nearestStation(s, { x: 6, y: 4 })).toBeNull();
    expect(nearestStation(s, { x: 6, y: 5.05 })!.id).toBe('counter');
  });
});
