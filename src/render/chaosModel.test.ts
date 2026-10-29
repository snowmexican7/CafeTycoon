import { describe, expect, it } from 'vitest';
import { createRun } from '../sim/run';
import type { GameState, Rogue, SimEvent } from '../sim/types';
import { approach, chaosBursts, hash32, messRadius, rogueLine, roguePose } from './chaosModel';
import { LAYOUT } from '../data/layout';

const run = () => createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'Ana' }] });
const clone = (s: GameState): GameState => structuredClone(s);
function withLog(s: GameState, ...entries: Omit<SimEvent, 'seq' | 'tick'>[]): GameState {
  const n = clone(s);
  for (const e of entries) n.log.push({ ...e, seq: n.nextLogSeq++, tick: n.tick });
  return n;
}
const rogue = (stage: Rogue['stage']): Rogue => ({ customerId: 4, drink: 'latte', stage, pos: { x: 6, y: 7 }, path: [], station: null, ticksLeft: 0, waitTicks: 0 });

describe('chaos visuals model', () => {
  it('sizes messes by amount, puddles bigger than piles, capped inside a tile', () => {
    expect(messRadius('spill', 0.5)).toBeLessThan(messRadius('spill', 1.5));
    expect(messRadius('grounds', 1)).toBeLessThan(messRadius('spill', 1));
    expect(messRadius('spill', 99)).toBeLessThanOrEqual(30);
    expect(messRadius('grounds', 99)).toBeLessThanOrEqual(24);
    expect(messRadius('spill', -1)).toBeGreaterThan(0);
  });

  it('eases toward a target and settles exactly', () => {
    let v = 0;
    for (let i = 0; i < 200; i++) v = approach(v, 1, 1 / 60);
    expect(v).toBe(1);
    expect(approach(0, 1, 0)).toBe(0);
  });

  it('hashes stably', () => {
    expect(hash32(3)).toBe(hash32(3));
    expect(hash32(3)).not.toBe(hash32(4));
  });

  it('gives the rogue a line and a pose for every stage', () => {
    expect(rogueLine('waiting', 4)).toBe('Move it! 4s');
    expect(rogueLine('making', -2)).toContain('0s');
    expect(rogueLine('leaving', 0)).toBe('Two stars.');
    expect(roguePose('walking').crouch).toBeLessThan(1);
    expect(roguePose('leaving').carrying).toBe(true);
    expect(roguePose('stormingOut').fast).toBe(true);
    expect(roguePose('leaving').steam).toBe(0);
  });

  it('turns new log entries into one-shot bursts, once', () => {
    const a = run();
    const b = withLog(
      a,
      { kind: 'slip', data: { player: 'p1', x: 3, y: 4, ticks: 200 } },
      { kind: 'drop', data: { item: 'latte', x: 3, y: 4 } },
      { kind: 'drop', data: { item: 'grounds', x: 5, y: 4 } },
      { kind: 'drop', data: { item: 'mop', x: 11, y: 7 } },
      { kind: 'drop', data: { item: 'latte', station: 'counter' } },
      { kind: 'clean', data: { player: 'p1', x: 3, y: 4 } },
      { kind: 'rogue.upset', data: { drink: 'latte' } },
    );
    const first = chaosBursts(a, b, a.nextLogSeq - 1);
    expect(first.bursts.map((x) => x.kind)).toEqual(['thud', 'splash', 'scatter', 'sparkle', 'hmph']);
    expect(first.bursts[0]).toMatchObject({ at: { x: 3, y: 4 }, playerId: 'p1' });
    expect(chaosBursts(b, clone(b), first.lastSeq).bursts).toEqual([]);
    // the first snapshot (or a new run) fires nothing
    expect(chaosBursts(null, b, -1).bursts).toEqual([]);
  });

  it('slams the door when the rogue walks out, not when they vanish otherwise', () => {
    const a = run();
    a.rogue = rogue('stormingOut');
    const b = clone(a);
    b.rogue = null;
    expect(chaosBursts(a, b, a.nextLogSeq - 1).bursts).toEqual([{ kind: 'slam', at: LAYOUT.door }]);
    a.rogue = rogue('making');
    expect(chaosBursts(a, b, a.nextLogSeq - 1).bursts).toEqual([]);
  });
});
