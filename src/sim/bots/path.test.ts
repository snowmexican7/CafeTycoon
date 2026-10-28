import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../../data/economy';
import { createRun, startDay } from '../run';
import type { Vec2 } from '../types';
import { findPath, idleNode, isWalkable, nodeOf, targetNodes } from './path';

const s = startDay(createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } }));
const pairs = (xs: Vec2[]): [Vec2, Vec2][] => xs.slice(1).map((b, i) => [xs[i], b]);

describe('bot pathfinding', () => {
  it('station target nodes only reach the intended station', () => {
    const nodes = (id: string) => targetNodes(s, s.stations.find((x) => x.id === id)!, { x: 6, y: 4 }).map((n) => `${n.x},${n.y}`).sort();
    expect(nodes('grinder')).toEqual(['1,2', '2,1']);
    expect(nodes('espresso')).toEqual(['3,2', '4,1']);
    expect(nodes('steamer')).toEqual(['5,2', '6,1']);
    expect(nodes('coldBrewTap')).toEqual(['7,1', '8,2', '9,1']);
    expect(nodes('trash')).toEqual(['10,2', '11,1']);
    expect(nodes('counter')).toEqual(['5,6', '6,5', '7,6']);
  });

  it('sorts target nodes by distance from the caller, ties lower y then lower x', () => {
    const counter = s.stations.find((x) => x.id === 'counter')!;
    expect(targetNodes(s, counter, { x: 6, y: 4 })).toEqual([{ x: 6, y: 5 }, { x: 5, y: 6 }, { x: 7, y: 6 }]);
  });

  it('finds a 4-neighbour path through walkable nodes', () => {
    const path = findPath(s, { x: 6, y: 4 }, { x: 1, y: 2 })!;
    expect(path.at(-1)).toEqual({ x: 1, y: 2 });
    expect(path.length).toBe(7); // Manhattan distance (6,4)→(1,2); row y=2 is open
    for (const [a, b] of pairs([{ x: 6, y: 4 }, ...path])) expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
    expect(path.every((n) => isWalkable(s, n))).toBe(true);
  });

  it('starts from the nearest node when off-grid, and returns [] when already there', () => {
    expect(findPath(s, { x: 6.4, y: 4 }, { x: 6, y: 5 })).toEqual([{ x: 6, y: 4 }, { x: 6, y: 5 }]);
    expect(findPath(s, { x: 6, y: 5 }, { x: 6, y: 5 })).toEqual([]);
  });

  it('returns null for an unwalkable goal', () => {
    expect(findPath(s, { x: 6, y: 4 }, { x: 3, y: 1 })).toBeNull();
  });

  it('is deterministic for the same inputs', () => {
    expect(findPath(s, { x: 11, y: 7 }, { x: 1, y: 2 })).toEqual(findPath(s, { x: 11, y: 7 }, { x: 1, y: 2 }));
  });

  it('nodeOf picks the nearest walkable node, ties lower y then lower x', () => {
    expect(nodeOf(s, { x: 6.4, y: 4 })).toEqual({ x: 6, y: 4 });
    expect(nodeOf(s, { x: 6.5, y: 4.5 })).toEqual({ x: 6, y: 4 });
    expect(nodeOf(s, { x: 0.4, y: 0.4 })).toEqual({ x: 2, y: 1 }); // (1,1) is the grinder; (2,1) and (1,2) tie
  });

  it('idleNode is near the counter on the barista side and yields to other players', () => {
    const counter = s.stations.find((x) => x.id === 'counter')!;
    const self = { ...s.players[0], pos: { x: 6, y: 4 } };
    expect(idleNode(s, self)).toEqual({ x: 6, y: 4 });
    const other = { ...s.players[0], id: 'p2', pos: { x: 6, y: 4 }, connected: true };
    const crowded = { ...s, players: [self, other] };
    const n = idleNode(crowded, self);
    expect(Math.hypot(n.x - 6, n.y - 4)).toBeGreaterThan(ECONOMY.bots.yieldRadius);
    expect(n.y).toBeLessThanOrEqual(counter.pos.y);
    expect(Math.hypot(n.x - counter.pos.x, n.y - counter.pos.y)).toBeLessThanOrEqual(2);
    const away = { ...crowded, players: [self, { ...other, connected: false }] };
    expect(idleNode(away, self)).toEqual({ x: 6, y: 4 });
  });
});
