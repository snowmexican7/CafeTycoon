import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { facingOf } from './tiles';
import type { GameState, PlayerInput } from './types';

function chaosCafe(): GameState {
  const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 600 } });
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  return startDay(s);
}

const p1 = (s: GameState) => s.players.find((p) => p.id === 'p1')!;

describe('tiles', () => {
  it('facing is 4-way from the dominant axis, ties vertical', () => {
    expect(facingOf({ x: 1, y: 0.3 })).toEqual({ x: 1, y: 0 });
    expect(facingOf({ x: -0.02, y: 0 })).toEqual({ x: -1, y: 0 });
    expect(facingOf({ x: 0.5, y: -0.5 })).toEqual({ x: 0, y: -1 });
  });

  it('one tick of movement sets facing and the tile', () => {
    let s = chaosCafe();
    p1(s).pos = { x: 6.45, y: 4 };
    s = step(s, [{ kind: 'move', playerId: 'p1', x: 1, y: 0, interact: false }]);
    expect(p1(s).facing).toEqual({ x: 1, y: 0 });
    expect(p1(s).tile).toEqual({ x: 7, y: 4 });
    s = step(s, [{ kind: 'move', playerId: 'p1', x: 0, y: 0, interact: false }]);
    expect(p1(s).facing).toEqual({ x: 1, y: 0 });
  });

  it('stunned players ignore inputs for exactly the stun, then a held key resumes', () => {
    let s = chaosCafe();
    p1(s).stunTicksLeft = 3;
    const start = { ...p1(s).pos };
    const inputs: PlayerInput[] = [
      { kind: 'move', playerId: 'p1', x: 1, y: 0, interact: true },
      { kind: 'drop', playerId: 'p1' },
    ];
    for (let i = 0; i < 3; i++) {
      s = step(s, inputs);
      expect(p1(s).pos).toEqual(start);
      expect(p1(s).interactQueued).toBe(false);
      expect(p1(s).dropQueued).toBe(false);
    }
    s = step(s, []);
    expect(p1(s).pos.x).toBeGreaterThan(start.x);
  });
});
