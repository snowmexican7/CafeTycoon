import { stationCountsLeft } from '../sim/counts';
import { CONDIMENTS_ID, PICKUP_ID } from '../data/layout';
import { describe, expect, it } from 'vitest';
import { createRun, startDay } from '../sim/run';
import { stationsFromSlots } from '../sim/slots';
import { GEAR, type GearId } from '../data/gear';
import { SINK_ID } from '../data/layout';
import { coolTicks } from '../sim/cooling';
import type { GameState, SimEvent, Station } from '../sim/types';
import { CARRIED_FILL, carafeLook, heldFreshness, heldIsCold, outputFreshness, potBadge, potNeedsDump, sinkToast } from './sinkModel';
import { counterSpotOf, pickupCups } from './pickupModel';
import { stationCounts, passCool } from './countsModel';
import { crewBursts, newCrewMemory } from './crewModel';
import { chaosBursts } from './chaosModel';
import { diffCues, type CueId } from '../audio/cues';

function stand(gear: GearId[] = ['d1', 's3', 'g2', 'b0']): GameState {
  const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'Lu' }], settings: { bots: 0 }, tier: 'stand', gear: true });
  s.slotGear = [...gear];
  s.slots = gear.map((id) => GEAR[id].station);
  s.stations = stationsFromSlots(s.tier, s.slots, s.slotGear);
  s.unlocked = [...(s.unlocked ?? []), 'drip'];
  s.menu.drip = true;
  return startDay(s);
}
const st = (s: GameState, id: string): Station => s.stations.find((x) => x.id === id)!;
const clone = (s: GameState): GameState => structuredClone(s);
function withLog(s: GameState, ...entries: Omit<SimEvent, 'seq' | 'tick'>[]): GameState {
  const n = clone(s);
  for (const e of entries) n.log.push({ ...e, seq: n.nextLogSeq++, tick: n.tick });
  return n;
}
const cups = GEAR.d1.pot!.cups;

