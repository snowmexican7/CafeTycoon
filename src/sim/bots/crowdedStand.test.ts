import { describe, it, expect } from 'vitest';
import { createRun, startDay } from '../run';
import { step } from '../step';
import { addStandIns } from './roster';
import type { GearId } from '../../data/gear';
import type { GameState } from '../types';

/** A stocked Gear stand (C1 tap, E1 pods, S1 steamer) worked by `n` stand-ins for one day of `secs` seconds. */
function standDay(n: number, seed: number, secs = 420): GameState {
  let s = createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: secs }, tier: 'stand', gear: true });
  s.owned.push({ itemId: 'test-busy', effects: [{ kind: 'traffic', mul: 2.5 }] }); // a busy day: the bar, not the door, is the limit
  addStandIns(s, n);
  for (const g of ['c1', 'e1', 's1'] as GearId[]) s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: g }]);
  s.supplies.beans = 60;
  s.supplies.milk = 60;
  s.supplies.concentrate = 30;
  s = startDay(s);
  s.players[0].connected = false; // the host is away: only the stand-ins work
  while (s.phase === 'day') s = step(s, []);
  return s;
}

// Batch/pickup fix round 1. Before the fix, four Gear bots each prepped cold brew at once (the tap pours instantly,
// so nothing counted the planned cups), filled all four pickup slots with cups nobody had ordered (600 s to go
// stale), then binned every drink they made: 11 and 17 served, 14 and 11 binned on these seeds. The bar (one pod
// machine, one steamer) is the limit here: one bot alone serves 22-24.
describe('fix round 1: four bots on the stand keep the pickup counter moving', () => {
  for (const seed of [101, 103]) {
    it(`seed ${seed}: four stand-ins on a busy stand day serve at least 20 and bin almost nothing`, () => {
      const s = standDay(4, seed);
      const day = s.days[s.days.length - 1] ?? s.today;
      expect(day.served).toBeGreaterThanOrEqual(20);
      expect(day.wasted ?? 0).toBeLessThanOrEqual(2);
    });
  }
});
