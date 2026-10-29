import { describe, it, expect } from 'vitest';
import { hudViewModel, receiptViewModel } from '../ui/viewModels';
import { createRun, startDay } from './run';
import type { DayStats, GameState, Rogue } from './types';

const cafe = (): GameState => startDay(createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } }));
const rogue = (extra: Partial<Rogue>): Rogue => ({
  customerId: 5, drink: 'latte', stage: 'walking', pos: { x: 6.5, y: 4 }, path: [], station: 'steamer', ticksLeft: 0, waitTicks: 0, ...extra,
});

describe('rogue hud', () => {
  it('hud shows the rogue with patched seconds', () => {
    const s = cafe();
    expect(hudViewModel(s).rogue).toBeUndefined();
    expect('rogue' in hudViewModel(s)).toBe(false);
    s.rogue = rogue({ stage: 'making', ticksLeft: 61 });
    expect(hudViewModel(s).rogue).toEqual({ stage: 'making', drink: 'latte', x: 6.5, y: 4, secondsLeft: 2 });
    s.rogue = rogue({ stage: 'waiting', waitTicks: 0 });
    expect(hudViewModel(s).rogue?.secondsLeft).toBe(5);
    s.rogue = rogue({ stage: 'waiting', waitTicks: 241 });
    expect(hudViewModel(s).rogue?.secondsLeft).toBe(1);
    for (const stage of ['walking', 'leaving', 'stormingOut'] as const) {
      s.rogue = rogue({ stage, ticksLeft: 300, waitTicks: 10 });
      expect(hudViewModel(s).rogue?.secondsLeft).toBe(0);
    }
    s.rogue = rogue({ name: 'Ada' });
    expect(hudViewModel(s).rogue).toEqual({ stage: 'walking', drink: 'latte', x: 6.5, y: 4, secondsLeft: 0, name: 'Ada' });
  });
});

describe('receipt rogues', () => {
  it('receipt carries rogues', () => {
    const day: DayStats = { day: 2, served: 3, lost: 1, turnedAway: 0, sales: 10, tips: 1, rent: 5 };
    expect(receiptViewModel({ ...day, rogues: 2 }).rogues).toBe(2);
    expect(receiptViewModel(day).rogues).toBe(0);
  });
});
