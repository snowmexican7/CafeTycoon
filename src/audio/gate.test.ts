import { describe, expect, it } from 'vitest';
import { createCueGate, CUE_RULES, MAX_VOICES } from './gate';

describe('cue gate', () => {
  it('drops repeats inside the cooldown', () => {
    const g = createCueGate({ doorBell: { cooldownMs: 1000, maxVoices: 3, priority: 1 } });
    expect(g.allow('doorBell', 0, 100)).toBe(true);
    expect(g.allow('doorBell', 500, 100)).toBe(false);
    expect(g.allow('doorBell', 1000, 100)).toBe(true);
  });

  it('caps copies of one cue that are still sounding', () => {
    const g = createCueGate({ grinder: { cooldownMs: 0, maxVoices: 2, priority: 2 } });
    expect(g.allow('grinder', 0, 3000)).toBe(true);
    expect(g.allow('grinder', 10, 3000)).toBe(true);
    expect(g.allow('grinder', 20, 3000)).toBe(false);
    expect(g.allow('grinder', 3001, 3000)).toBe(true); // the first one finished
  });

  it('caps total voices, letting a more important cue take a less important slot', () => {
    const g = createCueGate({ click: { cooldownMs: 0, maxVoices: 10, priority: 0 }, serve: { cooldownMs: 0, maxVoices: 10, priority: 3 } }, 3);
    for (let i = 0; i < 3; i++) expect(g.allow('click', i, 1000)).toBe(true);
    expect(g.allow('click', 5, 1000)).toBe(false); // full, same priority
    expect(g.active(5)).toBe(3);
    expect(g.allow('serve', 6, 1000)).toBe(true); // bumps a click
    expect(g.active(6)).toBe(3);
    for (let i = 0; i < 3; i++) g.allow('serve', 7 + i, 1000);
    expect(g.allow('click', 20, 1000)).toBe(false);
    expect(g.active(2000)).toBe(0);
  });

  it('has sane default rules', () => {
    expect(MAX_VOICES).toBeGreaterThanOrEqual(6);
    for (const r of Object.values(CUE_RULES)) {
      expect(r!.maxVoices).toBeGreaterThan(0);
      expect(r!.cooldownMs).toBeGreaterThanOrEqual(0);
    }
    // a burst of 30 customers arriving rings the door once
    const g = createCueGate();
    expect(Array.from({ length: 30 }, (_, i) => g.allow('doorBell', i * 10, 1500)).filter(Boolean)).toHaveLength(1);
    // stingers outrank station noise
    expect(CUE_RULES.rushHour!.priority).toBeGreaterThan(CUE_RULES.grinder!.priority);
  });
});
