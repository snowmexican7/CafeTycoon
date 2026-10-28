import { describe, expect, it } from 'vitest';
import { createRun } from '../sim/run';
import { crewKey, handHint, handKey, hudLive, nightExtras, nightExtrasKey, ordersKey } from './live';

const run = () => createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'kim' }, { id: 'p2', name: 'Sam' }] });

describe('hud live helpers', () => {
  it('lists orders, crew and the day bar without touching the state', () => {
    const s = run();
    s.phase = 'day';
    s.phaseTicksLeft = s.settings.dayLengthSec * 60 * 0.25;
    s.customers = [
      { id: 3, drink: 'latte', patienceLeft: 10, patienceMax: 20 },
      { id: 4, drink: 'coldBrew', patienceLeft: 1, patienceMax: 20 },
    ];
    const before = JSON.stringify(s);
    const l = hudLive(s, 'p2');
    expect(JSON.stringify(s)).toBe(before);
    expect(l.progress).toBeCloseTo(0.75);
    expect(l.open).toBe(true);
    expect(l.orders).toEqual([
      { id: 3, drink: 'latte', patience: 0.5 },
      { id: 4, drink: 'coldBrew', patience: 0.05 },
    ]);
    expect(l.crew.map((c) => [c.initial, c.color, c.me])).toEqual([
      ['K', '#e0564a', false],
      ['S', '#4c8fd6', true],
    ]);
    expect(l.meName).toBe('Sam');
  });

  it('keys blocks by structure, not by per-tick patience', () => {
    const s = run();
    s.phase = 'day';
    s.customers = [{ id: 1, drink: 'espresso', patienceLeft: 18, patienceMax: 20 }];
    const a = hudLive(s, 'p1');
    s.customers[0].patienceLeft = 15;
    s.phaseTicksLeft -= 30;
    const b = hudLive(s, 'p1');
    expect(ordersKey(b)).toBe(ordersKey(a));
    expect(crewKey(b)).toBe(crewKey(a));
    expect(handKey(b)).toBe(handKey(a));
    s.customers[0].patienceLeft = 2; // turns urgent
    expect(ordersKey(hudLive(s, 'p1'))).not.toBe(ordersKey(a));
    s.players[1].connected = false;
    expect(crewKey(hudLive(s, 'p1'))).not.toBe(crewKey(a));
  });

  it('hints what E does at the nearest station', () => {
    const s = run();
    s.phase = 'day';
    const p = s.players[0];
    const grinder = s.stations.find((st) => st.kind === 'grinder')!;
    p.pos = { ...grinder.pos };
    expect(handHint(s, 'p1')).toMatchObject({ go: true, title: 'Grind beans' });
    p.holding = 'latte';
    expect(handHint(s, 'p1')).toMatchObject({ go: false, title: 'Hands full' });
    const espresso = s.stations.find((st) => st.kind === 'espresso')!;
    p.pos = { ...espresso.pos };
    p.holding = 'grounds';
    expect(handHint(s, 'p1')).toMatchObject({ go: true, title: 'Pull a shot' });
    p.holding = null;
    expect(handHint(s, 'p1').title).toBe('Needs grounds');
    p.pos = { x: -50, y: -50 };
    expect(handHint(s, 'p1')).toMatchObject({ go: false, title: 'Walk up to a station' });
    s.phase = 'night';
    expect(handHint(s, 'p1').title).toBe('');
  });
});

describe('night extras', () => {
  it('names the day, tracks bought cards and keys without the timer', () => {
    const s = run();
    s.boughtTonight = ['streetSign'];
    const n = nightExtras(s, 'p1');
    expect(n.weekday).toBe('Monday');
    expect(n.bought).toEqual([{ itemId: 'streetSign', name: 'Street sign', category: expect.any(String) }]);
    const k = nightExtrasKey(n);
    s.phaseTicksLeft -= 60;
    expect(nightExtrasKey(nightExtras(s, 'p1'))).toBe(k);
    expect(nightExtras(s, 'p1').left).toBeLessThan(n.left);
  });
});
