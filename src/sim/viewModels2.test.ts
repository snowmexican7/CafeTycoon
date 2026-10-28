import { describe, it, expect } from 'vitest';
import { hudStructureKey, hudViewModel } from '../ui/viewModels';
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
