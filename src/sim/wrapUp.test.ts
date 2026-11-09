import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../data/economy';
import { secondsToTicks } from './constants';
import { createRun, startDay } from './run';
import { putAwayPending } from './fridge';
import { step } from './step';
import { closingListVM } from '../ui/live';
import type { GameState } from './types';

function gearDay(): GameState {
  const s = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], tier: 'cart', gear: true });
  s.cash = 500;
  startDay(s);
  s.customers = [];
  s.phaseTicksLeft = 1;
  return s;
}

const toClosing = (s: GameState) => step(s, []);

describe('closing wrap-up', () => {
  it('an empty shop with the checklist done closes on the short beat', () => {
    let s = toClosing(gearDay());
    expect(s.phase).toBe('closing');
    s.milkOut = 0;
    s.condiments = { servings: 0 };
    s.messes = [];
    s.pass = [];
    expect(putAwayPending(s)).toBe(false);
    let n = 0;
    while (s.phase === 'closing') {
      s = step(s, []);
      n++;
    }
    expect(n).toBe(secondsToTicks(ECONOMY.closingMinSeconds));
  });

  it('milk still out holds the day for the wrap-up, then the cap ends it', () => {
    let s = toClosing(gearDay());
    s.milkOut = 4;
    expect(putAwayPending(s)).toBe(true);
    const cap = secondsToTicks(ECONOMY.closingGraceSeconds);
    for (let i = 0; i < 90; i++) s = step(s, []);
    expect(s.phase).toBe('closing');
    while (s.phase === 'closing') s = step(s, []);
    expect(s.phase).toBe('night');
    expect(s.days.at(-1)).toBeDefined();
    expect(cap).toBeGreaterThan(90);
  });

  it('customers still inside hold the wrap-up even when the checklist is done', () => {
    let s = toClosing(gearDay());
    s.customers = [{ id: 1, drink: 'espresso', patienceLeft: 1e6, patienceMax: 1e6 }];
    s.milkOut = 0;
    for (let i = 0; i < secondsToTicks(ECONOMY.closingMinSeconds) + 5; i++) s = step(s, []);
    expect(s.phase).toBe('closing');
    expect(s.customers).toHaveLength(1);
  });

  it('the checklist names what is left and the time remaining', () => {
    const s = toClosing(gearDay());
    s.milkOut = 3;
    s.phaseTicksLeft = secondsToTicks(24);
    const list = closingListVM(s)!;
    expect(list.title).toMatch(/Wrap-up · 24s/);
    expect(list.rows.some((r) => /Milk back in the fridge/.test(r.text) && !r.done)).toBe(true);
    expect(list.note).toMatch(/timer/);
  });
});
