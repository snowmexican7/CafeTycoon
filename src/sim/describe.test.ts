import { forecastById } from '../data/forecasts';
import { describe, it, expect } from 'vitest';
import { catalogueById } from '../data/catalogue';
import { EVENT_FORESHADOW, ROGUE_REVIEW, describeEffects, morningNotes } from './describe';
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
    s.challenges = []; // B7 challenges append their own lines; pin the classic four here
    expect(morningNotes(s)).toEqual([
      "Rainy week: everyone's grumpy and wants a latte.",
      `${forecastById.opening.icon} Grand opening: ${forecastById.opening.blurb}`,
      'InstaGlam latte-art story is live: +40% customers, latte orders ×2',
      'Street sign installed',
    ]);
    s.day = 2;
    expect(morningNotes(s)[1]).toContain('InstaGlam');
  });

  it('carries the rogue review the morning after a rogue day, once', () => {
    const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
    s.day = 3;
    s.days = [{ ...s.today, rogues: 0 }];
    expect(morningNotes(s)).not.toContain(ROGUE_REVIEW);
    s.days = [{ ...s.today, rogues: 0 }, { ...s.today, rogues: 2 }];
    expect(morningNotes(s).filter((n) => n === ROGUE_REVIEW)).toHaveLength(1);
    s.days = [{ ...s.today, rogues: 2 }, { ...s.today }];
    expect(morningNotes(s)).not.toContain(ROGUE_REVIEW);
  });
});

describe('event foreshadowing (Block 2)', () => {
  it("adds a rumour for each of today's scheduled events, once per kind, without the time", () => {
    const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
    s.day = 3;
    s.eventSchedule = [
      { kind: 'healthInspector', startTick: 900 },
      { kind: 'rushHour', startTick: 2000 },
    ];
    const notes = morningNotes(s);
    expect(notes).toContain(EVENT_FORESHADOW.healthInspector);
    expect(notes).toContain(EVENT_FORESHADOW.rushHour);
    expect(notes).not.toContain(EVENT_FORESHADOW.powerFlicker);
    s.eventSchedule = [];
    expect(morningNotes(s).some((n) => Object.values(EVENT_FORESHADOW).includes(n))).toBe(false);
  });

  it('is what startDay shows when the dice drew an event', async () => {
    const { startDay } = await import('./run');
    for (let seed = 1; seed < 40; seed++) {
      let s = createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
      s.day = 2;
      s = startDay(s);
      const kinds = new Set(s.eventSchedule.map((e) => e.kind));
      expect(s.morningNotes.filter((n) => Object.values(EVENT_FORESHADOW).includes(n))).toHaveLength(kinds.size);
    }
  });
});
