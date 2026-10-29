import type { GameState, Player, Vec2 } from './types';

/** The floor tile a position stands on: tiles are integer centres, like stations. */
export function tileOf(pos: Vec2): Vec2 {
  return { x: Math.round(pos.x), y: Math.round(pos.y) };
}

/** 4-way facing from the dominant axis of a non-zero direction; ties go vertical. */
export function facingOf(dir: Vec2): Vec2 {
  return Math.abs(dir.y) >= Math.abs(dir.x) ? { x: 0, y: Math.sign(dir.y) } : { x: Math.sign(dir.x), y: 0 };
}

/** The tile in front of a player. */
export function tileAhead(p: Player): Vec2 {
  return tileOf({ x: p.pos.x + p.facing.x, y: p.pos.y + p.facing.y });
}

/** Default floor fields for a new barista standing at `pos`. */
export function floorFields(
  pos: Vec2,
): Pick<Player, 'facing' | 'heldDir' | 'stunTicksLeft' | 'tool' | 'cleaningTicksLeft' | 'cleaningMess' | 'dropQueued' | 'tile'> {
  return {
    facing: { x: 0, y: 1 },
    heldDir: { x: 0, y: 0 },
    stunTicksLeft: 0,
    tool: null,
    cleaningTicksLeft: 0,
    cleaningMess: null,
    dropQueued: false,
    tile: tileOf(pos),
  };
}

/** Day end or leaving: no stun, no cleaning, no tool, no queued drop. */
export function clearFloorFields(p: Player): void {
  p.stunTicksLeft = 0;
  p.cleaningTicksLeft = 0;
  p.cleaningMess = null;
  p.tool = null;
  p.dropQueued = false;
}

/** Update facing and tiles after movement; returns the players who entered a new tile this tick. */
export function trackTiles(state: GameState): Player[] {
  const entered: Player[] = [];
  for (const p of state.players) {
    if (!p.connected || p.stunTicksLeft > 0) continue;
    if (p.moveDir.x !== 0 || p.moveDir.y !== 0) p.facing = facingOf(p.moveDir);
    const t = tileOf(p.pos);
    if (t.x !== p.tile.x || t.y !== p.tile.y) {
      p.tile = t;
      entered.push(p);
    }
  }
  return entered;
}

/**
 * A stunned player loses this tick's movement, interact and drop; the stun counts down.
 * Otherwise a connected person moves along the key they hold (bots pick their own moveDir).
 */
export function stepStuns(state: GameState): void {
  for (const p of state.players) {
    if (p.stunTicksLeft > 0) {
      p.stunTicksLeft -= 1;
      p.moveDir = { x: 0, y: 0 };
      p.interactQueued = false;
      p.dropQueued = false;
    } else if (!p.bot && p.connected) {
      const held = p.heldDir ?? { x: 0, y: 0 };
      p.moveDir = { ...held };
    }
  }
}
