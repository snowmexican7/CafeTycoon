import { describe, expect, it } from 'vitest';
import { fakeAudioContext } from './fakeAudio';
import { composeDay, composeNight, foldTail, loopSeconds, normalize, renderScore } from './music';

describe('music', () => {
  it('composes the same loops every time, inside their length', () => {
    for (const compose of [composeDay, composeNight]) {
      const a = compose();
      expect(compose()).toEqual(a);
      expect(a.notes.length).toBeGreaterThan(50);
      for (const n of a.notes) {
        expect(n.beat).toBeGreaterThanOrEqual(0);
        expect(n.beat).toBeLessThan(a.beats);
        expect(n.vel).toBeGreaterThan(0);
        expect(n.vel).toBeLessThanOrEqual(1);
        if (n.inst === 'ep' || n.inst === 'vibe' || n.inst === 'bass') {
          expect(n.midi).toBeGreaterThanOrEqual(28);
          expect(n.midi).toBeLessThanOrEqual(96);
        }
      }
    }
    const day = composeDay();
    const night = composeNight();
    expect(day.bpm).toBeGreaterThan(night.bpm); // the night is calmer
    expect(night.notes.some((n) => n.inst === 'kick')).toBe(false);
    expect(loopSeconds(day)).toBeGreaterThan(30);
  });

  it('folds the tail onto the start so the loop has no seam', () => {
    const { ctx } = fakeAudioContext();
    const r = ctx.createBuffer(1, 10, 8000);
    r.getChannelData(0).set([1, 1, 1, 1, 1, 1, 1, 1, 0.5, 0.25]);
    const out = foldTail(ctx as unknown as BaseAudioContext, r as unknown as AudioBuffer, 8);
    expect(Array.from(out.getChannelData(0))).toEqual([1.5, 1.25, 1, 1, 1, 1, 1, 1]);
  });

  it('normalizes loudness without clipping', () => {
    const { ctx } = fakeAudioContext();
    const b = ctx.createBuffer(1, 4, 8000);
    b.getChannelData(0).set([0.01, -0.01, 0.01, -0.01]);
    normalize(b as unknown as AudioBuffer, 0.1);
    expect(b.getChannelData(0)[0]).toBeCloseTo(0.1);
    b.getChannelData(0).set([0.5, 0, 0, 0]);
    normalize(b as unknown as AudioBuffer, 1);
    expect(b.getChannelData(0)[0]).toBeCloseTo(0.9);
  });

  it('renders through an offline context into a buffer exactly one loop long', async () => {
    const fake = fakeAudioContext(1000);
    let asked = 0;
    const offline = (channels: number, length: number, rate: number) => {
      asked = length;
      return Object.assign(fake.ctx, { startRendering: async () => fake.ctx.createBuffer(channels, length, rate) }) as unknown as OfflineAudioContext;
    };
    const score = composeNight();
    const buf = await renderScore(score, offline, 1000);
    expect(buf.length).toBe(Math.round(loopSeconds(score) * 1000));
    expect(asked).toBeGreaterThan(buf.length);
  });
});
