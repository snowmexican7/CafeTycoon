import { describe, it, expect } from 'vitest';
import { createRun } from './run';
import { ECONOMY } from '../data/economy';
import { LAYOUT } from '../data/layout';

const opts = { seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'Ken' }, { id: 'p2', name: 'Sam' }] };

describe('createRun', () => {
  it('starts on the first night with spec values', () => {
    const s = createRun(opts);
    expect(s.phase).toBe('night');
    expect(s.day).toBe(1);
    expect(s.cash).toBe(100);
    expect(s.startingCash).toBe(100);
    expect(s.reputation).toBe(2.5);
    expect(s.supplies).toEqual({ beans: 20, milk: 10, concentrate: 15 });
    expect(s.phaseTicksLeft).toBe(60 * 60);
    expect(s.settings).toEqual({ dayLengthSec: 150, nightLengthSec: 60, pace: 3 });
    expect(s.stations.map((st) => st.kind)).toEqual(['grinder', 'espresso', 'steamer', 'coldBrewTap', 'trash', 'counter']);
    expect(s.players.map((p) => p.pos)).toEqual(LAYOUT.spawnPoints.slice(0, 2));
    expect(s.players.every((p) => p.holding === null && p.connected && !p.interactQueued)).toBe(true);
    expect(ECONOMY.scoredWeekDays).toBe(7);
  });

  it('is JSON-safe and deterministic per seed', () => {
    const a = createRun(opts);
    const b = createRun(opts);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(a).toEqual(b);
    expect(createRun({ ...opts, seed: 2 }).rng).not.toBe(a.rng);
  });

  it('honours settings overrides', () => {
    const s = createRun({ ...opts, settings: { pace: 5, nightLengthSec: 30 } });
    expect(s.settings.pace).toBe(5);
    expect(s.phaseTicksLeft).toBe(30 * 60);
  });
});
