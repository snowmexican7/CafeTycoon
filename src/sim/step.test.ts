import { describe, it, expect } from 'vitest';
import { LAYOUT } from '../data/layout';
import { scenarioById } from '../data/scenarios';
import { computeModifiers } from './effects';
import { createRun } from './run';
import { scoreRun, summarizeRun } from './score';
import { step } from './step';
import type { GameState, PlayerInput } from './types';

const opts = { seed: 11, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }] };
const ticks = (s: GameState, n: number, inputs: PlayerInput[] = []) => {
  for (let i = 0; i < n; i++) s = step(s, i === 0 ? inputs : []);
  return s;
};

describe('step', () => {
  it('runs night -> day -> closing -> night with the right timers', () => {
    let s = createRun(opts);
    s = ticks(s, 60 * 60);
    expect(s.phase).toBe('day');
    expect(s.day).toBe(1);
    expect(s.morningNotes[0]).toBe(scenarioById[s.scenario].note);
    s = ticks(s, 150 * 60);
    expect(s.phase).toBe('closing');
    s = ticks(s, 10 * 60);
    expect(s.phase).toBe('night');
    expect(s.day).toBe(2);
    expect(s.days).toHaveLength(1);
    expect(s.days[0].rent).toBe(25);
    expect(s.hand).toHaveLength(5);
  });

  it('closing clears stations and hands, pays rent, moves reputation, and can bankrupt', () => {
    let s = createRun(opts);
    s = ticks(s, 60 * 60);
    s.players[0].holding = 'latte';
    s.stations[1].output = 'espresso';
    s.today = { ...s.today, served: 7, lost: 3 };
    s.cash = 30;
    s.phase = 'closing';
    s.phaseTicksLeft = 1;
    s = step(s, []);
    expect(s.cash).toBe(5);
    expect(s.reputation).toBe(2.7);
    expect(s.players[0].holding).toBeNull();
    expect(s.stations[1].output).toBeNull();
    expect(s.phase).toBe('night');
    s.today = { ...s.today, served: 1, lost: 9 };
    s.phase = 'closing';
    s.phaseTicksLeft = 1;
    s = step(s, []);
    expect(s.reputation).toBe(2.5);
    expect(s.cash).toBe(-20);
    expect(s.phase).toBe('ended');
    expect(s.bankrupt).toBe(true);
  });

  it('reaches weekEnd after day 7 and continues into unlimited mode', () => {
    let s = createRun(opts);
    s.cash = 10000;
    for (let d = 1; d <= 7; d++) {
      s = ticks(s, 60 * 60);
      s = ticks(s, 160 * 60);
    }
    expect(s.phase).toBe('weekEnd');
    expect(s.days).toHaveLength(7);
    expect(scoreRun(s)).toBeCloseTo(s.cash - 100);
    expect(step(s, [{ kind: 'weekEnd', playerId: 'p2', choice: 'stop' }]).phase).toBe('weekEnd'); // not the host
    s = step(s, [{ kind: 'weekEnd', playerId: 'p1', choice: 'continue' }]);
    expect(s.phase).toBe('night');
    expect(s.day).toBe(8);
    expect(s.unlimited).toBe(true);
    s = ticks(s, 60 * 60);
    s = ticks(s, 160 * 60);
    expect(s.days[7].rent).toBeCloseTo(31.25);
    expect(s.phase).toBe('night');
    expect(step(s, [{ kind: 'weekEnd', playerId: 'p1', choice: 'stop' }]).phase).toBe('night'); // ignored outside weekEnd
  });

  it('is deterministic and JSON-safe mid-run', () => {
    // Review Focus 4
    const script = (s: GameState) => {
      s = ticks(s, 60 * 60);
      s = ticks(s, 30, [{ kind: 'move', playerId: 'p1', x: 1, y: 0, interact: false }]);
      return ticks(s, 100 * 60);
    };
    const a = script(createRun(opts));
    const b = script(createRun(opts));
    expect(a).toEqual(b);
    const c = JSON.parse(JSON.stringify(a)) as GameState;
    expect(step(c, [])).toEqual(step(a, []));
    expect(script(createRun({ ...opts, seed: 12 }))).not.toEqual(a);
  });

  it('handles join and leave mid-day', () => {
    // Review Focus 4
    let s = createRun(opts);
    s = ticks(s, 60 * 60);
    s.players[1].holding = 'latte';
    s = step(s, [
      { kind: 'leave', playerId: 'p2' },
      { kind: 'join', playerId: 'p3', name: 'Jo' },
    ]);
    expect(s.players[1].connected).toBe(false);
    expect(s.players[1].holding).toBeNull();
    expect(s.players[2]).toMatchObject({ id: 'p3', name: 'Jo', pos: LAYOUT.door, holding: null, connected: true });
    s = ticks(s, 10);
    expect(s.players).toHaveLength(3);
    s = step(s, [{ kind: 'join', playerId: 'p2', name: 'S' }]);
    expect(s.players[1].connected).toBe(true);
    expect(s.players).toHaveLength(3);
  });

  it('applies a pace change immediately to new customers only', () => {
    // Review Focus 5
    let s = createRun(opts);
    s.scenario = 'normal'; // seed 11 rolls rainyWeek, which also scales patience
    s = ticks(s, 60 * 60);
    s.customers = [{ id: 1, drink: 'espresso', patienceLeft: 1500, patienceMax: 1500 }];
    s = step(s, [{ kind: 'settings', playerId: 'p1', settings: { pace: 5 } }]);
    expect(s.settings.pace).toBe(5);
    expect(s.customers[0].patienceMax).toBe(1500);
    expect(computeModifiers(s).patience).toBeCloseTo(0.7);
    expect(step(s, [{ kind: 'settings', playerId: 'p2', settings: { pace: 1 } }]).settings.pace).toBe(5); // not the host
  });

  it('summarizes a run', () => {
    const s = createRun(opts);
    s.owned = [{ itemId: 'streetSign', effects: [] }];
    s.days = [s.today];
    s.cash = 140;
    expect(summarizeRun(s, '2026-10-28')).toEqual({
      date: '2026-10-28',
      seed: 11,
      scenario: s.scenario,
      players: ['K', 'S'],
      daysCompleted: 1,
      score: 40,
      itemsBought: ['streetSign'],
    });
  });
});

