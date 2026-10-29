import { describe, expect, it } from 'vitest';
import { PATROL, flashOn, flickerDarkness, inspectorLine, patrolAt } from './eventsModel';

describe('event visuals model', () => {
  it('flickers the lights: dark most of the time, with blinks, nothing before it starts', () => {
    expect(flickerDarkness(-1)).toBe(0);
    const samples = Array.from({ length: 140 }, (_, i) => flickerDarkness(0.5 + i / 14));
    expect(Math.max(...samples)).toBeLessThanOrEqual(0.62);
    expect(samples.filter((d) => d >= 0.5).length).toBeGreaterThan(100);
    expect(samples.some((d) => d < 0.3)).toBe(true);
    expect(flickerDarkness(2.25)).toBe(flickerDarkness(2.25));
  });

  it('flashes the influencer camera briefly and regularly', () => {
    const on = Array.from({ length: 480 }, (_, i) => flashOn(i / 60)).filter(Boolean).length;
    expect(on).toBeGreaterThan(10);
    expect(on).toBeLessThan(60);
    expect(flashOn(0)).toBe(true);
    expect(flashOn(0.8)).toBe(false);
  });

  it('walks the inspector round the patrol, pausing at each stop', () => {
    expect(patrolAt(0)).toMatchObject({ pos: PATROL[0], stopped: true, stop: 0 });
    const mid = patrolAt(1.4 + 0.5);
    expect(mid.stopped).toBe(false);
    expect(mid.pos.x).toBeGreaterThan(PATROL[0].x);
    // always on the work floor
    for (let t = 0; t < 60; t += 0.37) {
      const p = patrolAt(t).pos;
      expect(p.x).toBeGreaterThanOrEqual(2);
      expect(p.x).toBeLessThanOrEqual(10);
      expect(p.y).toBeGreaterThanOrEqual(2.5);
      expect(p.y).toBeLessThanOrEqual(4.9);
    }
  });

  it('tuts at messes, otherwise mutters', () => {
    expect(inspectorLine(2, 0, true)).toBe('Tsk tsk.');
    expect(inspectorLine(0, 0, false)).toBe('Hmm.');
    expect(inspectorLine(1, 1, false)).not.toBe('Tsk tsk.');
  });
});
