import { describe, expect, it } from 'vitest';
import { SLOT_POSITIONS } from '../data/layout';
import { defaultSlots, stationsFromSlots } from '../sim/slots';
import { emptySlotPositions, stationBadges, wallMenuRows } from './slotModel';
import { createRun } from '../sim/run';

describe('emptySlotPositions (FB1 WP5)', () => {
  it('marks exactly the null slots', () => {
    const slots = defaultSlots('cafe');
    const want = SLOT_POSITIONS.cafe.filter((_, i) => slots[i] === null);
    expect(emptySlotPositions('cafe', stationsFromSlots('cafe', slots))).toEqual(want);
  });
  it('an emptied bin slot gets a plinth; a filled slot loses it', () => {
    const slots = defaultSlots('cafe');
    const bin = slots.indexOf('trash');
    slots[bin] = null;
    const free = slots.findIndex((k, i) => k === null && i !== bin);
    if (free >= 0) slots[free] = 'espresso';
    const empty = emptySlotPositions('cafe', stationsFromSlots('cafe', slots));
    expect(empty).toContainEqual(SLOT_POSITIONS.cafe[bin]);
    if (free >= 0) expect(empty).not.toContainEqual(SLOT_POSITIONS.cafe[free]);
  });
  it('FB2 C10: follows rearranged slotPos (markers track empty slots, not abandoned defaults)', () => {
    const slots = defaultSlots('cafe');
    const machineI = slots.findIndex((k) => k !== null);
    const emptyI = slots.findIndex((k) => k === null);
    expect(machineI).toBeGreaterThanOrEqual(0);
    expect(emptyI).toBeGreaterThanOrEqual(0);
    // Move a machine onto a free bar tile (not another slot). Empty slots stay at defaults.
    const free = { x: 2, y: 3 };
    const moved = SLOT_POSITIONS.cafe.map((_, i) => (i === machineI ? { ...free } : null));
    const stations = stationsFromSlots('cafe', slots, undefined, undefined, moved);
    const empty = emptySlotPositions('cafe', stations, moved);
    expect(empty).toContainEqual(SLOT_POSITIONS.cafe[emptyI]!);
    expect(empty).not.toContainEqual(free);
    // Without slotPos the vacated default home still gets a plinth even though that slot still owns a machine.
    expect(emptySlotPositions('cafe', stations)).toContainEqual(SLOT_POSITIONS.cafe[machineI]!);
    expect(empty).not.toContainEqual(SLOT_POSITIONS.cafe[machineI]!);
  });
});

describe('stationBadges', () => {
  it('numbers repeats per kind and skips twins', () => {
    const b = stationBadges([
      { kind: 'espresso' },
      { kind: 'steamer', twin: true },
      { kind: 'steamer' },
      { kind: 'drip' },
      { kind: 'espresso' },
      { kind: 'steamer' },
    ] as never);
    expect(b).toEqual([1, 1, 1, 1, 2, 2]);
  });
});

describe('wallMenuRows (the wall chalkboard follows the menu)', () => {
  const run = (gear: boolean) => createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear });
  it('a classic stand lists its makeable menu drinks at today\'s price', () => {
    const s = run(false);
    const rows = wallMenuRows(s);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0][1]).toMatch(/^\d+\.\d\d$/);
    expect(wallMenuRows(s, { [Object.keys(s.menu).find((d) => s.menu[d as never])!]: 2 }).some((r, i) => r[1] !== rows[i][1])).toBe(true);
  });
  it('an empty Gear counter has nothing on the board', () => {
    expect(wallMenuRows(run(true))).toEqual([]);
  });
  it('more than four drinks fold into "+N more"', () => {
    const s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'cafe' });
    const many = ['espresso', 'latte', 'coldBrew', 'mocha', 'americano', 'drip', 'icedLatte', 'doppio'];
    s.unlocked = many as never;
    for (const d of many) (s.menu as Record<string, boolean>)[d] = true;
    const rows = wallMenuRows(s);
    expect(rows).toHaveLength(4);
    expect(rows[3]).toEqual(['+4 more', '']);
  });
});
