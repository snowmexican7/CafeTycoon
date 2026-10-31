import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { finishDay } from './closing';
import { step } from './step';
import { validateInput } from './validate';
import { defaultSlots } from './slots';
import type { PlayerInput } from './types';

/**
 * Round 4 f follow-up (Kennedy 2026-10-31): crew roles, card re-rolls and the classic Stations/slots are cut. Their
 * input kinds stay in `PlayerInput` only so the UI still compiles; `validateInput` refuses them, so they do nothing.
 */
const gearNight = () => createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear: true });
const deprecated: PlayerInput[] = [
  { kind: 'role', playerId: 'p1', role: 'manager' },
  { kind: 'role', playerId: 'p1', role: null },
  { kind: 'reroll', playerId: 'p1' },
  { kind: 'slot', playerId: 'p1', index: 0, station: 'grinder' },
  { kind: 'slot', playerId: 'p1', index: 0, station: null },
  { kind: 'equip', playerId: 'p1', station: 'grinder' },
];
const classicNight = () => createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });

describe('cut night inputs: roles, re-roll, classic slot and equip', () => {
  it('validateInput refuses every one of them', () => {
    for (const input of deprecated) expect(validateInput(input)).toBeNull();
  });

  it('sending them changes nothing: no cash spent, no hand re-dealt, no role, no slot moved', () => {
    const s = gearNight();
    s.cash = 500;
    for (const input of deprecated) {
      const t = step(s, [input]);
      expect(t.cash).toBe(500);
      expect(t.hand).toEqual(s.hand);
      expect(t.slots).toEqual(s.slots);
      expect(t.players[0]).toEqual(s.players[0]);
    }
  });

  it('the run state has no re-roll count and a barista has no role', () => {
    const s = gearNight();
    expect('rerolls' in s).toBe(false);
    expect('role' in s.players[0]!).toBe(false);
  });

  it('a classic (test-only) run has no stations shop either: no equipment kept aside, nothing bought', () => {
    const s = classicNight();
    s.cash = 500;
    const slots = [...s.slots!];
    for (const input of deprecated.filter((i) => i.kind === 'slot' || i.kind === 'equip')) {
      const t = step(s, [input]);
      expect([t.cash, t.slots]).toEqual([500, slots]);
      expect('equipment' in t || 'equipLog' in t).toBe(false);
    }
  });

  it('growing a classic run lays out the bigger shop with its default stations', () => {
    const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand' });
    s.cash = 5000;
    const t = step(s, [{ kind: 'grow', playerId: 'p1', tier: 'cart' }]);
    expect(t.tier).toBe('cart');
    expect(t.slots).toEqual(defaultSlots('cart'));
    expect(t.stations.filter((x) => x.kind !== 'counter').map((x) => x.kind)).toEqual(defaultSlots('cart').filter((k) => k !== null));
    expect('equipment' in t).toBe(false);
  });
});

describe('Round 4 f item 4: growing from the end-of-day receipt', () => {
  it('the grow input works on the very first tick of the night (the receipt shows at night start)', () => {
    let s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear: true });
    s = startDay(s);
    s.challenges = [];
    s.phase = 'closing';
    const night = finishDay(s);
    expect(night.phase).toBe('night');
    night.cash = 5000;
    const t = step(night, [{ kind: 'grow', playerId: 'p1', tier: 'cart' }]);
    expect(t.tier).toBe('cart');
    expect(t.log.filter((e) => e.kind === 'grow.done').map((e) => e.data.to)).toEqual(['cart']);
  });
});
