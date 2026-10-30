import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { secondsToTicks } from './constants';
import { ECONOMY } from '../data/economy';
import type { GameState, ItemKind, Player } from './types';

const B = ECONOMY.bump;

function cafe(seed = 1): GameState {
  const s = createRun({
    seed,
    hostId: 'p1',
    players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'J' }],
    settings: { bots: 0 },
  });
  s.scenario = 'normal';
  const d = startDay(s);
  d.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  return d;
}

const pl = (s: GameState, id: string): Player => s.players.find((p) => p.id === id)!;

/** p1 at (4, 6) facing p2 half a tile to its right, both walking into each other (open floor). */
function headOn(seed = 1, gap = 0.5): GameState {
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
    for (let i = 0; i < 30; i++) {
      // keep them pressed together and pushing
      pl(s, 'p1').pos = { x: 4, y: 6 };
      pl(s, 'p2').pos = { x: 4.5, y: 6 };
      s = step(s, []);
    }
    // log is pruned after 120 ticks, so all 30 ticks of logs are still here
    expect(bumps(s)).toHaveLength(1);
    expect(s.today.bumps).toBe(1);
  });

  it('a staggered player covers about 40% of the normal distance', () => {
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
    let s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
    s.scenario = 'normal';
    s = startDay(s);
    for (let i = 0; i < 900; i++) s = step(s, []);
    expect(s.rng).toBe(1798888878);
  });
});
