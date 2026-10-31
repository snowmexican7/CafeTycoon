import { describe, it, expect } from 'vitest';
import { createRun, startDay } from '../run';
import { step } from '../step';
import { think } from './brain';
import { addStandIns } from './roster';
import type { GearId } from '../../data/gear';
import type { Customer, GameState, Player } from '../types';

// FB2 balance pass (ported from B6, commit 46055b2 on fb2-b6-orders): two Gear bot fixes for the chain-drop stall.
// In p4 traces on main a dropped chain left a shot in the espresso machine for 20-90 s on 9 of 335 days, and those
// days went 78 served / 141 lost.

/** A stocked Gear stand with `gear` bought, `bots` stand-ins and no walk-ins; the host is off the floor. */
function gearStand(gear: GearId[], bots = 1): GameState {
  let s = createRun({ seed: 101, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 150 }, tier: 'stand', gear: true });
  addStandIns(s, bots);
  for (const g of gear) s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: g }]);
  s.supplies.beans = 40;
  s.supplies.concentrate = 20;
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  s = startDay(s);
  s.eventSchedule = [];
  s.players[0].pos = { x: 10, y: 5 };
  s.players[0].connected = false; // nobody on the floor: the bots are the crew
  return s;
}
const sim = (s: GameState, n = 1): Player => s.players.find((p) => p.id === `sim-${n}`)!;
const single = (id: number): Customer => ({ id, drink: 'espresso', patienceLeft: 1e5, patienceMax: 1e5, stage: 'pickup', rungAt: id });

describe('Gear bots and dropped chains (FB2 balance, from B6)', () => {
  it('a lost claim carries over to someone else waiting for the same drink, keeping the chain', () => {
    const s = gearStand(['c1', 'e1']);
    // Mid-chain: its shot is brewing; customer 1 got another cup and left, customer 2 still waits for one.
    s.customers = [single(2)];
    const machine = s.stations.find((x) => x.kind === 'espresso')!;
    Object.assign(machine, { busyTicksLeft: 300, busyTotal: 300, making: 'espresso' });
    const plan = [{ kind: 'use', station: machine.id, action: 'take' }, { kind: 'use', station: 'pickup', action: 'put' }] as const;
    Object.assign(sim(s).bot!, { plan: [...plan], claim: 1, claimDrink: 'espresso' });
    const after = step(s, []);
    expect(sim(after).bot!.claim).toBe(2);
    expect(sim(after).bot!.plan).toEqual(plan);
    // Nobody left wanting one: the claim and the chain are dropped.
    after.customers = [];
    expect(sim(step(after, [])).bot!.claim).toBeNull();
  });

  it('grounds left in a grinder by a dropped chain are collected once they have sat', () => {
    const s = gearStand(['g2', 'e2']);
    const grinder = s.stations.find((x) => x.kind === 'grinder')!;
    expect(grinder).toBeDefined();
    Object.assign(grinder, { output: 'grounds', outputSince: s.tick });
    s.customers = [single(1)];
    // Fresh grounds count as the shot on its way for the espresso order: nothing to do yet.
    expect(think(s, sim(s))).toEqual([{ kind: 'idle', node: expect.anything() }]);
    s.tick += 15 * 60;
    expect(think(s, sim(s))).toEqual([{ kind: 'use', station: grinder.id, action: 'take' }]);
  });
});
