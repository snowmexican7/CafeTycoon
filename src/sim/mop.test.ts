import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import type { GameState, PlayerInput, Vec2 } from './types';

function chaosCafe(): GameState {
  const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 600 } });
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  return startDay(s);
}

const p1 = (s: GameState) => s.players.find((p) => p.id === 'p1')!;
const HOME = { pos: { x: 11, y: 7 }, heldBy: null };

const still = (id = 'p1', interact = false): PlayerInput => ({ kind: 'move', playerId: id, x: 0, y: 0, interact });
const press = (s: GameState) => step(s, [still('p1', true)]);
const drop = (s: GameState) => step(s, [{ kind: 'drop', playerId: 'p1' }]);
function ticks(s: GameState, n: number): GameState {
  for (let i = 0; i < n; i++) s = step(s, [still()]);
  return s;
}

/** p1 parked at `pos` with the mop in hand. */
function withMop(s: GameState, pos: Vec2): void {
  p1(s).pos = { ...pos };
  p1(s).tool = 'mop';
  s.mop = { pos: { ...pos }, heldBy: 'p1' };
}

function addSpill(s: GameState, x: number, y: number): void {
  s.messes.push({ id: s.nextMessId++, kind: 'spill', x, y, amount: 1 });
}

const cleanLogs = (s: GameState) => s.log.filter((e) => e.kind === 'clean');

