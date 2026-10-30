import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import type { GameState } from './types';
import { botChoices, isBot } from './bots/roster';

const p1 = { id: 'p1', name: 'K' };
const p2 = { id: 'p2', name: 'S' };
const fast = { dayLengthSec: 30, nightLengthSec: 30 };
const solo = (settings: Partial<GameState['settings']> = {}) => createRun({ seed: 1, hostId: 'p1', players: [p1], settings: { ...fast, ...settings } });
const botIds = (s: GameState) => s.players.filter(isBot).map((p) => p.id);

/** Ready up (night) and run the day out, until the next night begins. */
function nextNight(state: GameState): GameState {
  let s = state;
  if (s.phase === 'night') s = step(s, [{ kind: 'ready', playerId: 'p1' }]);
  for (let i = 0; i < 20000 && s.phase !== 'night' && s.phase !== 'weekEnd' && s.phase !== 'ended'; i++) s = step(s, []);
  return s;
}

describe('solo bots switch', () => {
  it('a solo run with bots off has no bots on day 1 and still none on day 3', () => {
    let s = startDay(solo({ bots: 0 }));
    expect(botIds(s)).toEqual([]);
    s = nextNight(s);
    expect(s.phase).toBe('night');
    s = nextNight(s);
    s = step(s, [{ kind: 'ready', playerId: 'p1' }]);
    expect(s.phase).toBe('day');
    expect(s.day).toBeGreaterThanOrEqual(3);
    expect(botIds(s)).toEqual([]);
  });

  it('a solo auto run has two bots on day 1', () => {
    expect(botIds(startDay(solo({ bots: 'auto' })))).toEqual(['bot-1', 'bot-2']);
  });

  it('at night the host turning bots off sends them home at once', () => {
    let s = nextNight(startDay(solo()));
    expect(s.phase).toBe('night');
    expect(botIds(s)).toEqual(['bot-1', 'bot-2']);
    s = step(s, [{ kind: 'settings', playerId: 'p1', settings: { bots: 0 } }]);
    expect(s.settings.bots).toBe(0);
    expect(botIds(s)).toEqual([]);
  });

  it('at night turning bots up seats them at once, within the four-barista cap', () => {
    let s = nextNight(startDay(solo({ bots: 0 })));
    expect(s.phase).toBe('night');
    expect(botIds(s)).toEqual([]);
    s = step(s, [{ kind: 'settings', playerId: 'p1', settings: { bots: 3 } }]);
    expect(botIds(s)).toEqual(['bot-1', 'bot-2', 'bot-3']);
    expect(s.players).toHaveLength(4);
    s = step(s, [{ kind: 'settings', playerId: 'p1', settings: { bots: 9 } }]); // clamped to 3
    expect(botIds(s)).toHaveLength(3);
  });

  it('the same input from a non-host is ignored', () => {
    let s = nextNight(startDay(createRun({ seed: 1, hostId: 'p1', players: [p1, p2], settings: { ...fast, bots: 1 } })));
    expect(s.phase).toBe('night');
    expect(botIds(s)).toEqual(['bot-1']);
    s = step(s, [{ kind: 'settings', playerId: 'p2', settings: { bots: 0 } }]);
    expect(s.settings.bots).toBe(1);
    expect(botIds(s)).toEqual(['bot-1']);
  });

  it('during the day the change waits for the next morning', () => {
    let s = startDay(solo());
    s = step(s, [{ kind: 'settings', playerId: 'p1', settings: { bots: 0 } }]);
    expect(s.settings.bots).toBe(0);
    expect(botIds(s)).toEqual(['bot-1', 'bot-2']);
    s = startDay(s);
    expect(botIds(s)).toEqual([]);
  });

  it('a settings change without bots leaves the crew alone at night', () => {
    let s = nextNight(startDay(solo()));
    s = step(s, [{ kind: 'settings', playerId: 'p1', settings: { pace: 2 } }]);
    expect(botIds(s)).toEqual(['bot-1', 'bot-2']);
  });
});

describe('botChoices', () => {
  it('lists auto, off and every count up to the cap for the crew', () => {
    expect(botChoices(1)).toEqual(['auto', 0, 1, 2, 3]);
    expect(botChoices(4)).toEqual(['auto', 0]);
    expect(botChoices(2)).toEqual(['auto', 0, 1, 2]);
  });
});
