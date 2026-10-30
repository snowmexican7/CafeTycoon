import { describe, it, expect } from 'vitest';
import { createRun } from './run';
import { step } from './step';
import { stationsFromSlots } from './slots';
import { applyGearInput, podsOnly } from './gear';
import { addStandIns } from './bots/roster';
import { chainFor } from './bots/brain';
import { gearVM } from '../ui/gearVM';
import { hudLive } from '../ui/live';
import { nextStepIndex, ticketSteps, ticketsHtml, ticketsKey, type TicketOpts } from '../ui/tickets';
import type { GearId } from '../data/gear';
import type { GameState, StationKind } from './types';

// Integration smoke (2026-10-30): a Spice grinder bought next to the Pod-o-Matic made the bots grind
// beans the pod machine refuses, so espresso sales dropped to zero. These pin the fix.
const run = (seed = 3): GameState =>
  createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 150, nightLengthSec: 4 }, tier: 'stand', gear: true });
const kit = (s: GameState, gear: (GearId | null)[]) => {
  const kinds = gear.map((g) => (g === null ? null : g[0] === 'c' ? 'coldBrewTap' : g[0] === 'e' ? 'espresso' : g[0] === 'g' ? 'grinder' : 'trash')) as (StationKind | null)[];
  s.slotGear = gear;
  s.slots = kinds as never;
  s.stations = stationsFromSlots('stand', kinds as never, gear);
};
const STOCK = { beans: 60, milk: 60, concentrate: 60, flavour: 0, pastry: 0 };

function espressoSold(gear: (GearId | null)[], seed: number): number {
  let s = run(seed);
  s.players = [];
  addStandIns(s, 1);
  let last = '';
  let guard = 0;
  while (s.days.length < 1 && guard++ < 200000) {
    if (s.phase !== last) { kit(s, gear); s.supplies = { ...STOCK }; }
    last = s.phase;
    s = step(s, []);
  }
  return s.days[0]?.drinks?.espresso ?? 0;
}

describe('Smoke fix: a grinder beside a pod-only espresso bar', () => {
  it('podsOnly is true only when every espresso machine is a pod machine', () => {
    const s = run();
    kit(s, ['c1', 'e1', 'g1', 'b0']);
    expect(podsOnly(s)).toBe(true);
    kit(s, ['e1', 'e2', 'g1', 'b0']);
    expect(podsOnly(s)).toBe(false);
    kit(s, ['c1', null, 'g1', 'b0']);
    expect(podsOnly(s)).toBe(false);
  });
  it('the bot chain for an espresso skips the grinder', () => {
    const s = run();
    kit(s, ['c1', 'e1', 'g1', 'b0']);
    s.players = [];
    addStandIns(s, 1);
    const chain = chainFor(s, s.players[0]!, 'espresso', 'serve');
    expect(chain.length).toBeGreaterThan(0);
    const kinds = chain.map((st) => (st.kind === 'use' ? s.stations.find((x) => x.id === st.station)?.kind ?? st.station : st.kind));
    expect(kinds).not.toContain('grinder');
  });
  it('bots sell espresso with the grinder installed as well as without it', () => {
    for (const seed of [1, 2]) {
      const without = espressoSold(['c1', 'e1', null, 'b0'], seed);
      const withG = espressoSold(['c1', 'e1', 'g1', 'b0'], seed);
      expect(without).toBeGreaterThan(0);
      expect(withG).toBeGreaterThanOrEqual(Math.floor(without * 0.8));
    }
  });
  it('tickets show one Pod step instead of Grind + Pull, and the HUD passes the flag', () => {
    expect(ticketSteps('latte', true)).toEqual(['Pod', 'Steam', 'Hand off']);
    expect(ticketSteps('latte', false)).toEqual(['Grind', 'Pull', 'Steam', 'Hand off']);
    expect(ticketSteps('coldBrew', true)).toEqual(['Tap', 'Hand off']);
    expect(nextStepIndex('latte', 'espresso', true)).toBe(1);
    expect(nextStepIndex('espresso', 'espresso', true)).toBe(1); // holding the drink itself: hand it off
    expect(nextStepIndex('cappuccino', 'latte', true)).toBe(2);
    expect(nextStepIndex('latte', 'grounds', true)).toBeNull();
    const o: TicketOpts = { mode: 'always', open: new Set(), day: 2, holding: null, prices: {}, pods: true };
    const html = ticketsHtml([{ id: 1, drink: 'espresso', patience: 1 }], o);
    expect(html).toContain('<span class="next">Pod</span>');
    expect(html).not.toContain('Grind');
    expect(ticketsHtml([], o)).toContain('Tidy up');
    expect(ticketsKey('k', o)).not.toBe(ticketsKey('k', { ...o, pods: false }));
    const s = run();
    kit(s, ['c1', 'e1', 'g1', 'b0']);
    expect(hudLive(s, 'p1').pods).toBe(true);
    kit(s, ['c1', 'e2', 'g1', 'b0']);
    expect(hudLive(s, 'p1').pods).toBeUndefined();
  });
  it('the gear tab warns that the pod machine does not use the grinder', () => {
    const s = run();
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'e1' });
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'g1' });
    expect(gearVM(s).note).toMatch(/pods, not grounds/);
  });
});
