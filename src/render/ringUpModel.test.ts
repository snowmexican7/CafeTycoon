import { describe, expect, it } from 'vitest';
import { createRun, startDay } from '../sim/run';
import { gearStart } from '../sim/gear';
import { secondsToTicks } from '../sim/constants';
import { TILL } from '../sim/till';
import { ringBar, ringBarLabel, tillPos } from './ringUpModel';
import type { GameState } from '../sim/types';

function gearDay(): GameState {
  let s = createRun({ seed: 9, hostId: 'p1', players: [{ id: 'p1', name: 'Ana' }], settings: { bots: 0 } });
  s = startDay(s);
  s.phase = 'day';
  s.gear = true;
  gearStart(s);
  s.customers = [{ id: 901, drink: 'latte', patienceLeft: 900, patienceMax: 1200 }];
  return s;
}

describe('ringUpModel', () => {
  it('is null with no ring under way', () => {
    expect(ringBar(gearDay())).toBeNull();
  });

  it('reads progress and till pos while a person rings', () => {
    const s = gearDay();
    const till = tillPos(s);
    s.ringUp = { customer: 901, by: 'p1', startedAt: s.tick, ticks: secondsToTicks(TILL.ring.register as number) };
    s.tick = s.ringUp.startedAt + Math.floor(s.ringUp.ticks / 2);
    const bar = ringBar(s)!;
    expect(bar.self).toBe(false);
    expect(bar.progress).toBeGreaterThan(0.4);
    expect(bar.progress).toBeLessThan(0.6);
    expect(bar.pos).toEqual(till);
    expect(ringBarLabel(false)).toBe('Ringing…');
  });

  it('marks a self-order beat when by is empty', () => {
    const s = gearDay();
    s.checkout = { owned: ['register', 'kiosk', 'squarely'], active: 'squarely' };
    s.ringUp = { customer: 901, by: '', startedAt: s.tick, ticks: secondsToTicks(TILL.selfBeat) };
    const bar = ringBar(s)!;
    expect(bar.self).toBe(true);
    expect(bar.progress).toBe(0);
    expect(ringBarLabel(true)).toBe('Ordering…');
  });
});
