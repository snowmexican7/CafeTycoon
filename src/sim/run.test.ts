import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
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
    expect(s.supplies).toEqual({ beans: 20, milk: 10, concentrate: 15, flavour: 0, pastry: 0 });
    expect(s.unlocked).toEqual(['espresso', 'latte', 'coldBrew']);
    expect(s.phaseTicksLeft).toBe(ECONOMY.nightLengthSec * 60);
    expect(s.settings).toEqual({ dayLengthSec: 150, nightLengthSec: 120, pace: 3, bots: 'auto', botSkill: 3 });
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

  it('starts phase 2 state empty', () => {
    const s = createRun(opts);
    expect(s.pass).toEqual([]);
    expect(s.menu).toMatchObject({ espresso: true, latte: true, coldBrew: true });
    expect([s.eventSchedule, s.events, s.regulars, s.log]).toEqual([[], [], [], []]);
    expect(s.today).toMatchObject({ wasted: 0, fines: 0, bonus: 0, botMistakes: 0, lostRegulars: 0, inspection: null, events: [], drinks: { espresso: 0, latte: 0, coldBrew: 0 } });
    expect(s.players.every((p) => p.idleTicks === 0 && p.bot === undefined)).toBe(true);
  });

  it('starts chaos state clean', () => {
    const s = startDay(createRun(opts));
    expect([s.messes, s.cleanliness, s.mop, s.rogue, s.nextMessId]).toEqual([[], 100, { pos: { x: 11, y: 7 }, heldBy: null }, null, 1]);
    expect(s.today.rogues).toBe(0);
    expect(s.stations.every((st) => st.occupiedBy === null)).toBe(true);
    expect(s.players[0]).toMatchObject({ facing: { x: 0, y: 1 }, heldDir: { x: 0, y: 0 }, stunTicksLeft: 0, tool: null, cleaningTicksLeft: 0, cleaningMess: null, dropQueued: false, tile: { x: 6, y: 4 } });
  });

  it('honours settings overrides', () => {
    const s = createRun({ ...opts, settings: { pace: 5, nightLengthSec: 30 } });
    expect(s.settings.pace).toBe(5);
    expect(s.phaseTicksLeft).toBe(30 * 60);
  });
});

describe('seed quality', () => {
  it('spreads the scenario roll across small consecutive seeds', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) seen.add(createRun({ ...opts, seed }).scenario);
    expect(seen.size).toBe(4);
  });
});
