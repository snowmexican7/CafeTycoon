import { ECONOMY } from '../data/economy';
import { floorWidth } from './growth';
import { secondsToTicks } from './constants';
import { isOut } from './espresso';
import { ownTile, placeMess, spillHeld } from './floor';
import { emitLog } from './log';
import { blocked } from './movement';
import { rngNext } from './rng';
import { tally } from './tally';
import type { GameState, Player, Vec2 } from './types';

const B = ECONOMY.bump;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Moving people who are on the floor: connected and not wheeled out by the espresso egg. */
function isBody(p: Player): boolean {
  return p.connected && !isOut(p);
}

/** True when `from` is walking at least partly toward `to`. */
function headingToward(from: Player, to: Player): boolean {
  const { x, y } = from.moveDir;
  if (x === 0 && y === 0) return false;
  return x * (to.pos.x - from.pos.x) + y * (to.pos.y - from.pos.y) > 0;
}

/** Shove `p` by `d` axis by axis, only into positions walls and stations allow. */
function nudge(state: GameState, p: Player, d: Vec2): void {
  const w = floorWidth(state);
  const next = { x: p.pos.x + d.x, y: p.pos.y };
  if (!blocked(next, state.stations, w)) p.pos.x = next.x;
  next.x = p.pos.x;
  next.y = p.pos.y + d.y;
  if (!blocked(next, state.stations, w)) p.pos.y = next.y;
}

/** A bump may knock what `p` carries to the floor. Rolls only for a carrier, so a bump between empty hands draws no RNG. */
function maybeSpill(state: GameState, p: Player): void {
  const item = p.holding;
  if (item === null) return;
  if (rngNext(state) >= B.spillChance) return;
  let spilled: boolean;
  if (item === 'grounds') {
    spilled = placeMess(state, 'grounds', ownTile(state, p));
    if (spilled) p.holding = null;
  } else {
    spilled = spillHeld(state, p);
  }
  if (!spilled) return;
  tally(state.today, 'bumpSpills');
  emitLog(state, 'bump.spill', { by: p.id, item, x: round2(p.pos.x), y: round2(p.pos.y) });
}

/**
 * Overcooked-style collisions. Counts the stagger and cooldown down, then for each pair of baristas (array order) that are
 * touching, off cooldown and walking into each other: both stagger, both are shoved apart, and each carrier rolls to drop
 * what they hold. A pair that merely overlaps without anyone walking toward the other is not a bump.
 */
export function stepBumps(state: GameState): void {
  for (const p of state.players) {
    if ((p.staggerTicksLeft ?? 0) > 0) p.staggerTicksLeft = (p.staggerTicksLeft as number) - 1;
    if ((p.bumpCooldown ?? 0) > 0) p.bumpCooldown = (p.bumpCooldown as number) - 1;
  }
  const ps = state.players;
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i];
    if (!isBody(a)) continue;
    for (let j = i + 1; j < ps.length; j++) {
      const b = ps[j];
      if (!isBody(b)) continue;
      if ((a.bumpCooldown ?? 0) > 0 || (b.bumpCooldown ?? 0) > 0) continue;
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= B.bodyTiles) continue;
      if (!headingToward(a, b) && !headingToward(b, a)) continue;
      const stagger = secondsToTicks(B.staggerSeconds);
      const cooldown = secondsToTicks(B.cooldownSeconds);
      a.staggerTicksLeft = b.staggerTicksLeft = stagger;
      a.bumpCooldown = b.bumpCooldown = cooldown;
      const mid = { x: round2((a.pos.x + b.pos.x) / 2), y: round2((a.pos.y + b.pos.y) / 2) };
      const ux = dx / dist;
      const uy = dy / dist;
      nudge(state, a, { x: -ux * B.push, y: -uy * B.push });
      nudge(state, b, { x: ux * B.push, y: uy * B.push });
      tally(state.today, 'bumps');
      emitLog(state, 'bump', { a: a.id, b: b.id, x: mid.x, y: mid.y });
      maybeSpill(state, a);
      maybeSpill(state, b);
    }
  }
}
