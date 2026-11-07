import { describe, it, expect } from 'vitest';
import { createRun, startDay } from '../sim/run';
import { addBots } from '../harness/crew';
import { CASHIER_ID } from '../sim/cashier';
import type { GameState } from '../sim/types';
import { assignSeat } from './seats';

const run = (names: string[], settings: { cashier?: boolean } = {}): GameState => {
  const players = names.map((n, i) => ({ id: i === 0 ? 'H' : `T${i}`, name: n }));
  return createRun({ seed: 1, hostId: 'H', players, settings });
};
const req = (over: Partial<Parameters<typeof assignSeat>[0]>) => ({ token: 'NEW', name: 'Zed', hostToken: 'H', state: null, live: new Set<string>(), ...over });

describe('assignSeat', () => {
  it('pre-start: a new seat while there is room; full at four', () => {
    expect(assignSeat(req({}))).toEqual({ seat: 'NEW' });
    expect(assignSeat(req({ live: new Set(['a', 'b']) }))).toEqual({ seat: 'NEW' });
    expect(assignSeat(req({ live: new Set(['a', 'b', 'c']) }))).toEqual({ reject: 'full' });
    expect(assignSeat(req({ token: 'a', live: new Set(['a', 'b', 'c']) }))).toEqual({ seat: 'a' }); // a refresh
  });

  it('a refresh keeps its own seat', () => {
    const state = run(['Host', 'Sam']);
    expect(assignSeat(req({ token: 'T1', name: 'Sam', state }))).toEqual({ seat: 'T1' });
  });

  it('a closed tab coming back reclaims its old seat by the stored token', () => {
    const state = run(['Host', 'Sam', 'Kim']);
    expect(assignSeat(req({ token: 'NEW', prev: 'T2', name: 'Whoever', state, live: new Set(['T1']) }))).toEqual({ seat: 'T2' });
  });

  it('falls back to an away seat with the same name (case-insensitive)', () => {
    const state = run(['Host', 'Sam', 'Kim']);
    expect(assignSeat(req({ name: '  kim ', state, live: new Set(['T1']) }))).toEqual({ seat: 'T2' });
  });

  it('never hands out a seat a live connection holds', () => {
    const state = run(['Host', 'Sam']);
    expect(assignSeat(req({ prev: 'T1', name: 'Sam', state, live: new Set(['T1']) }))).toEqual({ seat: 'NEW' });
    expect(assignSeat(req({ prev: 'H', name: 'Host', state }))).toEqual({ seat: 'NEW' }); // nor the host's
  });

  it('caps the run at four humans: a fifth gets the first away seat, or is turned away', () => {
    const state = run(['Host', 'A', 'B', 'C']);
    expect(assignSeat(req({ state, live: new Set(['T1', 'T2', 'T3']) }))).toEqual({ reject: 'full' });
    expect(assignSeat(req({ state, live: new Set(['T1', 'T3']) }))).toEqual({ seat: 'T2' });
  });

  it('bots never count as seats', () => {
    const state = addBots(run(['Host']), 2);
    startDay(state);
    expect(state.players.some((p) => p.bot)).toBe(true);
    expect(assignSeat(req({ prev: 'bot-1', name: 'Bo', state }))).toEqual({ seat: 'NEW' });
  });

  it("never seats anyone as the robot cashier or a test-only player, whatever their token", () => {
    const state = startDay(run(['Host'], { cashier: true }));
    expect(state.players.some((p) => p.id === CASHIER_ID)).toBe(true);
    for (const token of [CASHIER_ID, 'bot-1', 'sim-1']) {
      expect(assignSeat(req({ token }))).toEqual({ reject: 'full' }); // the pre-start lobby
      expect(assignSeat(req({ token, state }))).toEqual({ reject: 'full' }); // a started run
      expect(assignSeat(req({ token, state, live: new Set([token]) }))).toEqual({ reject: 'full' }); // not even as a "refresh"
    }
    expect(assignSeat(req({ prev: CASHIER_ID, name: 'Robot cashier', state }))).toEqual({ seat: 'NEW' }); // nor reclaimed
  });
});
