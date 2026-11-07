import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { secondsToTicks } from './constants';
import { ECONOMY } from '../data/economy';
import { nearestStation } from './movement';
import { spotOf } from './pickup';
import type { GameState, ItemKind, Player } from './types';

const B = ECONOMY.bump;

function cafe(seed = 1): GameState {
  const s = createRun({
    seed,
    hostId: 'p1',
    players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'J' }],
  });
  s.scenario = 'normal';
  const d = startDay(s);
  d.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  return d;
}

const pl = (s: GameState, id: string): Player => s.players.find((p) => p.id === id)!;

/** p1 at (4, 6) facing p2 just inside `bodyTiles`, both walking into each other (open floor). */
function headOn(seed = 1, gap = B.bodyTiles - 0.1): GameState {
  const s = cafe(seed);
  const a = pl(s, 'p1');
  const b = pl(s, 'p2');
  a.pos = { x: 4, y: 6 };
  b.pos = { x: 4 + gap, y: 6 };
  a.tile = { x: 4, y: 6 };
  b.tile = { x: 4, y: 6 };
  a.heldDir = { x: 1, y: 0 };
  b.heldDir = { x: -1, y: 0 };
  return s;
}

const bumps = (s: GameState) => s.log.filter((e) => e.kind === 'bump');

