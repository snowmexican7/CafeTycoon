import { describe, it, expect } from 'vitest';
import { hudStructureKey, hudViewModel, nightViewModel } from '../ui/viewModels';
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
