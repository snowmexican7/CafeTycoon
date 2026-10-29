import { describe, it, expect } from 'vitest';
import { closeEarlyState } from './closeEarly';
import { createRun, startDay, startNight } from './run';
import { secondsToTicks } from './constants';
import { step } from './step';
import { migrateSnapshot } from '../storage/snapshotStore';
import { validateInput } from './validate';
import { ECONOMY } from '../data/economy';
import type { GameState, PlayerInput } from './types';

const two = () => {
  const s = createRun({
    seed: 5,
    hostId: 'p1',
    players: [
      { id: 'p1', name: 'A' },
      { id: 'p2', name: 'B' },
    ],
    settings: { bots: 0 },
  });
  s.scenario = 'normal';
  return startDay(s);
};
const solo = () => {
  const s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'A' }], settings: { bots: 0 } });
  s.scenario = 'normal';
  return startDay(s);
};
const vote = (playerId: string, on = true): PlayerInput => ({ kind: 'closeEarly', playerId, on });
/** Step with no input until `seconds` of the day have run. */
const advance = (s: GameState, seconds: number): GameState => {
  const target = secondsToTicks(s.settings.dayLengthSec) - secondsToTicks(seconds);
  while (s.phase === 'day' && s.phaseTicksLeft > target) s = step(s, []);
  return s;
};

describe('closeEarly input', () => {
  it('validates the shape', () => {
    expect(validateInput(vote('p1'))).toEqual(vote('p1'));
    expect(validateInput({ kind: 'closeEarly', playerId: 'p1' } as unknown as PlayerInput)).toBeNull();
    expect(validateInput({ kind: 'closeEarly', playerId: 'p1', on: 'yes' } as unknown as PlayerInput)).toBeNull();
  });

  it('ignores a vote in the first 15 seconds', () => {
    let s = advance(two(), 14);
    s = step(s, [vote('p1')]);
    expect(s.closeVotes).toBeUndefined();
    expect(closeEarlyState(s).open).toBe(false);
  });

  it('ignores a vote at night', () => {
    let s = startNight(two());
    s = step(s, [vote('p1')]);
    expect(s.closeVotes).toBeUndefined();
  });

  it('never counts a bot', () => {
    const b = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'A' }], settings: { bots: 1 } });
    b.scenario = 'normal';
    let s = advance(startDay(b), 16);
    const botId = s.players.find((p) => p.bot)!.id;
    s = step(s, [vote(botId)]);
    expect(s.closeVotes).toBeUndefined();
    expect(closeEarlyState(s).needed).toBe(1);
  });

  it('one of two votes leaves the day open; both close it', () => {
    let s = advance(two(), 20);
    s = step(s, [vote('p1')]);
    expect(s.phase).toBe('day');
    expect(closeEarlyState(s)).toMatchObject({ votes: 1, needed: 2, voted: ['p1'], open: true });
    const before = s.phaseTicksLeft;
    s = step(s, [vote('p2')]);
    expect(s.phase).toBe('closing');
    expect(s.phaseTicksLeft).toBe(secondsToTicks(ECONOMY.closingGraceSeconds));
    const left = Math.round((before - 1) / 60);
    expect(s.today.closedEarly).toBe(left);
    const entry = s.log.find((e) => e.kind === 'closedEarly')!;
    expect(entry.data).toEqual({ votes: 2, left });
  });

  it('a solo player closes on one vote', () => {
    let s = advance(solo(), 16);
    s = step(s, [vote('p1')]);
    expect(s.phase).toBe('closing');
    expect(s.today.closedEarly).toBeGreaterThan(0);
  });

  it('on:false withdraws', () => {
    let s = advance(two(), 16);
    s = step(s, [vote('p1')]);
    s = step(s, [vote('p1', false)]);
    expect(s.closeVotes).toBeUndefined();
    expect(closeEarlyState(s).votes).toBe(0);
    s = step(s, [vote('p2')]);
    expect(s.phase).toBe('day');
  });

  it('votes reset at the next startDay and startNight', () => {
    let s = advance(two(), 16);
    s = step(s, [vote('p1')]);
    expect(s.closeVotes).toEqual(['p1']);
    expect(startNight(structuredClone(s)).closeVotes).toBeUndefined();
    expect(startDay(structuredClone(s)).closeVotes).toBeUndefined();
  });

  it('a voter whose partner leaves still closes the shop on the next tick', () => {
    let s = advance(two(), 16);
    s = step(s, [vote('p1')]);
    expect(s.phase).toBe('day');
    s = step(s, [{ kind: 'leave', playerId: 'p2' }]);
    expect(s.phase).toBe('closing');
  });

  it('a leaving voter takes their vote with them', () => {
    let s = advance(two(), 16);
    s = step(s, [vote('p2')]);
    s = step(s, [{ kind: 'leave', playerId: 'p2' }]);
    expect(s.closeVotes).toBeUndefined();
    expect(s.phase).toBe('day');
  });

  it('does not close with nobody connected', () => {
    let s = advance(solo(), 16);
    s = step(s, [{ kind: 'leave', playerId: 'p1' }]);
    for (let i = 0; i < 10; i++) s = step(s, []);
    expect(s.phase).toBe('day');
  });

  it('closes into a normal finishDay: the closing grace then the next night', () => {
    let s = advance(solo(), 16);
    s = step(s, [vote('p1')]);
    for (let i = 0; i < secondsToTicks(ECONOMY.closingGraceSeconds) + 5 && s.phase === 'closing'; i++) s = step(s, []);
    expect(s.phase).not.toBe('closing');
    expect(s.days.at(-1)?.closedEarly).toBeGreaterThan(0);
  });

  it('morning note after an early close', () => {
    let s = advance(solo(), 16);
    s = step(s, [vote('p1')]);
    const left = s.today.closedEarly!;
    while (s.phase === 'closing') s = step(s, []);
    const next = startDay(s);
    const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    expect(next.morningNotes).toContain(`You closed early yesterday with ${mm} still on the clock.`);
  });
});

