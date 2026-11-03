import { describe, it, expect } from 'vitest';
import { createRun, startDay } from '../sim/run';
import { ensureCounterSpots, stationsFromSlots } from '../sim/slots';
import { GEAR } from '../data/gear';
import { handHint } from './live';
import type { GameState } from '../sim/types';

function gearDay(): GameState {
  const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear: true });
  s.fridge = 'f1';
  s.slots = ['coldBrewTap', 'espresso', null, 'trash'];
  s.slotGear = ['c1', 'e1', null, 'b0'];
  s.stations = stationsFromSlots(s.tier, s.slots, s.slotGear);
  ensureCounterSpots(s);
  s.supplies.concentrate = 50;
  return startDay(s);
}

describe('Round 5 block 4: cold brew refill hints', () => {
  it('empty cold brew with concentrate offers a refill; without concentrate points to Restock', () => {
    const s = gearDay();
    const tap = s.stations.find((x) => x.kind === 'coldBrewTap')!;
    tap.batchLeft = 0;
    s.supplies.concentrate = 10;
    s.players[0].pos = { x: tap.pos.x, y: tap.pos.y + 1 };
    expect(handHint(s, 'p1')).toMatchObject({ go: true, title: 'Press E to refill (4 s)' });
    s.supplies.concentrate = 0;
    expect(handHint(s, 'p1')).toMatchObject({ go: false, title: 'Out of cold brew. Buy more with 📦 Restock' });
  });

  it('a stocked cold brew still says Pour, never refill', () => {
    const s = gearDay();
    const tap = s.stations.find((x) => x.kind === 'coldBrewTap')!;
    tap.batchLeft = 5;
    s.players[0].pos = { x: tap.pos.x, y: tap.pos.y + 1 };
    expect(handHint(s, 'p1').title).toBe('Pour cold brew');
  });
});
