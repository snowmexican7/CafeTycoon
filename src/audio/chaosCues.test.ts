import { describe, expect, it } from 'vitest';
import { createRun } from '../sim/run';
import type { GameState, Rogue, SimEvent } from '../sim/types';
import { diffCues, logCursor, type CueId } from './cues';
import { RECIPES } from './recipes';
import { CUE_RULES } from './gate';

const run = () => createRun({ seed: 9, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }] });
const clone = (s: GameState): GameState => structuredClone(s);
const ids = (r: { cues: { id: CueId }[] }) => r.cues.map((c) => c.id);
function withLog(s: GameState, ...entries: Omit<SimEvent, 'seq' | 'tick'>[]): GameState {
  const n = clone(s);
  for (const e of entries) n.log.push({ ...e, seq: n.nextLogSeq++, tick: n.tick });
  return n;
}
const rogue = (stage: Rogue['stage']): Rogue => ({ customerId: 4, drink: 'latte', stage, pos: { x: 6, y: 7 }, path: [], station: null, ticksLeft: 0, waitTicks: 0 });

describe('chaos pack sounds', () => {
  it('voices slips, floor drops, cleaning and the rogue log, marking the local player', () => {
    const a = run();
    const b = withLog(
      a,
      { kind: 'slip', data: { player: 'p1', x: 3, y: 3, ticks: 200 } },
      { kind: 'drop', data: { item: 'latte', x: 3, y: 3 } },
      { kind: 'drop', data: { item: 'grounds', x: 4, y: 3 } },
      { kind: 'drop', data: { item: 'latte', station: 'counter' } },
      { kind: 'drop', data: { item: 'mop', x: 11, y: 7 } },
      { kind: 'clean', data: { player: 'p2', x: 3, y: 3 } },
      { kind: 'rogue.upset', data: { drink: 'latte' } },
      { kind: 'rogue.remade', data: { drink: 'latte' } },
      { kind: 'rogue.made', data: { drink: 'latte' } },
      { kind: 'rogue.stormed', data: { drink: 'latte' } },
    );
    const r = diffCues(a, b, 'p1', logCursor(a));
    expect(ids(r)).toEqual(['slip', 'splash', 'scatter', 'mopDown', 'squeak', 'rogueUpset', 'rogueSaved', 'rogueMade', 'rogueStorm']);
    expect(r.cues.filter((c) => c.mine).map((c) => c.id)).toEqual(['slip']);
  });

  it('clacks when the mop is picked up', () => {
    const a = run();
    const b = clone(a);
    b.mop.heldBy = 'p2';
    expect(ids(diffCues(a, b, 'p1', logCursor(a)))).toContain('mopGrab');
    expect(diffCues(a, b, 'p2', logCursor(a)).cues.find((c) => c.id === 'mopGrab')?.mine).toBe(true);
  });

  it('sneaks when a rogue appears (not a storm-out, though they count as lost), and slams the door when they leave', () => {
    const a = run();
    a.phase = 'day';
    const b = clone(a);
    b.rogue = rogue('walking');
    b.today.lost += 1;
    const start = ids(diffCues(a, b, 'p1', logCursor(a)));
    expect(start).toContain('rogueSneak');
    expect(start).not.toContain('stormOut');
    const c = clone(b);
    c.rogue = rogue('leaving');
    const d = clone(c);
    d.rogue = null;
    expect(ids(diffCues(c, d, 'p1', logCursor(c)))).toEqual(['doorSlam']);
    // a rogue vanishing at the end of the day (not walking out) does not slam
    const e = clone(b);
    e.rogue = null;
    expect(ids(diffCues(b, e, 'p1', logCursor(b)))).not.toContain('doorSlam');
  });

  it('gives every chaos cue a recipe and a throttle rule', () => {
    for (const id of ['slip', 'splash', 'scatter', 'mopGrab', 'mopDown', 'squeak', 'rogueSneak', 'rogueUpset', 'rogueSaved', 'rogueMade', 'rogueStorm', 'doorSlam'] as CueId[]) {
      expect(RECIPES[id]?.length, id).toBeGreaterThan(0);
      expect(CUE_RULES[id], id).toBeDefined();
    }
  });
});

describe('event sounds (Block 2)', () => {
  it('buzzes on and off while the power is out, never otherwise', async () => {
    const { BUZZ_TICKS } = await import('./cues');
    const a = run();
    a.phase = 'day';
    a.events = [{ kind: 'powerFlicker', ticksLeft: 200 }];
    let buzzes = 0;
    let prev = a;
    for (let i = 0; i < BUZZ_TICKS * 4; i += 3) {
      const n = clone(prev);
      n.tick += 3;
      if (ids(diffCues(prev, n, 'p1', logCursor(prev))).includes('buzz')) buzzes++;
      prev = n;
    }
    expect(buzzes).toBe(4);
    const off = clone(a);
    off.events = [];
    const off2 = clone(off);
    off2.tick += BUZZ_TICKS;
    expect(ids(diffCues(off, off2, 'p1', logCursor(off)))).not.toContain('buzz');
  });

  it('gives every event a sting layered on its sound', () => {
    expect(RECIPES.rushHour.some((l) => 'synth' in l && l.synth === 'rushSting')).toBe(true);
    expect(RECIPES.inspector.some((l) => 'synth' in l && l.synth === 'inspectorSting')).toBe(true);
    expect(RECIPES.influencer.some((l) => 'synth' in l && l.synth === 'glitter')).toBe(true);
    expect(RECIPES.powerFlicker.some((l) => 'synth' in l && l.synth === 'buzz')).toBe(true);
  });
});