describe('closeEarlyState hint', () => {
  it("is 'soldOut' with zero supplies and the menu on", () => {
    const s = advance(solo(), 16);
    s.supplies = { beans: 0, milk: 0, concentrate: 0, flavour: 0, pastry: 0 };
    expect(closeEarlyState(s).hint).toBe('soldOut');
  });

  it("is 'empty' once the queue has sat empty for 10 s, and null with someone queued", () => {
    let s = solo();
    s.supplies = { beans: 0, milk: 0, concentrate: 0, flavour: 0, pastry: 0 }; // nobody can spawn
    s = step(s, []);
    expect(s.emptySince).toBe(s.tick);
    s.supplies = { ...ECONOMY.startingSupplies };
    expect(closeEarlyState(s).hint).toBeNull(); // just emptied
    s.tick = s.emptySince! + secondsToTicks(10) - 1;
    expect(closeEarlyState(s).hint).toBeNull();
    s.tick += 1;
    expect(closeEarlyState(s).hint).toBe('empty');
    s.customers = [{ id: 99, drink: 'espresso', patienceLeft: 1000, patienceMax: 1000 }];
    expect(closeEarlyState(s).hint).toBeNull();
    s = step(s, []);
    expect(s.emptySince).toBeUndefined();
  });

  it("is 'empty' at once when nothing is on the menu", () => {
    const s = solo();
    for (const d of Object.keys(s.menu)) s.menu[d as keyof GameState['menu']] = false;
    expect(closeEarlyState(s).hint).toBe('empty');
  });

  it("'soldOut' wins over 'empty'", () => {
    const s = solo();
    s.supplies = { beans: 0, milk: 0, concentrate: 0, flavour: 0, pastry: 0 };
    s.emptySince = 0;
    s.tick = 10_000;
    expect(closeEarlyState(s).hint).toBe('soldOut');
  });
});

describe('closeEarly determinism', () => {
  const run900 = (s: GameState) => {
    for (let i = 0; i < 900; i++) s = step(s, []);
    return s;
  };

  it('a run with no vote keeps the RNG stream of the base commit and carries no closeVotes', () => {
    const s = run900(two());
    // golden measured on e503518 (before FB1): seed 5, p1+p2, bots 0, scenario normal, 900 ticks after startDay
    expect(s.rng).toBe(1798888878);
    expect(s.closeVotes).toBeUndefined();
  });

  it('keeps the base RNG stream with a bot on the floor', () => {
    const b = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'A' }], settings: { bots: 1 } });
    b.scenario = 'normal';
    // golden measured on e503518: seed 5, p1 + one bot, scenario normal, 900 ticks after startDay
    expect(run900(startDay(b)).rng).toBe(-1928183945);
  });
});

describe('snapshot migration 22 to 23', () => {
  it('gives today and every past day soldOutWalkouts 0', () => {
    const old = two();
    old.days = [{ ...old.today, day: 0 }];
    delete old.today.soldOutWalkouts;
    delete old.days[0]!.soldOutWalkouts;
    const s = migrateSnapshot(22, old)!;
    expect(s.today.soldOutWalkouts).toBe(0);
    expect(s.days[0]!.soldOutWalkouts).toBe(0);
  });

  it('keeps counts that are already there', () => {
    const old = two();
    old.today.soldOutWalkouts = 4;
    expect(migrateSnapshot(22, old)!.today.soldOutWalkouts).toBe(4);
  });
});
