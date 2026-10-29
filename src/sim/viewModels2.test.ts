import { describe, it, expect } from 'vitest';
import { hudStructureKey, hudViewModel, nightViewModel, receiptViewModel, type HudVM } from '../ui/viewModels';
import { createRun, startDay } from './run';

describe('hud pass', () => {
  it('hud lists the pass and keys it without seconds', () => {
    const s = startDay(createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } }));
    s.pass = [{ item: 'latte', ticksLeft: 125 }];
    expect(hudViewModel(s).pass).toEqual([{ item: 'latte', secondsLeft: 3 }]);
    const key = hudStructureKey(hudViewModel(s));
    s.pass[0].ticksLeft = 60;
    expect(hudStructureKey(hudViewModel(s))).toBe(key);
    s.pass.push({ item: 'espresso', ticksLeft: 60 });
    expect(hudStructureKey(hudViewModel(s))).not.toBe(key);
  });
});

describe('hud chaos', () => {
  it('hud key ignores per-tick chaos values', () => {
    const s = startDay(createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } }));
    const make = (o: { amount?: number; cleanliness?: number; secondsLeft?: number; rogueX?: number; kind?: 'spill' | 'grounds'; heldBy?: string | null; stage?: 'walking' | 'waiting' } = {}): HudVM => ({
      ...hudViewModel(s),
      messes: [{ id: 1, kind: o.kind ?? 'spill', x: 3, y: 4, amount: o.amount ?? 1 }],
      cleanliness: o.cleanliness ?? 90,
      mop: { x: 11, y: 7, heldBy: o.heldBy ?? null },
      stuns: [{ playerId: 'p1', secondsLeft: o.secondsLeft ?? 3 }],
      rogue: { stage: o.stage ?? 'walking', drink: 'latte', x: o.rogueX ?? 6, y: 7, secondsLeft: o.secondsLeft ?? 0 },
    });
    const key = hudStructureKey(make());
    expect(hudStructureKey(make({ amount: 0.5, cleanliness: 40, secondsLeft: 9, rogueX: 8 }))).toBe(key);
    expect(hudStructureKey(make({ kind: 'grounds' }))).not.toBe(key);
    expect(hudStructureKey(make({ heldBy: 'p1' }))).not.toBe(key);
    expect(hudStructureKey(make({ stage: 'waiting' }))).not.toBe(key);
  });
});

describe('night menu vm', () => {
  it('lists the menu switches in fixed order', () => {
    const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
    s.menu.latte = false;
    expect(nightViewModel(s, 'p1').menu).toEqual([
      { drink: 'espresso', on: true },
      { drink: 'latte', on: false },
      { drink: 'coldBrew', on: true },
    ]);
  });
});

describe('hud events', () => {
  it('lists active events and keys them without seconds', () => {
    const s = startDay(createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } }));
    s.events = [{ kind: 'rushHour', ticksLeft: 61 }];
    expect(hudViewModel(s).events).toEqual([{ kind: 'rushHour', label: 'Rush hour', secondsLeft: 2 }]);
    const key = hudStructureKey(hudViewModel(s));
    s.events[0].ticksLeft = 30;
    expect(hudStructureKey(hudViewModel(s))).toBe(key);
    s.events.push({ kind: 'powerFlicker', ticksLeft: 30 });
    expect(hudStructureKey(hudViewModel(s))).not.toBe(key);
  });
});

describe('receipt vm', () => {
  it('gives zeros for a phase-1 day', () => {
    expect(receiptViewModel({ day: 1, served: 3, lost: 1, turnedAway: 0, sales: 10, tips: 1, rent: 5 })).toEqual({
      wasted: 0,
      fines: '$0.00',
      bonus: '$0.00',
      inspection: null,
      events: [],
      botMistakes: 0,
      lostRegulars: 0,
      drinks: [
        { drink: 'espresso', count: 0 },
        { drink: 'latte', count: 0 },
        { drink: 'coldBrew', count: 0 },
      ],
    });
  });

  it('maps every field of a full day', () => {
    expect(
      receiptViewModel({
        day: 2, served: 3, lost: 1, turnedAway: 0, sales: 10, tips: 1, rent: 5,
        wasted: 4, fines: 15, bonus: 25.5, botMistakes: 2, lostRegulars: 1, inspection: 'fail',
        events: ['rushHour', 'healthInspector'], drinks: { espresso: 1, latte: 2, coldBrew: 0 },
      }),
    ).toEqual({
      wasted: 4,
      fines: '$15.00',
      bonus: '$25.50',
      inspection: 'fail',
      events: ['Rush hour', 'Health inspector'],
      botMistakes: 2,
      lostRegulars: 1,
      drinks: [
        { drink: 'espresso', count: 1 },
        { drink: 'latte', count: 2 },
        { drink: 'coldBrew', count: 0 },
      ],
    });
  });
});
