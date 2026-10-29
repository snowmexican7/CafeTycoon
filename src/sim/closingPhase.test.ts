import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../data/economy';
import { secondsToTicks } from './constants';
import { LOG_KEEP_TICKS } from './log';
import { createRun, startDay } from './run';
import { step } from './step';
import type { GameState, PlayerInput } from './types';

const fresh = (players = [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }]) => {
  const s = createRun({ seed: 5, hostId: 'p1', players, settings: { bots: 0 } });
  s.scenario = 'normal';
  startDay(s);
  return s;
};
/** Fast-forward to the last tick of the open day. */
const lastOpenTick = (s: GameState) => {
  s.phaseTicksLeft = 1;
  return s;
};
const customer = (id: number) => ({ id, drink: 'espresso' as const, patienceLeft: 1e6, patienceMax: 1e6 });

describe('closing: doors lock, customers inside finish', () => {
  it('locks the doors at 0:00 and lets the queue wait it out', () => {
    let s = lastOpenTick(fresh());
    s.customers = [customer(500), customer(501)];
    s = step(s, []);
    expect(s.phase).toBe('closing');
    expect(s.phaseTicksLeft).toBe(secondsToTicks(ECONOMY.closingGraceSeconds));
    for (let i = 0; i < 600; i++) {
      s = step(s, []);
      expect(s.customers.map((c) => c.id)).toEqual([500, 501]); // no new arrivals, nobody kicked out yet
    }
    expect(s.phase).toBe('closing');
  });

  it('a customer served during closing counts, and an empty shop ends the day early', () => {
    let s = lastOpenTick(fresh());
    s.customers = [customer(600)];
    s = step(s, []);
    expect(s.phase).toBe('closing');
    for (let i = 0; i < 120; i++) s = step(s, []);
    // stand in for a served customer: the queue empties
    s.customers = [];
    const served = s.today.served;
    s = step(s, []);
    expect(s.phase).toBe('night');
    expect(s.days.at(-1)!.lost).toBe(0);
    expect(s.days.at(-1)!.served).toBe(served);
  });

  it('holds the closing beat for at least closingMinSeconds even when the shop is empty', () => {
    let s = lastOpenTick(fresh());
    s.customers = [];
    s = step(s, []);
    expect(s.phase).toBe('closing');
    let n = 0;
    while (s.phase === 'closing') {
      s = step(s, []);
      n++;
    }
    expect(s.phase).toBe('night');
    expect(n).toBe(secondsToTicks(ECONOMY.closingMinSeconds));
  });

  it('leftovers storm out when the grace runs out', () => {
    let s = lastOpenTick(fresh());
    s.customers = [customer(700), customer(701), customer(702)];
    s = step(s, []);
    for (let i = 0; i < secondsToTicks(ECONOMY.closingGraceSeconds) - 1; i++) s = step(s, []);
    expect(s.phase).toBe('closing');
    s = step(s, []);
    expect(s.phase).toBe('night');
    expect(s.days.at(-1)!.lost).toBe(3);
  });

  it('a rogue still inside keeps the shop open', () => {
    let s = lastOpenTick(fresh());
    s.customers = [];
    s = step(s, []);
    s.rogue = { customerId: 9, drink: 'latte', stage: 'making', pos: { x: 5, y: 3 }, path: [], station: 'steamer', ticksLeft: 600, waitTicks: 0 };
    const st = s.stations.find((x) => x.id === 'steamer')!;
    st.occupiedBy = 9;
    st.busyTicksLeft = 600;
    for (let i = 0; i < secondsToTicks(ECONOMY.closingMinSeconds) * 3; i++) s = step(s, []);
    expect(s.rogue).not.toBeNull();
    expect(s.phase).toBe('closing');
  });

  it('the pre-closing grace is tunable and at least 30 s by default', () => {
    expect(ECONOMY.closingGraceSeconds).toBeGreaterThanOrEqual(30);
    expect(ECONOMY.closingMinSeconds).toBeLessThan(ECONOMY.closingGraceSeconds);
  });
});

describe('log pruning', () => {
  it('keeps the event log to the last LOG_KEEP_TICKS ticks, every tick', () => {
    let s = fresh();
    for (let i = 0; i < 1500; i++) {
      s = step(s, []);
      for (const e of s.log) expect(s.tick - e.tick).toBeLessThanOrEqual(LOG_KEEP_TICKS);
    }
    expect(s.nextLogSeq).toBeGreaterThan(0);
  });
});

describe('room cap', () => {
  const four = [1, 2, 3, 4].map((i) => ({ id: `p${i}`, name: `P${i}` }));
  it('ignores a fifth human join, but still lets a known seat reconnect', () => {
    let s = fresh(four);
    s = step(s, [{ kind: 'join', playerId: 'p5', name: 'Five' } as PlayerInput]);
    expect(s.players.filter((p) => !p.bot).map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    s = step(s, [{ kind: 'leave', playerId: 'p3' } as PlayerInput]);
    expect(s.players.find((p) => p.id === 'p3')!.connected).toBe(false);
    s = step(s, [{ kind: 'join', playerId: 'p3', name: 'P3' } as PlayerInput]);
    expect(s.players.find((p) => p.id === 'p3')!.connected).toBe(true);
  });
});