describe('sinkModel (3.3.3, FB2 A3)', () => {
  it('potBadge: out (with the carrier), stale, cold; nothing for a fine pot, a classic run or a non-pot station', () => {
    const s = stand();
    const d = st(s, 'drip');
    expect(potBadge(s, d)).toBeNull();
    d.potLeft = 3;
    d.output = 'drip';
    d.potColdAt = s.tick + 100;
    expect(potBadge(s, d)).toBeNull();
    d.potColdAt = s.tick - 1;
    expect(potBadge(s, d)).toEqual({ tone: 'cold', text: 'COLD: dump at sink' });
    d.stale = true;
    expect(potBadge(s, d)).toEqual({ tone: 'stale', text: 'STALE: dump at sink' });
    d.potOut = 'p2';
    expect(potBadge(s, d)).toEqual({ tone: 'out', text: 'POT OUT · Lu' });
    expect(potBadge({ ...s, gear: false } as unknown as GameState, d)).toBeNull();
    expect(potBadge(s, st(s, 'steamer'))).toBeNull();
  });

  it('carafeLook: hidden while out, fills while brewing, stale before empty, cold and fresh tints', () => {
    const s = stand();
    const d = st(s, 'drip');
    expect(carafeLook(s, d)).toEqual({ show: true, fill: 0, tone: 'empty' });
    d.busyTicksLeft = 30;
    d.busyTotal = 120;
    expect(carafeLook(s, d)).toMatchObject({ tone: 'brewing', fill: 0.75 });
    d.busyTicksLeft = 0;
    d.potLeft = cups;
    d.potColdAt = s.tick + 50;
    expect(carafeLook(s, d)).toEqual({ show: true, fill: 1, tone: 'fresh' });
    d.potColdAt = s.tick;
    expect(carafeLook(s, d).tone).toBe('cold');
    // a stale pot carried back undumped has no cup count (lifting cleared it) but still draws as old coffee
    d.potLeft = undefined;
    d.stale = true;
    expect(carafeLook(s, d)).toEqual({ show: true, fill: CARRIED_FILL, tone: 'stale' });
    d.potOut = 'p1';
    expect(carafeLook(s, d).show).toBe(false);
  });

  it('heldIsCold / heldFreshness follow the cup clock; iced drinks, grounds and tools have none', () => {
    const s = stand();
    const p = s.players[0];
    p.holding = 'drip';
    p.heldSince = s.tick;
    expect(heldFreshness(s, p)).toBe(1);
    expect(heldIsCold(s, p)).toBe(false);
    s.tick += coolTicks('drip')!;
    expect(heldFreshness(s, p)).toBe(0);
    expect(heldIsCold(s, p)).toBe(true);
    p.holding = 'coldBrew';
    expect(heldFreshness(s, p)).toBeNull();
    expect(heldIsCold(s, p)).toBe(false);
    p.holding = 'grounds';
    expect(heldFreshness(s, p)).toBeNull();
    p.holding = null;
    p.tool = 'pot';
    expect(heldFreshness(s, p)).toBeNull();
  });

  it('outputFreshness: a shot or milk waiting at a machine cools; drip pots keep their own ring', () => {
    const s = stand();
    const m = st(s, 'steamer');
    expect(outputFreshness(s, m)).toBeNull();
    m.output = 'latte';
    m.outputSince = s.tick;
    if (coolTicks('latte') !== null) {
      expect(outputFreshness(s, m)).toBe(1);
      s.tick += coolTicks('latte')!;
      expect(outputFreshness(s, m)).toBe(0);
    }
    const d = st(s, 'drip');
    d.output = 'drip';
    d.outputSince = 0;
    d.potLeft = 2;
    expect(outputFreshness(s, d)).toBeNull();
    expect(outputFreshness({ ...s, gear: false } as unknown as GameState, m)).toBeNull();
  });

  it('potNeedsDump agrees with the sim', () => {
    const s = stand();
    const d = st(s, 'drip');
    expect(potNeedsDump(s, d)).toBe(false);
    d.stale = true;
    expect(potNeedsDump(s, d)).toBe(true);
    d.potOut = 'p1';
    expect(potNeedsDump(s, d)).toBe(false);
  });

  it('sinkToast words the dump, the stale pot, the leak and a cold pickup', () => {
    const names = (id: string) => (id === 'p2' ? 'Lu' : '?');
    expect(sinkToast({ kind: 'sink.dump', data: { item: 'pot', by: 'p2' } }, names, 'p1')).toBe('Lu dumped the old pot: ready to brew');
    expect(sinkToast({ kind: 'sink.dump', data: { item: 'pot', by: 'p1' } }, names, 'p1')).toBe('You dumped the old pot: ready to brew');
    expect(sinkToast({ kind: 'sink.dump', data: { item: 'latte', by: 'p1' } }, names, 'p1')).toBeNull();
    expect(sinkToast({ kind: 'pot.stale', data: {} }, names, null)).toMatch(/stale: dump it at the sink/);
    expect(sinkToast({ kind: 'bin.leak', data: {} }, names, null)).toMatch(/leaked/);
    expect(sinkToast({ kind: 'pickup.cold', data: { drink: 'latte' } }, names, null)).toMatch(/^Cold latte picked up: no pay$/);
    expect(sinkToast({ kind: 'served', data: {} } as never, names, null)).toBeNull();
  });
});