describe('input validation', () => {
  const day = () => ticks(createRun(opts), 60 * 60);
  it('clamps settings into range and ignores non-numbers', () => {
    let s = step(day(), [{ kind: 'settings', playerId: 'p1', settings: { pace: 9 as never } }]);
    expect(s.settings.pace).toBe(5);
    s = step(s, [{ kind: 'settings', playerId: 'p1', settings: { pace: NaN as never } }]);
    expect(s.settings.pace).toBe(5);
    s = step(s, [{ kind: 'settings', playerId: 'p1', settings: { dayLengthSec: 5, nightLengthSec: 10_000 } }]);
    expect(s.settings.dayLengthSec).toBe(30);
    expect(s.settings.nightLengthSec).toBe(600);
    expect(Number.isFinite(computeModifiers(s).traffic)).toBe(true);
  });
  it('rejects malformed restock and move inputs', () => {
    let s = createRun(opts);
    for (const packs of [NaN, 0, -1, 1.5, Infinity]) {
      s = step(s, [{ kind: 'restock', playerId: 'p1', supply: 'beans', packs }]);
    }
    expect(s.cash).toBe(100);
    expect(s.supplies.beans).toBe(20);
    s = step(day(), [{ kind: 'move', playerId: 'p1', x: NaN, y: 5, interact: 'yes' as never }]);
    expect(s.players[0].moveDir).toEqual({ x: 0, y: 1 });
    expect(s.players[0].interactQueued).toBe(false);
  });
});
