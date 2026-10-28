import { ECONOMY } from '../../data/economy';
import { LAYOUT } from '../../data/layout';
import { blocked, nearestStation } from '../movement';
import type { GameState, Player, Station, Vec2 } from '../types';

const key = (n: Vec2): string => `${n.x},${n.y}`;
const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
const manhattan = (a: Vec2, b: Vec2): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const NEIGHBOURS: Vec2[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

/** True for an integer tile centre inside the floor that a barista can stand on. */
export function isWalkable(state: GameState, node: Vec2): boolean {
  if (!Number.isInteger(node.x) || !Number.isInteger(node.y)) return false;
  if (node.x < 1 || node.y < 1 || node.x > LAYOUT.width - 1 || node.y > LAYOUT.height - 1) return false;
  return !blocked(node, state.stations);
}

/** Every walkable node, in row-major order (y, then x). */
function walkableNodes(state: GameState): Vec2[] {
  const out: Vec2[] = [];
  for (let y = 1; y <= LAYOUT.height - 1; y++) {
    for (let x = 1; x <= LAYOUT.width - 1; x++) if (isWalkable(state, { x, y })) out.push({ x, y });
  }
  return out;
}

/** Nodes sorted by distance to `from`, ties lower y then lower x. */
function byDistance(nodes: Vec2[], from: Vec2): Vec2[] {
  return nodes
    .map((n) => ({ n, d: dist(n, from) }))
    .sort((a, b) => a.d - b.d || a.n.y - b.n.y || a.n.x - b.n.x)
    .map((e) => e.n);
}

/** The nearest walkable node to `pos`; ties lower y, then lower x. */
export function nodeOf(state: GameState, pos: Vec2): Vec2 {
  return byDistance(walkableNodes(state), pos)[0];
}

interface OpenEntry {
  node: Vec2;
  g: number;
  h: number;
  order: number;
}

/**
 * A* over walkable tile centres (4-neighbour, unit steps, Manhattan heuristic).
 * Returns the nodes to visit after the start node (the start is prepended only when `from` is
 * farther than arriveRadius from it), [] when already at the goal, null when unreachable.
 */
export function findPath(state: GameState, from: Vec2, to: Vec2): Vec2[] | null {
  if (!isWalkable(state, to)) return null;
  const start = nodeOf(state, from);
  const goalKey = key(to);
  const open = new Map<string, OpenEntry>([[key(start), { node: start, g: 0, h: manhattan(start, to), order: 0 }]]);
  const cameFrom = new Map<string, Vec2>();
  const closed = new Set<string>();
  let counter = 1;

  for (;;) {
    let cur: OpenEntry | null = null;
    for (const e of open.values()) {
      if (
        cur === null ||
        e.g + e.h < cur.g + cur.h ||
        (e.g + e.h === cur.g + cur.h && (e.h < cur.h || (e.h === cur.h && e.order < cur.order)))
      ) {
        cur = e;
      }
    }
    if (cur === null) return null;
    const curKey = key(cur.node);

    if (curKey === goalKey) {
      const nodes: Vec2[] = [];
      let k = curKey;
      let n: Vec2 = cur.node;
      while (k !== key(start)) {
        nodes.unshift(n);
        n = cameFrom.get(k)!;
        k = key(n);
      }
      if (dist(from, start) > ECONOMY.bots.arriveRadius) nodes.unshift(start);
      return nodes;
    }

    open.delete(curKey);
    closed.add(curKey);
    for (const d of NEIGHBOURS) {
      const nb = { x: cur.node.x + d.x, y: cur.node.y + d.y };
      const nk = key(nb);
      if (!isWalkable(state, nb) || closed.has(nk)) continue;
      const g2 = cur.g + 1;
      const existing = open.get(nk);
      if (!existing || g2 < existing.g) {
        open.set(nk, { node: nb, g: g2, h: manhattan(nb, to), order: counter++ });
        cameFrom.set(nk, cur.node);
      }
    }
  }
}

/** Walkable nodes from which `station` is the one a barista would interact with, nearest to `from` first. */
export function targetNodes(state: GameState, station: Station, from: Vec2): Vec2[] {
  const candidates = walkableNodes(state).filter(
    (n) =>
      dist(n, station.pos) <= ECONOMY.interactRangeTiles &&
      nearestStation(state, n)?.id === station.id &&
      (station.kind !== 'counter' || n.y <= station.pos.y),
  );
  return byDistance(candidates, from);
}

/** A free node on the barista side within 2 tiles of the counter, nearest to `self`; else self's own node. */
export function idleNode(state: GameState, self: Player): Vec2 {
  const counter = state.stations.find((s) => s.kind === 'counter');
  if (counter) {
    const others = state.players.filter((p) => p.id !== self.id && p.connected);
    const free = walkableNodes(state).filter(
      (n) =>
        dist(n, counter.pos) <= 2 &&
        n.y <= counter.pos.y &&
        others.every((p) => dist(p.pos, n) > ECONOMY.bots.yieldRadius),
    );
    if (free.length > 0) return byDistance(free, self.pos)[0];
  }
  return nodeOf(state, self.pos);
}
