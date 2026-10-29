import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { resolveDrops } from './drop';
import type { GameState, Vec2 } from './types';

function chaosCafe(): GameState {
  const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 600 } });
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  return startDay(s);
}

const p1 = (s: GameState) => s.players.find((p) => p.id === 'p1')!;
const station = (s: GameState, id: string) => s.stations.find((st) => st.id === id)!;
const drop = (s: GameState) => step(s, [{ kind: 'drop', playerId: 'p1' }]);

function face(s: GameState, dir: Vec2): GameState {
  s = step(s, [{ kind: 'move', playerId: 'p1', x: dir.x, y: dir.y, interact: false }]);
  return step(s, [{ kind: 'move', playerId: 'p1', x: 0, y: 0, interact: false }]);
}

describe('drop key', () => {
  it('drop at an idle empty station places the item', () => {
    let s = chaosCafe();
    p1(s).pos = { x: 3, y: 2 };
    p1(s).holding = 'grounds';
    s = drop(s);
    expect(station(s, 'espresso').output).toBe('grounds');
    expect(p1(s).holding).toBeNull();
  });

  it('drop at a busy or full station does nothing', () => {
    let s = chaosCafe();
    p1(s).pos = { x: 3, y: 2 };
    p1(s).holding = 'grounds';
    station(s, 'espresso').busyTicksLeft = 5;
    s = drop(s);
    expect(p1(s).holding).toBe('grounds');
    expect(station(s, 'espresso').output).toBeNull();
    expect(s.messes).toEqual([]);

    s = chaosCafe();
    p1(s).pos = { x: 3, y: 2 };
    p1(s).holding = 'grounds';
    station(s, 'espresso').output = 'espresso';
    s = drop(s);
    expect(p1(s).holding).toBe('grounds');
    expect(station(s, 'espresso').output).toBe('espresso');
    expect(s.messes).toEqual([]);
  });

  it('drop at the counter puts a drink on the pass, grounds stay in hand', () => {
    const s = chaosCafe();
    p1(s).pos = { x: 6, y: 5 };
    p1(s).holding = 'latte';
    p1(s).dropQueued = true;
    resolveDrops(s);
    expect(s.pass).toEqual([{ item: 'latte', ticksLeft: 3600 }]);
    expect(p1(s).holding).toBeNull();

    const g = chaosCafe();
    p1(g).pos = { x: 6, y: 5 };
    p1(g).holding = 'grounds';
    p1(g).dropQueued = true;
    resolveDrops(g);
    expect(g.pass).toEqual([]);
    expect(p1(g).holding).toBe('grounds');
    expect(g.messes).toEqual([]);
  });

  it('drop at the trash bins and counts drink waste', () => {
    let s = chaosCafe();
    p1(s).pos = { x: 10, y: 2 };
    p1(s).holding = 'latte';
    expect(s.today.wasted ?? 0).toBe(0);
    s = drop(s);
    expect(p1(s).holding).toBeNull();
    expect(s.today.wasted).toBe(1);
    expect(s.log.some((e) => e.kind === 'drop' && e.data.item === 'latte' && e.data.station === 'trash')).toBe(true);
    p1(s).holding = 'grounds';
    s = drop(s);
    expect(p1(s).holding).toBeNull();
    expect(s.today.wasted).toBe(1);
    expect(s.messes).toEqual([]);
  });

  it('a drop onto a station or the pass is logged', () => {
    let s = chaosCafe();
    p1(s).pos = { x: 3, y: 2 };
    p1(s).holding = 'grounds';
    s = drop(s);
    p1(s).pos = { x: 6, y: 5 };
    p1(s).holding = 'latte';
    s = drop(s);
    expect(s.log.filter((e) => e.kind === 'drop').map((e) => e.data)).toEqual([
      { item: 'grounds', station: 'espresso', by: 'p1' },
      { item: 'latte', station: 'counter', by: 'p1' },
    ]);
  });

  it('floor drop lands on the tile in front', () => {
    let s = chaosCafe();
    p1(s).pos = { x: 6, y: 4 };
    s = face(s, { x: -1, y: 0 });
    p1(s).holding = 'espresso';
    s = drop(s);
    expect(s.messes).toEqual([{ id: 1, kind: 'spill', x: 5, y: 4, amount: 1 }]);
    expect(s.today.wasted).toBe(1);
    expect(p1(s).holding).toBeNull();
    expect(s.log.some((e) => e.kind === 'drop' && e.data.item === 'espresso' && e.data.x === 5 && e.data.y === 4)).toBe(true);
  });

  it('facing a station square or off the floor drops on the own tile', () => {
    let s = chaosCafe();
    p1(s).pos = { x: 3, y: 2.45 };
    p1(s).facing = { x: 0, y: -1 };
    p1(s).holding = 'grounds';
    s = drop(s);
    expect(s.messes).toEqual([{ id: 1, kind: 'grounds', x: 3, y: 2, amount: 1 }]);
    expect(p1(s).holding).toBeNull();

    s = chaosCafe();
    p1(s).pos = { x: 1, y: 7 };
    p1(s).facing = { x: -1, y: 0 };
    p1(s).holding = 'grounds';
    s = drop(s);
    expect(s.messes).toEqual([{ id: 1, kind: 'grounds', x: 1, y: 7, amount: 1 }]);
  });

  it('merging and one-mess-per-tile', () => {
    let s = chaosCafe();
    p1(s).pos = { x: 6, y: 4 };
    s = face(s, { x: -1, y: 0 });
    p1(s).holding = 'grounds';
    s = drop(s);
    p1(s).holding = 'grounds';
    s = drop(s);
    expect(s.messes).toEqual([{ id: 1, kind: 'grounds', x: 5, y: 4, amount: 1 }]);

    // A spill dropped on a grounds pile turns it into a spill with the same id.
    s.messes[0].amount = 0.25;
    p1(s).holding = 'latte';
    s = drop(s);
    expect(s.messes).toEqual([{ id: 1, kind: 'spill', x: 5, y: 4, amount: 0.75 }]);

    // Grounds dropped on a spill are absorbed: it stays a spill.
    p1(s).holding = 'grounds';
    s = drop(s);
    expect(s.messes).toEqual([{ id: 1, kind: 'spill', x: 5, y: 4, amount: 1 }]);
    expect(s.nextMessId).toBe(2);
  });

  // Review Focus 1
  it('nothing drops at the cap', () => {
    let s = chaosCafe();
    p1(s).pos = { x: 6, y: 4 };
    s = face(s, { x: -1, y: 0 });
    for (let x = 1; x <= 11; x++) s.messes.push({ id: s.nextMessId++, kind: 'grounds', x, y: 7, amount: 1 });
    s.messes.push({ id: s.nextMessId++, kind: 'grounds', x: 1, y: 6, amount: 1 });
    expect(s.messes.length).toBe(12);
    const before = structuredClone(s.messes);
    p1(s).holding = 'latte';
    s = drop(s);
    expect(p1(s).holding).toBe('latte');
    expect(s.today.wasted ?? 0).toBe(0);
    expect(s.messes).toEqual(before);
    expect(s.log.some((e) => e.kind === 'drop')).toBe(false);
  });
});
