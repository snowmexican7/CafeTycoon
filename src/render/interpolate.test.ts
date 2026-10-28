import { describe, it, expect } from 'vitest';
import { createRun } from '../sim/run';
import type { GameState } from '../sim/types';
import { interpolateView } from './interpolate';

describe('interpolateView', () => {
  it('lerps barista positions and snaps new players', () => {
    const a = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
    const b = JSON.parse(JSON.stringify(a)) as GameState;
    b.players[0].pos = { x: 7, y: 4 };
    b.players.push({ ...b.players[0], id: 'p2', pos: { x: 1, y: 6 } });
    const v = interpolateView(a, b, 0.5);
    expect(v.baristaPositions.p1).toEqual({ x: 6.5, y: 4 });
    expect(v.baristaPositions.p2).toEqual({ x: 1, y: 6 });
    expect(interpolateView(null, b, 0.3).baristaPositions.p1).toEqual({ x: 7, y: 4 });
    expect(interpolateView(a, b, 2).baristaPositions.p1).toEqual({ x: 7, y: 4 });
    expect(v.state).toBe(b);
  });
});
