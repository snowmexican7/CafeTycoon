import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../data/economy';
import { createRun } from './run';
import { step } from './step';
import { crewRows, tallyStats } from './stats';
import { awardsFor, awardsText, mvpScore } from './awards';
import type { GameState, SimEvent } from './types';
import { addBots } from '../harness/crew';

const run = (seed: number, bots = 2) =>
  addBots(createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'Kennedy' }] }), bots);
const ticks = (s: GameState, n: number) => {
  for (let i = 0; i < n; i++) s = step(s, []);
  return s;
};
const log = (s: GameState, kind: string, data: SimEvent['data']) => {
  s.log.push({ seq: s.nextLogSeq++, tick: s.tick, kind, data } as SimEvent);
};

describe('crew stats', () => {
  it('counts each log entry once, for the right player', () => {
    const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }] });
    log(s, 'served', { by: 'p1', perfect: true, amount: 6.5 });
    log(s, 'served', { by: 'p2', perfect: false, amount: 4 });
    log(s, 'pass.put', { by: 'p2' });
    log(s, 'slip', { player: 'p2', item: 'latte' });
    log(s, 'clean', { player: 'p1' });
    log(s, 'espresso.shot', { by: 'p2' });
    log(s, 'egg.cat', { by: 'p1', pet: true });
    log(s, 'drop', { by: 'p2', item: 'latte', x: 3, y: 3 });
    log(s, 'drop', { by: 'p1', item: 'mop', x: 3, y: 3 });
    tallyStats(s);
    tallyStats(s); // a second pass over the same log adds nothing
    const [k, sv] = crewRows(s);
    expect(k).toMatchObject({ serves: 1, perfect: 1, earned: 6.5, mopped: 1, catPets: 1, messes: 0 });
    expect(sv).toMatchObject({ serves: 1, handoffs: 1, slips: 1, messes: 2, espressos: 1 });
  });

  it('is deterministic over a played day, and bots (crewmates, the cashier) get no rows (bot cut)', () => {
    const a = ticks(run(42), ECONOMY.nightLengthSec * 60 + 150 * 60 + 600);
    const b = ticks(run(42), ECONOMY.nightLengthSec * 60 + 150 * 60 + 600);
    expect(a.crew).toEqual(b.crew);
    expect(a.days[0]?.served ?? a.today.served).toBeGreaterThan(0); // someone served: the bots and the cashier
    const bots = new Set(a.players.filter((p) => p.bot).map((p) => p.id));
    expect(bots.size).toBeGreaterThan(0);
    expect((a.crew?.players ?? []).filter((r) => bots.has(r.id))).toEqual([]);
    expect(crewRows(a).map((r) => r.id)).toEqual(['p1']);
    expect(awardsFor(a)).toEqual(awardsFor(b));
    expect(awardsFor(a).every((x) => x.winner === 'Kennedy')).toBe(true);
  }, 30_000);
});

describe('awards', () => {
  it('gives every person an award and the MVP to a person', () => {
    const s = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }, { id: 'p3', name: 'J' }] });
    for (let i = 0; i < 5; i++) log(s, 'served', { by: 'p1', perfect: i < 3, amount: 5 });
    for (let i = 0; i < 4; i++) log(s, 'slip', { player: 'p2' });
    tallyStats(s);
    const aw = awardsFor(s);
    expect(aw[0]).toMatchObject({ id: 'mvp', winner: 'K' });
    expect(aw.find((a) => a.id === 'slip')).toMatchObject({ winner: 'S', stat: '4 slips' });
    for (const n of ['K', 'S', 'J']) expect(aw.some((a) => a.winner === n)).toBe(true);
    expect(aw.find((a) => a.winner === 'J')?.tone).toBe('joke');
    expect(awardsText(s, aw)).toContain('Crew MVP: K');
  });

  it('has no MVP when nobody did anything, but still a joke award each', () => {
    const s = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
    const aw = awardsFor(s);
    expect(aw.map((a) => a.tone)).toEqual(['joke']);
    expect(s.crew).toEqual({ seen: 0, players: [] }); // reading awards does not touch the state
  });

  it('bots are not award rows: no Best Supporting Bot, no bot winners, no bot flag (bot cut)', () => {
    const s = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
    s.players.push({ ...s.players[0]!, id: 'bot-1', name: 'Bo', bot: { personality: 'steady' } } as GameState['players'][number]);
    for (let i = 0; i < 9; i++) log(s, 'served', { by: 'bot-1', perfect: true, amount: 5 });
    for (let i = 0; i < 3; i++) log(s, 'slip', { player: 'bot-1' });
    log(s, 'served', { by: 'p1', perfect: false, amount: 4 });
    tallyStats(s);
    expect(s.crew!.players.map((r) => r.id)).toEqual(['p1']);
    const aw = awardsFor(s);
    expect(aw.map((x) => x.id)).not.toContain('bot');
    expect(aw.every((x) => x.winner === 'K')).toBe(true);
    expect(aw.every((x) => !('bot' in x))).toBe(true);
    expect(awardsText(s, aw)).not.toContain('(bot)');
  });

  it('scores the MVP on serving first', () => {
    const z = { id: 'x', name: 'x', serves: 0, perfect: 0, earned: 0, handoffs: 0, slips: 0, messes: 0, mopped: 0, espressos: 0, collapses: 0, rescues: 0, catPets: 0, campersShooed: 0, alarmsStopped: 0, binned: 0, cardsBought: 0, idle: 0 };
    expect(mvpScore({ ...z, serves: 10 })).toBeGreaterThan(mvpScore({ ...z, mopped: 10 }));
  });
});
