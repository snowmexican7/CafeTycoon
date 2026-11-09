import { describe, expect, it } from 'vitest';
import { newlyLearned, replayCaptions, replayLength, replayScript } from './unlockReplayModel';
import { DRINK_IDS } from '../data/drinks';

describe('ui-3.10.0 new-drink unlock replay (scripted, no bot brain)', () => {
  it('Americano: grind, pull, step back, E again at the espresso machine, then serve', () => {
    const s = replayScript('americano');
    expect(s.stops).toEqual(['grinder', 'espresso', 'pickup']);
    const acts = s.steps.map((x) => `${x.stop}:${x.act}`);
    expect(acts).toEqual([
      'grinder:walk', 'grinder:press', 'grinder:wait', 'grinder:press',
      'espresso:walk', 'espresso:press', 'espresso:wait', 'espresso:press',
      'espresso:back', 'espresso:walk', 'espresso:press', 'espresso:wait', 'espresso:press',
      'pickup:walk', 'pickup:press',
    ]);
    expect(s.steps.at(-2)!.holding).toBe('americano');
    expect(s.steps.at(-1)!.holding).toBeNull();
    expect(replayCaptions(s).some((c) => /Step back/.test(c))).toBe(true);
    expect(replayCaptions(s).at(-1)).toMatch(/Pickup counter/);
  });

  it('cold milk drinks finish at the milk counter; steamed ones finish in hand', () => {
    const iced = replayScript('icedLatte');
    expect(iced.stops).toContain('supply');
    expect(replayCaptions(iced).join(' ')).toMatch(/Milk counter: E with the espresso in hand fills it at once/);
    const capp = replayScript('cappuccino');
    expect(replayCaptions(capp).join(' ')).toMatch(/in your hand/);
    const latte = replayScript('latte');
    const text = replayCaptions(latte).join(' ');
    expect(text).toMatch(/steams the milk/);
    expect(text).toMatch(/in your hand/);
    expect(text).not.toMatch(/fills the jug/);
  });

  it('every drink has a finite script that ends at pickup', () => {
    for (const d of DRINK_IDS) {
      const s = replayScript(d);
      expect(s.stops.at(-1)).toBe('pickup');
      expect(replayLength(s)).toBeGreaterThan(2);
      expect(replayLength(s)).toBeLessThan(30);
    }
  });

  it('newlyLearned lists drinks learned since the day started', () => {
    expect(newlyLearned(['espresso', 'latte'], { unlocked: ['espresso', 'latte', 'americano'] })).toEqual(['americano']);
    expect(newlyLearned(['espresso'], {} as never)).toEqual([]);
  });
});
