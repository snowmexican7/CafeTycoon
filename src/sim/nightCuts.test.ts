import { describe, it, expect } from 'vitest';
import { createRun } from './run';
import { step } from './step';
import { validateInput } from './validate';
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
];

describe('cut night inputs: roles and re-roll', () => {
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
});
