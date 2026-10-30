import { describe, it, expect } from 'vitest';
import { createRun } from './run';
import { stationsFromSlots, TWIN_OFFSET } from './slots';
import { nearestStation } from './movement';
import { targetNodes } from './bots/path';
import { LEVEL_UPS, levelUpGearOk } from './levelUp';
import { hudGearVM, gearStats } from '../ui/gearVM';
import { emptySlotPositions } from '../render/slotModel';
import { GEAR } from '../data/gear';
import { ECONOMY } from '../data/economy';
import type { GameState } from './types';

const run = (gear: boolean): GameState =>
  createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', ...(gear ? { gear: true } : {}) });

describe('G9: dual boiler (two sides in one slot)', () => {
  const slots = ['grinder', 'espresso', null, 'trash'] as const;

  it('E4 adds a steam wand half a tile to the right; plain machines add nothing', () => {
    const plain = stationsFromSlots('stand', [...slots], ['g1', 'e3', null, 'b0']);
    expect(plain.some((s) => s.twin)).toBe(false);
    const st = stationsFromSlots('stand', [...slots], ['g1', 'e4', null, 'b0']);
    const shot = st.find((s) => s.id === 'espresso')!;
    const wand = st.find((s) => s.twin)!;
    expect(wand).toMatchObject({ id: 'steamer', kind: 'steamer', twin: true });
    expect(wand.gear).toBeUndefined();
    expect(wand.pos).toEqual({ x: shot.pos.x + TWIN_OFFSET, y: shot.pos.y });
    expect(shot.gear).toBe('e4');
    expect(st[st.length - 1]!.kind).toBe('counter');
  });

  it('E5 adds a wand and a second group on the other side, with the same gear', () => {
    const st = stationsFromSlots('stand', [...slots], ['g1', 'e5', null, 'b0']);
    const shot = st.find((s) => s.id === 'espresso')!;
    const g2 = st.find((s) => s.id === 'espresso-2')!;
    expect(g2).toMatchObject({ kind: 'espresso', gear: 'e5', twin: true });
    expect(g2.pos.x).toBeCloseTo(shot.pos.x - TWIN_OFFSET);
    expect(st.find((s) => s.kind === 'steamer')!.pos.x).toBeCloseTo(shot.pos.x + TWIN_OFFSET);
  });

  it('on the last column the first twin goes left', () => {
    const st = stationsFromSlots('stand', ['grinder', null, null, 'espresso'], [null, null, null, 'e4']);
    const shot = st.find((s) => s.kind === 'espresso')!;
    expect(st.find((s) => s.twin)!.pos.x).toBeCloseTo(shot.pos.x - TWIN_OFFSET);
  });

  it('a steamer elsewhere keeps its id; the wand numbers after it', () => {
    const st = stationsFromSlots('stand', ['steamer', 'espresso', null, 'trash'], [null, 'e4', null, 'b0']);
    expect(st.filter((s) => s.kind === 'steamer').map((s) => s.id)).toEqual(['steamer', 'steamer-2']);
  });

  it('slots and empty-slot art ignore twins', () => {
    const st = stationsFromSlots('stand', [...slots], ['g1', 'e5', null, 'b0']);
    expect(emptySlotPositions('stand', st)).toHaveLength(1);
  });

  it('a barista reaches each side by standing nearer it; bots have a whole-tile node for each', () => {
    const s = run(true);
    s.slots = [...slots];
    s.slotGear = ['g1', 'e5', null, 'b0'];
    s.stations = stationsFromSlots('stand', s.slots, s.slotGear);
    const shot = s.stations.find((x) => x.id === 'espresso')!;
    const y = shot.pos.y + 1;
    expect(nearestStation(s, { x: shot.pos.x, y })!.id).toBe('espresso');
    expect(nearestStation(s, { x: shot.pos.x + 0.7, y })!.id).toBe('steamer');
    expect(nearestStation(s, { x: shot.pos.x - 0.7, y })!.id).toBe('espresso-2');
    for (const st of s.stations) {
      if (st.kind === 'counter') continue;
      expect(targetNodes(s, st, { x: 4, y: 2 }).length, st.id).toBeGreaterThan(0);
    }
    expect(Math.hypot(1 - TWIN_OFFSET, 1)).toBeLessThanOrEqual(ECONOMY.interactRangeTiles);
  });

  it('one barista can pull a shot and steam milk at the same time (two separate stations)', () => {
    const st = stationsFromSlots('stand', [...slots], ['g1', 'e4', null, 'b0']);
    const shot = st.find((s) => s.id === 'espresso')!;
    const wand = st.find((s) => s.id === 'steamer')!;
    shot.busyTicksLeft = 10;
    expect(wand.busyTicksLeft).toBe(0);
    expect(shot).not.toBe(wand);
  });

  it("E4's wand counts as a milk steamer for café au lait", () => {
    const s = run(true);
    const aulait = LEVEL_UPS.find((l) => l.unlocks === 'cafeAuLait')!;
    s.slotGear = ['g1', 'e3', null, 'b0'];
    expect(levelUpGearOk(s, aulait)).toBe(false);
    s.slotGear = ['g1', 'e4', null, 'b0'];
    expect(levelUpGearOk(s, aulait)).toBe(true);
  });

  it('the gear HUD lists a two-sided machine once; stats and blurbs say it has two sides', () => {
    const s = run(true);
    s.slots = [...slots];
    s.slotGear = ['g1', 'e5', null, 'b0'];
    s.stations = stationsFromSlots('stand', s.slots, s.slotGear);
    const hud = hudGearVM(s);
    const ids = JSON.stringify(hud);
    expect((ids.match(/e5/g) ?? []).length).toBeLessThanOrEqual(1);
    expect(gearStats('e4')).toContain('Steam wand');
    expect(gearStats('e5')).toContain('Two groups');
    expect(GEAR.e4.blurb).not.toContain('later');
  });

  it('classic runs and old saves without slot gear build no twins', () => {
    const s = run(false);
    expect(s.stations.some((x) => x.twin)).toBe(false);
    expect(stationsFromSlots('stand', [...slots]).some((x) => x.twin)).toBe(false);
  });
});

