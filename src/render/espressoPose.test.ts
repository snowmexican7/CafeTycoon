import { describe, expect, it } from 'vitest';
import { ESPRESSO } from '../sim/espresso';
import { PARK_X, collapsePose, jitterPx, shakePx } from './espressoPose';

describe('espresso gag poses', () => {
  it('falls over, ambulance pulls up, paramedics stretcher them out, then it all leaves', () => {
    const fx = 200;
    const fy = 300;
    const at = (t: number) => collapsePose(t, fx, fy);
    expect(at(0).body.rot).toBeCloseTo(0);
    expect(at(0).ambulance).toBeNull();
    expect(Math.abs(at(ESPRESSO.collapse.fall + 0.1).body.rot)).toBeGreaterThan(1.4);
    expect(at(ESPRESSO.collapse.ambulanceArrives + 0.01).ambulance!.x).toBeCloseTo(PARK_X, 0);
    expect(at(2).hearts).toBeGreaterThan(0);
    const reach = at(ESPRESSO.collapse.medicsReach + 0.1).stretcher!;
    expect(reach.loaded).toBe(false);
    expect(Math.hypot(reach.x - fx, reach.y - fy)).toBeLessThan(20);
    const carry = at(ESPRESSO.collapse.wheeledOut - 2);
    expect(carry.stretcher!.loaded).toBe(true);
    expect(carry.body.visible).toBe(true);
    const gone = at(ESPRESSO.collapse.wheeledOut + 3);
    expect(gone.body.visible).toBe(false);
    expect(gone.ambulance).toBeNull();
    expect(gone.stretcher).toBeNull();
  });

  it('jitters and shakes more as the shots add up', () => {
    expect(jitterPx(1)).toBe(0);
    expect(jitterPx(3)).toBeLessThan(jitterPx(4));
    expect(jitterPx(4)).toBeLessThan(jitterPx(5));
    const p = (shots: number) => ({ espresso: { shots, boostTicksLeft: 10, mul: 1.4, collapsedAt: null, fellAt: null, out: false } }) as never;
    expect(shakePx(p(3), null)).toBe(0);
    expect(shakePx(p(4), null)).toBeGreaterThan(0);
    expect(shakePx(p(5), null)).toBeGreaterThan(shakePx(p(4), null));
    expect(shakePx(undefined, ESPRESSO.collapse.fall)).toBeGreaterThan(0);
  });
});
