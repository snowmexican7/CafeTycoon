import { describe, expect, it } from 'vitest';
import { createRun, startNight } from '../sim/run';
import { defaultSlots, stationsFromSlots } from '../sim/slots';
import type { GameState, StationKind } from '../sim/types';
import { stationsBoard } from './night';
import { stationMenuNote, stationsVM } from './stationsVM';

function night() {
  const s = startNight(createRun({ seed: 3, hostId: 'ana', players: [{ id: 'ana', name: 'Ana' }] } as never));
  s.cash = 500;
  return s;
}

/** Round 4 f (sim): the slot/equip inputs are gone, so the tests set the slots directly. TODO(Grok): delete with the board. */
function setSlot(s: GameState, index: number, station: StationKind | null): GameState {
  const slots = [...(s.slots ?? defaultSlots(s.tier))];
  slots[index] = station;
  s.slots = slots;
  s.stations = stationsFromSlots(s.tier, slots);
  return s;
}

describe('stationsVM (FB1 WP5)', () => {
  it('one tile per slot, empty where the slot is null', () => {
    const s = night();
    const vm = stationsVM(s);
    const slots = defaultSlots(s.tier);
    expect(vm.slots.map((t) => t.kind)).toEqual(slots);
    expect(vm.slots.filter((t) => t.kind === null).every((t) => t.name === 'Empty')).toBe(true);
  });
  it('binning the bin gives the trade-off line', () => {
    let s = night();
    const bin = defaultSlots(s.tier).indexOf('trash');
    s = setSlot(s, bin, null);
    const vm = stationsVM(s);
    expect(vm.tradeoff).toBe('No bin: trash hits the floor');
    expect(vm.spares).toEqual([]);
  });
  it('a bought duplicate is numbered, and removing the steamer notes the menu', () => {
    let s = night();
    s = setSlot(s, defaultSlots(s.tier).indexOf(null), 'espresso');
    const vm = stationsVM(s);
    expect(vm.slots.map((t) => t.name)).toContain('Espresso 2');
    expect(vm.shop.find((x) => x.kind === 'espresso')!.owned).toBe(2);
    const steam = defaultSlots(s.tier).indexOf('steamer');
    s = setSlot(s, steam, null);
    expect(stationMenuNote(s)).toMatch(/^No steam wand on the floor: .*Latte/);
    expect(stationsVM(s).notes.some((n) => n.startsWith('No steam wand:'))).toBe(true);
  });
  it('the board renders tiles, the swap row for a picked slot and buy buttons', () => {
    const s = night();
    const html = stationsBoard(stationsVM(s), 1);
    expect(html).toContain('data-action="slot-pick"');
    expect(html.match(/data-action="equip"/g)).toHaveLength(5);
  });
});
