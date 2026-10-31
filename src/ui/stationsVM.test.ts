import { describe, expect, it } from 'vitest';
import { createRun, startNight } from '../sim/run';
import { defaultSlots, stationsFromSlots } from '../sim/slots';
import type { GameState, StationKind } from '../sim/types';
import { stationMenuNote } from './stationsVM';

function night() {
  const s = startNight(createRun({ seed: 3, hostId: 'ana', players: [{ id: 'ana', name: 'Ana' }] } as never));
  s.cash = 500;
  return s;
}

function setSlot(s: GameState, index: number, station: StationKind | null): GameState {
  const slots = [...(s.slots ?? defaultSlots(s.tier))];
  slots[index] = station;
  s.slots = slots;
  s.stations = stationsFromSlots(s.tier, slots);
  return s;
}

/** ui-3.7.1: the classic Stations board is gone; only the menu tab's note is left. */
describe('stationMenuNote', () => {
  it('is quiet when every known drink has its station', () => {
    expect(stationMenuNote(night())).toBeUndefined();
  });
  it('names the missing station and the drinks that wait', () => {
    const s = night();
    setSlot(s, defaultSlots(s.tier).indexOf('steamer'), null);
    expect(stationMenuNote(s)).toMatch(/^No steam wand on the floor: .*Latte/);
  });
});