describe('bumps', () => {
  it('two humans walking into each other bump once: both staggered, cooldown set, nudged apart', () => {
    let s = headOn();
    const before = pl(s, 'p2').pos.x - pl(s, 'p1').pos.x;
    s = step(s, []);
    expect(bumps(s)).toHaveLength(1);
    expect(bumps(s)[0].data).toMatchObject({ a: 'p1', b: 'p2' });
    for (const id of ['p1', 'p2']) {
      expect(pl(s, id).staggerTicksLeft).toBe(secondsToTicks(B.staggerSeconds));
      expect(pl(s, id).bumpCooldown).toBe(secondsToTicks(B.cooldownSeconds));
    }
    expect(pl(s, 'p2').pos.x - pl(s, 'p1').pos.x).toBeGreaterThan(before);
    expect(s.today.bumps).toBe(1);
  });

  it('two people overlapping but neither moving is not a bump', () => {
    let s = headOn();
    pl(s, 'p1').heldDir = { x: 0, y: 0 };
    pl(s, 'p2').heldDir = { x: 0, y: 0 };
    for (let i = 0; i < 10; i++) s = step(s, []);
    expect(bumps(s)).toHaveLength(0);
    expect(pl(s, 'p1').staggerTicksLeft ?? 0).toBe(0);
  });

  it('walking away from each other while overlapping is not a bump', () => {
    let s = headOn();
    pl(s, 'p1').heldDir = { x: -1, y: 0 };
    pl(s, 'p2').heldDir = { x: 1, y: 0 };
    s = step(s, []);
    expect(bumps(s)).toHaveLength(0);
  });

  function bumpWith(seed: number, item: ItemKind): GameState {
    const s = headOn(seed);
    pl(s, 'p1').holding = item;
    return step(s, []);
  }

  it('a bump with a latte in hand spills now and then (ECONOMY.bump.spillChance), with a puddle, a log and a tally', () => {
    let spills = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const s = bumpWith(seed, 'latte');
      const spilled = s.log.filter((e) => e.kind === 'bump.spill');
      if (spilled.length === 0) {
        expect(pl(s, 'p1').holding).toBe('latte');
        expect(s.today.bumpSpills ?? 0).toBe(0);
        continue;
      }
      spills++;
      expect(spilled).toHaveLength(1);
      expect(spilled[0].data).toMatchObject({ by: 'p1', item: 'latte' });
      expect(pl(s, 'p1').holding).toBeNull();
      expect(s.messes.some((m) => m.kind === 'spill')).toBe(true);
      expect(s.log.some((e) => e.kind === 'drop')).toBe(true);
      expect(s.today.bumpSpills).toBe(1);
      expect(s.today.wasted).toBe(1);
    }
    // 5% chance: over 400 bumps expect roughly 20 spills.
    expect(spills / 400).toBeGreaterThan(0.02);
    expect(spills / 400).toBeLessThan(0.1);
  });

  it('a spilled bag of grounds makes a grounds mess and empties the hands', () => {
    let seen = false;
    for (let seed = 1; seed <= 400 && !seen; seed++) {
      const s = bumpWith(seed, 'grounds');
      if (!s.log.some((e) => e.kind === 'bump.spill')) continue;
      seen = true;
      expect(pl(s, 'p1').holding).toBeNull();
      expect(s.messes.some((m) => m.kind === 'grounds')).toBe(true);
      expect(s.messes.some((m) => m.kind === 'spill')).toBe(false);
      expect(s.today.bumpSpills).toBe(1);
    }
    expect(seen).toBe(true);
  });

  it('holding the mop never drops it', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = headOn(seed);
      pl(s, 'p1').tool = 'mop';
      s.mop.heldBy = 'p1';
      const after = step(s, []);
      expect(bumps(after)).toHaveLength(1);
      expect(pl(after, 'p1').tool).toBe('mop');
      expect(after.mop.heldBy).toBe('p1');
      expect(after.log.some((e) => e.kind === 'bump.spill')).toBe(false);
    }
  });

  it('the cooldown makes 30 ticks of pushing into each other exactly one bump', () => {
    let s = headOn();
    const gap = B.bodyTiles - 0.1;
    for (let i = 0; i < 30; i++) {
      // keep them pressed together and pushing
      pl(s, 'p1').pos = { x: 4, y: 6 };
      pl(s, 'p2').pos = { x: 4 + gap, y: 6 };
      s = step(s, []);
    }
    // log is pruned after 120 ticks, so all 30 ticks of logs are still here
    expect(bumps(s)).toHaveLength(1);
    expect(s.today.bumps).toBe(1);
  });

  it('a bump shove straight away from a station keeps someone working it in reach (push + body + station half <= interact range)', () => {
    let s = headOn();
    const till = s.stations.find((st) => st.kind === 'counter' && spotOf(st) === 'till')!;
    const a = pl(s, 'p1');
    const b = pl(s, 'p2');
    // p1 stands flush against the top of the till; p2 comes at p1 from the till's side, so p1 is shoved straight away.
    a.pos = { x: till.pos.x, y: till.pos.y - 0.5 - ECONOMY.baristaHalfWidth };
    b.pos = { x: till.pos.x, y: a.pos.y + B.bodyTiles - 0.1 };
    a.heldDir = { x: 0, y: 0 };
    b.heldDir = { x: 0, y: -1 };
    s = step(s, []);
    expect(bumps(s)).toHaveLength(1);
    expect(nearestStation(s, pl(s, 'p1').pos)?.id).toBe(till.id);
  });

  it('Round 5: overlapping bodies slide apart even when standing still (unstick)', () => {
    let s = headOn();
    pl(s, 'p1').heldDir = { x: 0, y: 0 };
    pl(s, 'p2').heldDir = { x: 0, y: 0 };
    pl(s, 'p1').pos = { x: 4, y: 6 };
    pl(s, 'p2').pos = { x: 4.2, y: 6 };
    const before = Math.hypot(pl(s, 'p2').pos.x - pl(s, 'p1').pos.x, pl(s, 'p2').pos.y - pl(s, 'p1').pos.y);
    s = step(s, []);
    expect(bumps(s)).toHaveLength(0);
    expect(Math.hypot(pl(s, 'p2').pos.x - pl(s, 'p1').pos.x, pl(s, 'p2').pos.y - pl(s, 'p1').pos.y)).toBeGreaterThan(before);
    // A short slide (~0.15 s) clears the overlap without a one-tick jump.
    for (let i = 0; i < secondsToTicks(0.2); i++) s = step(s, []);
    expect(Math.hypot(pl(s, 'p2').pos.x - pl(s, 'p1').pos.x, pl(s, 'p2').pos.y - pl(s, 'p1').pos.y)).toBeGreaterThanOrEqual(B.bodyTiles - 1e-6);
  });

  it('Round 5: two people running at the till from both sides stay unstuck (cooldown-capped bumps)', () => {
    let s = cafe(3);
    // Open floor just above the till at (6,6): approach from left and right.
    pl(s, 'p1').pos = { x: 4.5, y: 5 };
    pl(s, 'p2').pos = { x: 7.5, y: 5 };
    pl(s, 'p1').tile = { x: 4, y: 5 };
    pl(s, 'p2').tile = { x: 7, y: 5 };
    pl(s, 'p1').heldDir = { x: 1, y: 0 };
    pl(s, 'p2').heldDir = { x: -1, y: 0 };
    for (let i = 0; i < secondsToTicks(3); i++) s = step(s, []);
    // The brief: no more than twice in 3 s while they keep walking into each other.
    expect(s.today.bumps ?? 0).toBeLessThanOrEqual(2);
    expect(Math.hypot(pl(s, 'p2').pos.x - pl(s, 'p1').pos.x, pl(s, 'p2').pos.y - pl(s, 'p1').pos.y)).toBeGreaterThanOrEqual(B.bodyTiles - 1e-6);
  });

  it('Round 5: two people overlapped against the till, standing on cooldown, are unstuck (the free one takes the whole step)', () => {
    let s = cafe(3);
    const till = s.stations.find((st) => st.kind === 'counter' && spotOf(st) === 'till')!;
    const a = pl(s, 'p1');
    const b = pl(s, 'p2');
    a.pos = { x: till.pos.x, y: till.pos.y - 0.5 - ECONOMY.baristaHalfWidth }; // flush on the till: can't be pushed into it
    b.pos = { x: till.pos.x, y: a.pos.y - 0.1 };
    a.tile = b.tile = { x: Math.floor(a.pos.x), y: Math.floor(a.pos.y) };
    a.heldDir = b.heldDir = { x: 0, y: 0 };
    a.bumpCooldown = b.bumpCooldown = secondsToTicks(10);
    const flushY = a.pos.y;
    for (let i = 0; i < secondsToTicks(0.3); i++) s = step(s, []);
    expect(bumps(s)).toHaveLength(0);
    expect(pl(s, 'p1').pos.y).toBe(flushY);
    expect(flushY - pl(s, 'p2').pos.y).toBeGreaterThanOrEqual(B.bodyTiles - 1e-6);
  });

  it('a staggered player covers about 35% of the normal distance (Round 5 staggerSpeed)', () => {
    const run = (stagger: number) => {
      const s = cafe();
      const a = pl(s, 'p1');
      a.pos = { x: 3, y: 7 };
      a.tile = { x: 3, y: 7 };
      a.heldDir = { x: 1, y: 0 };
      a.staggerTicksLeft = stagger;
      let x = s;
      for (let i = 0; i < 4; i++) x = step(x, []);
      return pl(x, 'p1').pos.x - 3;
    };
    const normal = run(0);
    const slow = run(100);
    expect(normal).toBeGreaterThan(0);
    expect(slow / normal).toBeCloseTo(B.staggerSpeed, 5);
  });

  it('is deterministic: the same seed and scripted moves give identical states', () => {
    const play = () => {
      let s = headOn(7);
      pl(s, 'p1').holding = 'latte';
      for (let i = 0; i < 60; i++) {
        if (i === 30) pl(s, 'p2').heldDir = { x: 1, y: 0 };
        if (i === 45) {
          pl(s, 'p1').heldDir = { x: 1, y: 0 };
          pl(s, 'p2').heldDir = { x: -1, y: 0 };
        }
        s = step(s, []);
      }
      return s;
    };
    expect(play()).toEqual(play());
  });

  it('a run where nobody bumps keeps its RNG stream (seed 5, one player, no bots, 900 ticks)', () => {
    let s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
    s.scenario = 'normal';
    s = startDay(s);
    for (let i = 0; i < 900; i++) s = step(s, []);
    expect(s.rng).toBe(1798888878);
  });
});
