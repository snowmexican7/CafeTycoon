import { describe, it, expect } from 'vitest';
import { catalogueById } from '../data/catalogue';
import { describeEffects, morningNotes } from './describe';
import { createRun } from './run';

describe('describe', () => {
  it('describes effects in plain words', () => {
    expect(describeEffects([{ kind: 'traffic', mul: 1.4 }, { kind: 'orderBias', drink: 'latte', mul: 2 }])).toBe(
      '+40% customers, latte orders ×2',
    );
    expect(
      describeEffects([
        { kind: 'patience', mul: 0.85 },
        { kind: 'tipRate', add: 0.1 },
        { kind: 'stationSpeed', station: 'espresso', mul: 1.3 },
      ]),
    ).toBe('-15% patience, tips +10%, espresso machine +30% faster');
    expect(describeEffects([{ kind: 'supplyCost', supply: 'beans', mul: 0.6 }, { kind: 'gamble', chance: 0.5, win: [], lose: [] }])).toBe(
      'beans 40% cheaper, a gamble',
    );
  });

  it('writes the morning notes', () => {
    const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
    s.scenario = 'rainyWeek';
    s.activeTomorrow = [{ itemId: 'instaGlamStory', effects: catalogueById.instaGlamStory.effects }];
    s.boughtTonight = ['instaGlamStory', 'streetSign'];
    s.owned = [{ itemId: 'streetSign', effects: [] }];
    expect(morningNotes(s)).toEqual([
      "Rainy week: everyone's grumpy and wants a latte.",
      'InstaGlam latte-art story is live: +40% customers, latte orders ×2',
      'Street sign installed',
    ]);
    s.day = 2;
    expect(morningNotes(s)[0]).toContain('InstaGlam');
  });
});