describe('G9: a bot crew works a day with a two-group machine', () => {
  it('runs a day without errors and uses the twin sides', async () => {
    const { startDay } = await import('./run');
    const { step } = await import('./step');
    let s = createRun({ seed: 11, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 2 }, tier: 'stand', gear: true });
    s.slots = ['grinder', 'espresso', 'steamer', 'trash'];
    s.slotGear = ['g1', 'e5', null, 'b0'];
    s.stations = stationsFromSlots('stand', s.slots, s.slotGear);
    for (const k of Object.keys(s.supplies) as (keyof typeof s.supplies)[]) s.supplies[k] = 60;
    s.fridge = 'f1'; // FB2 A4: the stand's Dorm Room Cube (milk needs a fridge)
    s = startDay(s);
    // FB2 A1: the bots work alone here (with a person in the café they would act as helpers).
    s.players[0].connected = false;
    const used = new Set<string>();
    for (let i = 0; i < 60 * 90 && s.phase === 'day'; i++) {
      s = step(s, []);
      for (const st of s.stations) if (st.busyTicksLeft > 0) used.add(st.id);
    }
    expect(s.stations.filter((x) => x.twin)).toHaveLength(2);
    // Deterministic seed: the bots pulled shots on both groups and steamed on the built-in wand.
    expect([...used]).toEqual(expect.arrayContaining(['espresso', 'espresso-2', 'steamer']));
  });

  it('with a person in the café (bots as helpers) the crew still works the day on both groups', async () => {
    const { startDay } = await import('./run');
    const { step } = await import('./step');
    let s = createRun({ seed: 11, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 2 }, tier: 'stand', gear: true });
    s.slots = ['grinder', 'espresso', 'steamer', 'trash'];
    s.slotGear = ['g1', 'e5', null, 'b0'];
    s.stations = stationsFromSlots('stand', s.slots, s.slotGear);
    for (const k of Object.keys(s.supplies) as (keyof typeof s.supplies)[]) s.supplies[k] = 60;
    s.fridge = 'f1'; // FB2 A4: the stand's Dorm Room Cube (milk needs a fridge)
    s = startDay(s);
    const used = new Set<string>();
    for (let i = 0; i < 60 * 400 && s.days.length === 0; i++) {
      s = step(s, []);
      for (const st of s.stations) if (st.busyTicksLeft > 0) used.add(st.id);
    }
    expect(s.days.at(-1)!.served).toBeGreaterThan(0);
    expect([...used]).toEqual(expect.arrayContaining(['espresso', 'espresso-2']));
  });
});
