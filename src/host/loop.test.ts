import { describe, it, expect } from 'vitest';
import type { HostToClient } from '../net/transport';
import { createRun } from '../sim/run';
import { createLoop } from './loop';

const initial = () => createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });

describe('loop', () => {
  it('steps at 60 Hz from elapsed time and snapshots at 20 Hz', () => {
    const posts: HostToClient[] = [];
    const loop = createLoop(initial(), (m) => posts.push(m), 0);
    loop.advance(100);
    expect(loop.getState().tick).toBe(6);
    expect(posts).toHaveLength(1);
    expect(posts[0].sentAt).toBe(100);
    loop.advance(149);
    expect(loop.getState().tick).toBe(8);
    expect(posts).toHaveLength(1);
    loop.advance(150);
    expect(loop.getState().tick).toBe(9);
    expect(posts).toHaveLength(2);
  });

  it('caps catch-up after a long stall', () => {
    const loop = createLoop(initial(), () => {}, 0);
    loop.advance(5000);
    expect(loop.getState().tick).toBe(10);
    loop.advance(5017);
    expect(loop.getState().tick).toBe(11);
  });

  it('applies pushed inputs on the next step and snapshots on phase change', () => {
    const posts: HostToClient[] = [];
    const loop = createLoop(initial(), (m) => posts.push(m), 0);
    loop.pushInput({ kind: 'move', playerId: 'p1', x: 1, y: 0, interact: false });
    loop.advance(17);
    expect(loop.getState().players[0].moveDir).toEqual({ x: 1, y: 0 });
    loop.getState().phaseTicksLeft = 1; // force the night to end on the next tick
    const before = posts.length;
    loop.advance(34);
    expect(loop.getState().phase).toBe('day');
    expect(posts.length).toBe(before + 1);
  });
});
