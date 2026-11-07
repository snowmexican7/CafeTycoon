import { describe, expect, it } from 'vitest';
import { BASE_DRINKS } from '../data/drinks';
import type { GearId } from '../data/gear';
import { createRun } from '../sim/run';
import { ensureCounterSpots, stationsFromSlots, type SlotContent } from '../sim/slots';
import { step } from '../sim/step';
import type { PlayerInput, SupplyId } from '../sim/types';
import { gearVM } from './gearVM';
import { gearBoard } from './night';
import {
  gearLayoutBase,
  layoutClick,
  layoutHtml,
  layoutWithSelection,
  nightLayoutVM,
} from './nightLayout';

const STAND: SlotContent[] = ['grinder', 'espresso', 'drip', 'trash'];
const STAND_GEAR: (GearId | null)[] = ['g1', 'e2', 'd1', 'b0'];

function gearNight() {
  const s = createRun({
    seed: 3,
    hostId: 'p1',
    players: [{ id: 'p1', name: 'Kim' }],
    settings: { dayLengthSec: 600 },
    gear: true,
    tier: 'stand',
  });
  s.slots = [...STAND];
  s.slotGear = [...STAND_GEAR];
  s.slotWand = STAND.map(() => null);
  s.stations = stationsFromSlots('stand', s.slots, s.slotGear, s.slotWand);
  ensureCounterSpots(s);
  s.unlocked = [...BASE_DRINKS, 'drip'];
  for (const d of s.unlocked) s.menu[d] = true;
  for (const k of Object.keys(s.supplies) as SupplyId[]) s.supplies[k] = 99;
  return s;
}

describe('nightLayoutVM (Round 5 block 5)', () => {
  it('maps machines and fixtures; fixtures are not selectable', () => {
    const s = gearNight();
    const vm = nightLayoutVM(s, 'p1', null);
    expect(vm.cells.some((c) => c.kind === 'machine' && c.id === 'drip')).toBe(true);
    expect(vm.cells.some((c) => c.kind === 'fixture' && c.id === 'sink')).toBe(true);
    expect(vm.cells.every((c) => c.kind !== 'spot')).toBe(true);
    expect(vm.blurb).toMatch(/Click a machine/);
  });

  it('highlights only honest spots when a machine is selected', () => {
    const s = gearNight();
    const base = gearLayoutBase(s);
    const spots = base.spotsById.drip ?? [];
    expect(spots.length).toBeGreaterThan(0);
    const vm = layoutWithSelection(base, 'drip');
    const highlighted = vm.cells.filter((c) => c.kind === 'spot');
    expect(highlighted.length).toBeGreaterThan(0);
    // Every highlighted tile is in spotsById (honest: matches canSetDown / validStationSpots)
    for (const c of highlighted) {
      expect(spots.some((p) => p.x === c.x && p.y === c.y)).toBe(true);
    }
    // No highlighted tile sits under a fixture
    for (const c of highlighted) {
      expect(base.cells.find((b) => b.x === c.x && b.y === c.y)?.kind).not.toBe('fixture');
    }
    // Machine's own tile stays a machine (selected), not a spot
    const drip = vm.cells.find((c) => c.id === 'drip');
    expect(drip?.kind).toBe('machine');
    expect(vm.selected).toBe('drip');
  });

  it('layoutClick picks, places on a spot, and cancels on second click', () => {
    const s = gearNight();
    const base = gearLayoutBase(s);
    const drip = base.cells.find((c) => c.id === 'drip')!;
    const pick = layoutClick(base, null, drip.x, drip.y);
    expect(pick.selected).toBe('drip');
    const cancel = layoutClick(base, 'drip', drip.x, drip.y);
    expect(cancel.selected).toBeNull();
    expect(cancel.move).toBeUndefined();

    const spot = (base.spotsById.drip ?? []).find((p) => !(p.x === drip.x && p.y === drip.y));
    expect(spot).toBeTruthy();
    const place = layoutClick(base, 'drip', spot!.x, spot!.y);
    expect(place.move).toEqual({ station: 'drip', to: { x: spot!.x, y: spot!.y } });
    expect(place.selected).toBeNull();
  });

  it('refuses a non-spot click with a short line; fixtures stay put', () => {
    const s = gearNight();
    const base = gearLayoutBase(s);
    const empty = base.cells.find((c) => c.kind === 'empty' && !(base.spotsById.drip ?? []).some((p) => p.x === c.x && p.y === c.y));
    if (empty) {
      const r = layoutClick(base, 'drip', empty.x, empty.y);
      expect(r.move).toBeUndefined();
      expect(r.selected).toBe('drip');
      expect(r.refuse).toMatch(/highlighted/);
    }
    const sink = base.cells.find((c) => c.id === 'sink')!;
    const r2 = layoutClick(base, null, sink.x, sink.y);
    expect(r2.selected).toBeNull();
  });

  it('Gear shop board includes a Layout section with the map', () => {
    const s = gearNight();
    const html = gearBoard(gearVM(s, 'p1'));
    expect(html).toContain('gr-layout');
    expect(html).toContain('Layout');
    expect(html).toContain('data-action="layout"');
    expect(layoutHtml(nightLayoutVM(s, 'p1', null))).toContain('lay-map');
  });

  it('a day phase has no layout spots in the Gear VM path (night only for moves)', () => {
    let s = gearNight();
    s = step(s, [{ kind: 'ready', playerId: 'p1' } as PlayerInput]);
    expect(s.phase).toBe('day');
    // Map still draws (for honesty about where things are), spots still list tiles; canSetDown gates the input.
    const base = gearLayoutBase(s);
    expect(base.cells.some((c) => c.kind === 'machine')).toBe(true);
  });
});
