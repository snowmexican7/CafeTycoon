import { ECONOMY } from '../data/economy';
import { floorWidth } from './growth';
import { secondsToTicks } from './constants';
import { isOut } from './espresso';
import { ownTile, placeMess, spillHeld } from './floor';
import { emitLog } from './log';
import { noteFeedMoment } from './feed';
import { blocked } from './movement';
import { rngNext } from './rng';
import { tally } from './tally';
import { loseCustomer } from './customers';
import { customerSpots } from './customerSpots';
import { spillTray } from './tray';
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
  if (p.tool === 'tray') return spillTray(state, p); // FB2 B7: a tray spills at TRAY.spillMul × the chance
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

/** Round 5: unstick slides over about this many seconds (not a one-tick jump). */
const UNSTICK_SECONDS = 0.15;

/**
 * Round 5: ease two overlapping bodies apart along the line between them. Each tick moves a slice of the
 * remaining gap (about `UNSTICK_SECONDS` to clear), using `nudge` so walls/stations block. If one side
 * can't move, the other takes that tick's whole step.
 */
function separate(state: GameState, a: Player, b: Player): void {
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  let dist = Math.hypot(dx, dy);
  if (dist >= B.bodyTiles) return;
  // Identical centres: pick a stable axis so we still can unstick.
  const ux = dist < 1e-6 ? 1 : dx / dist;
  const uy = dist < 1e-6 ? 0 : dy / dist;
  if (dist < 1e-6) dist = 0;
  const gap = B.bodyTiles - dist;
  const perTick = B.bodyTiles / Math.max(1, secondsToTicks(UNSTICK_SECONDS));
  const step = Math.min(gap, perTick);
  const half = step / 2;
  const beforeA = { ...a.pos };
  const beforeB = { ...b.pos };
  nudge(state, a, { x: -ux * half, y: -uy * half });
  nudge(state, b, { x: ux * half, y: uy * half });
  const movedA = a.pos.x !== beforeA.x || a.pos.y !== beforeA.y;
  const movedB = b.pos.x !== beforeB.x || b.pos.y !== beforeB.y;
  if (!movedA && movedB) nudge(state, b, { x: ux * half, y: uy * half });
  else if (movedA && !movedB) nudge(state, a, { x: -ux * half, y: -uy * half });
}

/**
 * Overcooked-style collisions. Counts the stagger and cooldown down, then for each pair of baristas (array order) that are
 * touching, off cooldown and walking into each other: both stagger, both are shoved apart, and each carrier rolls to drop
 * what they hold. A pair that merely overlaps without anyone walking toward the other is not a bump.
 * Round 5: after bumps, any still-overlapping pair is separated (unstick), whether or not they bumped this tick.
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
      const ux = dist < 1e-6 ? 1 : dx / dist;
      const uy = dist < 1e-6 ? 0 : dy / dist;
      nudge(state, a, { x: -ux * B.push, y: -uy * B.push });
      nudge(state, b, { x: ux * B.push, y: uy * B.push });
      tally(state.today, 'bumps');
      emitLog(state, 'bump', { a: a.id, b: b.id, x: mid.x, y: mid.y });
      maybeSpill(state, a);
      maybeSpill(state, b);
    }
  }
  // Round 5 unstick: keep every overlapping pair at least bodyTiles apart (even on cooldown / standing still).
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i];
    if (!isBody(a)) continue;
    for (let j = i + 1; j < ps.length; j++) {
      const b = ps[j];
      if (!isBody(b)) continue;
      if (Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y) < B.bodyTiles) separate(state, a, b);
    }
  }
}

/**
 * Round 4 c: a person walking into a customer. Each customer (queue order) who is within `customerTiles` of a connected
 * person heading toward them, and is off their own cooldown, loses a slice of patience (never to zero: only the angry
 * exit ends it) and logs `customer.bump`. The `customerAngryAt`-th bump inside `customerWindowSeconds` sends them out:
 * `walkout` with reason 'bumped', counted lost like any walk-out and nothing more. Bots don't (unless the constant says).
 * Customers stand where `customerSpots` puts them. No RNG.
 */
export function stepCustomerBumps(state: GameState): void {
  if (state.customers.length === 0) return;
  const walkers = state.players.filter((p) => isBody(p) && (B.botsBumpCustomers || !p.bot) && (p.moveDir.x !== 0 || p.moveDir.y !== 0));
  if (walkers.length === 0) return;
  const spots = customerSpots(state);
  const cooldown = secondsToTicks(B.customerCooldownSeconds);
  const window = secondsToTicks(B.customerWindowSeconds);
  const gone = new Set<number>();
  state.customers.forEach((c, i) => {
    const at = spots[i];
    const last = c.bumpedAt?.[c.bumpedAt.length - 1];
    if (last !== undefined && state.tick - last < cooldown) return;
    const by = walkers.find((p) => {
      const dx = at.x - p.pos.x;
      const dy = at.y - p.pos.y;
      return Math.hypot(dx, dy) < B.customerTiles && p.moveDir.x * dx + p.moveDir.y * dy > 0;
    });
    if (!by) return;
    c.bumpedAt = [...(c.bumpedAt ?? []).filter((t) => state.tick - t < window), state.tick];
    c.patienceLeft = Math.max(1, c.patienceLeft - Math.round(B.customerPatience * c.patienceMax));
    tally(state.today, 'customerBumps');
    emitLog(state, 'customer.bump', { customer: c.id, by: by.id, x: round2(at.x), y: round2(at.y) });
    if (c.bumpedAt.length >= B.customerAngryAt) {
      gone.add(c.id);
      emitLog(state, 'walkout', { customer: c.id, reason: 'bumped', x: round2(at.x), y: round2(at.y) });
      noteFeedMoment(state, 'bump', c, c.drink); // FB2 C11
      loseCustomer(state, c);
    }
  });
  if (gone.size > 0) state.customers = state.customers.filter((c) => !gone.has(c.id));
}