describe('sink wiring in the render models (3.3.3)', () => {
  it('counterSpotOf names the sink', () => {
    const s = stand();
    expect(counterSpotOf(st(s, SINK_ID), s.stations)).toBe('sink');
  });

  it('stationCounts (A5, stationCountsLeft): hides the drip count while the pot is out, shows a stale pot in blue', () => {
    const s = stand();
    const d = st(s, 'drip');
    d.potLeft = 3;
    d.potColdAt = s.tick + 100;
    expect(stationCounts(s).find((c) => c.id === 'drip')).toMatchObject({ n: 3, tone: 'ok' });
    d.stale = true;
    expect(stationCounts(s).find((c) => c.id === 'drip')).toMatchObject({ n: 3, tone: 'cold', cool: 0 });
    d.potOut = 'p1';
    expect(stationCounts(s).some((c) => c.id === 'drip')).toBe(false);
  });

  it('stationCounts matches stationCountsLeft: pickup cups count, the condiment bar is left to its gauge, never a 0', () => {
    const s = stand();
    s.pass = [{ item: 'drip', ticksLeft: 999, by: 'p1', madeAt: s.tick }, { item: 'espresso', ticksLeft: 999, by: 'p1', madeAt: s.tick }];
    const ids = new Map(stationCounts(s).map((c) => [c.id, c.n]));
    for (const { id, n } of stationCountsLeft(s)) if (id !== CONDIMENTS_ID) expect(ids.get(id)).toBe(n);
    expect(ids.get(PICKUP_ID)).toBe(2);
    expect(ids.has(CONDIMENTS_ID)).toBe(false);
    expect([...ids.values()].every((n) => n > 0)).toBe(true);
  });

  it('pickup cups that cool on the counter blink near cold and flag fully cold; passCool reads the same clock', () => {
    const s = stand();
    s.pass = [{ item: 'drip', ticksLeft: 999, by: 'p1', madeAt: s.tick }];
    expect(pickupCups(s)[0]).not.toHaveProperty('cold');
    expect(passCool(s)[0]).toBe(1);
    s.tick += coolTicks('drip')!;
    expect(pickupCups(s)[0]).toMatchObject({ stale: true, cold: true });
    expect(passCool(s)[0]).toBe(0);
  });

  it('crewBursts: sink notes with a spot and a tone; a leak and a cold pickup cost vibe', () => {
    const s = stand();
    const mem = newCrewMemory();
    const n = withLog(s,
      { kind: 'sink.dump', data: { item: 'pot', by: 'p2' } },
      { kind: 'pot.stale', data: { station: 'drip' } },
      { kind: 'bin.leak', data: { by: 'p1', at: 'trash', x: 1, y: 1 } },
      { kind: 'pickup.cold', data: { drink: 'drip' } },
    );
    const notes = crewBursts(s, n, -1, mem).bursts.filter((b) => b.kind === 'note');
    expect(notes).toEqual([
      { kind: 'note', text: 'Lu dumped the old pot: ready to brew', tone: 'good', at: SINK_ID },
      { kind: 'note', text: expect.stringMatching(/stale/), tone: 'warn', at: 'drip' },
      { kind: 'note', text: expect.stringMatching(/leaked/), tone: 'bad', at: 'trash' },
      { kind: 'note', text: 'Cold drip picked up: no pay', tone: 'bad' },
    ]);
    expect(mem.vibe).toBeLessThan(newCrewMemory().vibe);
  });

  it('chaosBursts: a drain at the sink and a leak at its puddle', () => {
    const s = stand();
    const n = withLog(s, { kind: 'sink.dump', data: { item: 'pot', by: 'p1' } }, { kind: 'bin.leak', data: { by: 'p1', at: 'trash', x: 2, y: 3 } }, { kind: 'mess.spawn', data: { kind: 'milk', x: 4, y: 4 } });
    const b = chaosBursts(s, n, -1).bursts;
    expect(b).toContainEqual({ kind: 'drain', at: st(s, SINK_ID).pos, pot: true });
    expect(b).toContainEqual({ kind: 'leak', at: { x: 2, y: 3 } });
    expect(b).toContainEqual({ kind: 'splash', at: { x: 4, y: 4 }, item: 'latte' });
  });

  it('diffCues: the sink, the pot, the stale morning, the leak and a cold cup each sound', () => {
    const s = stand();
    const n = withLog(s,
      { kind: 'sink.dump', data: { item: 'pot', by: 'p1' } },
      { kind: 'pot.lift', data: { by: 'p1', station: 'drip' } },
      { kind: 'drop', data: { item: 'pot', by: 'p1', station: 'drip' } },
      { kind: 'pot.stale', data: { station: 'drip' } },
      { kind: 'bin.leak', data: { by: 'p2', at: 'trash', x: 1, y: 1 } },
      { kind: 'pickup.cold', data: { drink: 'drip' } },
    );
    const ids = diffCues(s, n, 'p1', -1).cues.map((c) => c.id);
    for (const id of ['sinkDump', 'potLift', 'potBack', 'stalePot', 'binLeak', 'coldCup'] as CueId[]) expect(ids).toContain(id);
  });
});