describe('the mop', () => {
  it('pick up the mop with empty hands and no station in range', () => {
    let s = chaosCafe();
    p1(s).pos = { x: 10.5, y: 7 };
    s = press(s);
    expect(p1(s).tool).toBe('mop');
    expect(s.mop.heldBy).toBe('p1');

    let g = chaosCafe();
    p1(g).pos = { x: 10.5, y: 7 };
    p1(g).holding = 'grounds';
    g = press(g);
    expect(p1(g).tool).toBeNull();
    expect(p1(g).holding).toBe('grounds');
    expect(g.mop).toEqual(HOME);
  });

  it('E with the mop cleans the nearest mess after 90 still ticks', () => {
    let s = chaosCafe();
    addSpill(s, 9, 7);
    withMop(s, { x: 10, y: 7 });
    s = press(s);
    s = ticks(s, 88);
    expect(s.messes.length).toBe(1);
    expect(cleanLogs(s)).toEqual([]);
    s = ticks(s, 1);
    expect(s.messes).toEqual([]);
    expect(cleanLogs(s).map((e) => e.data)).toEqual([{ player: 'p1', x: 9, y: 7 }]);
    expect(p1(s).cleaningTicksLeft).toBe(0);
    expect(p1(s).cleaningMess).toBeNull();
    expect(p1(s).tool).toBe('mop');
  });

  it('moving cancels the clean', () => {
    let s = chaosCafe();
    addSpill(s, 9, 7);
    withMop(s, { x: 10, y: 7 });
    s = press(s);
    expect(p1(s).cleaningTicksLeft).toBeGreaterThan(0);
    s = step(s, [{ kind: 'move', playerId: 'p1', x: 0, y: -1, interact: false }]);
    expect(p1(s).cleaningTicksLeft).toBe(0);
    expect(p1(s).cleaningMess).toBeNull();
    expect(s.messes.length).toBe(1);
  });

  it('a clean whose mess vanished is cancelled', () => {
    let s = chaosCafe();
    addSpill(s, 9, 7);
    withMop(s, { x: 10, y: 7 });
    s = press(s);
    expect(p1(s).cleaningTicksLeft).toBeGreaterThan(0);
    s.messes = []; // e.g. another mop finished it first
    s = ticks(s, 1);
    expect(p1(s).cleaningTicksLeft).toBe(0);
    expect(p1(s).cleaningMess).toBeNull();
    expect(cleanLogs(s)).toEqual([]);
  });

  it('E with the mop and no mess in range does nothing', () => {
    let s = chaosCafe();
    withMop(s, { x: 1, y: 2 });
    const beans = s.supplies.beans;
    s = press(s);
    const grinder = s.stations.find((st) => st.id === 'grinder')!;
    expect(grinder.busyTicksLeft).toBe(0);
    expect(grinder.output).toBeNull();
    expect(s.supplies.beans).toBe(beans);
    expect(p1(s).cleaningTicksLeft).toBe(0);
    expect(p1(s).tool).toBe('mop');
  });

  it('R returns the mop home from anywhere', () => {
    let s = chaosCafe();
    withMop(s, { x: 2, y: 6 });
    s = drop(s);
    expect(p1(s).tool).toBeNull();
    expect(s.mop).toEqual(HOME);
    expect(s.log.filter((e) => e.kind === 'drop').map((e) => e.data)).toEqual([{ item: 'mop', x: 11, y: 7 }]);
  });

  it('the carried mop follows its holder', () => {
    let s = chaosCafe();
    withMop(s, { x: 6, y: 4 });
    s.mop.pos = { x: 11, y: 7 };
    s = ticks(s, 1);
    expect(s.mop).toEqual({ pos: { x: 6, y: 4 }, heldBy: 'p1' });
  });

  // Review Focus 2
  it('a stun or R mid-clean cancels the channel', () => {
    let s = chaosCafe();
    addSpill(s, 9, 7);
    withMop(s, { x: 10, y: 7 });
    s = press(s);
    p1(s).stunTicksLeft = 5;
    s = ticks(s, 5);
    expect(cleanLogs(s)).toEqual([]);
    expect(s.messes.length).toBe(1);
    expect(p1(s).cleaningTicksLeft).toBe(0);
    s = press(s);
    s = ticks(s, 89);
    expect(s.messes).toEqual([]);
    expect(cleanLogs(s).length).toBe(1);

    let r = chaosCafe();
    addSpill(r, 9, 7);
    withMop(r, { x: 10, y: 7 });
    r = press(r);
    r = drop(r);
    expect(r.mop).toEqual(HOME);
    expect(p1(r).tool).toBeNull();
    expect(p1(r).cleaningTicksLeft).toBe(0);
    expect(r.messes.length).toBe(1);
  });

  it('a leaving holder sends the mop home', () => {
    let s = chaosCafe();
    withMop(s, { x: 4, y: 5 });
    s = step(s, [{ kind: 'leave', playerId: 'p1' }]);
    expect(s.mop).toEqual(HOME);
    expect(p1(s).tool).toBeNull();

    // A mop whose holder is disconnected (or missing) is free, and goes home on its own.
    let t = createRun({
      seed: 1,
      hostId: 'p1',
      players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'L' }],
      settings: { bots: 0, dayLengthSec: 600 },
    });
    t.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
    t = startDay(t);
    p1(t).connected = false;
    p1(t).tool = 'mop';
    t.mop = { pos: { x: 11, y: 7 }, heldBy: 'p1' };
    const p2 = (x: GameState) => x.players.find((p) => p.id === 'p2')!;
    p2(t).pos = { x: 10.5, y: 7 };
    t = step(t, [still('p2', true)]);
    expect(p2(t).tool).toBe('mop');
    expect(t.mop.heldBy).toBe('p2');
    expect(p1(t).tool).toBeNull();

    let u = chaosCafe();
    u.mop = { pos: { x: 3, y: 5 }, heldBy: 'ghost' };
    u = ticks(u, 1);
    expect(u.mop).toEqual(HOME);
  });

  it('a barista out cold drops the mop and the clean', () => {
    let s = chaosCafe();
    addSpill(s, 9, 7);
    withMop(s, { x: 10, y: 7 });
    s = press(s);
    p1(s).espresso = { shots: 6, boostTicksLeft: 0, mul: 1, collapsedAt: s.tick, fellAt: { x: 10, y: 7 }, out: true };
    s = ticks(s, 1);
    expect([s.mop, p1(s).tool, p1(s).cleaningTicksLeft, s.messes.length]).toEqual([HOME, null, 0, 1]);
  });

  it('cleanliness falls with messes and recovers without', () => {
    let s = chaosCafe();
    addSpill(s, 1, 7);
    addSpill(s, 2, 7);
    s = ticks(s, 200);
    expect(s.cleanliness).toBeCloseTo(99, 6);
    s.messes = [];
    s.cleanliness = 50;
    s = ticks(s, 100);
    expect(s.cleanliness).toBeCloseTo(51, 6);
    s.cleanliness = 99.5;
    for (let i = 0; i < 200; i++) {
      s = ticks(s, 1);
      expect(s.cleanliness).toBeLessThanOrEqual(100);
    }
    expect(s.cleanliness).toBeCloseTo(100, 6);
  });
});
