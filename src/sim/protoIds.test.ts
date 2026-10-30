import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { serveCustomer } from './customers';
import { step } from './step';
import type { GameState } from './types';

const run = (): GameState => {
  const s = createRun({ seed: 9, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear: true });
  startDay(s);
  return s;
};
const cust = () => ({ id: 99, kind: 'normal', drink: 'drip', patienceLeft: 100, patienceMax: 100, pos: { x: 0, y: 0 } }) as unknown as GameState['customers'][number];

describe('review I4: player ids can not reach Object.prototype', () => {
  it('a join with a prototype-ish id is refused', () => {
    for (const id of ['__proto__', 'constructor', 'prototype']) {
      const s = step(run(), [{ kind: 'join', playerId: id, name: 'Eve' }]);
      expect(s.players.some((p) => p.id === id)).toBe(false);
      expect(s.players).toHaveLength(1);
    }
  });

  it('serving as a player id of __proto__ leaves Object.prototype alone', () => {
    const s = run();
    const c = cust();
    s.customers.push(c);
    serveCustomer(s, c, 'drip', '__proto__', 0, false);
    expect(({} as Record<string, unknown>).serves).toBeUndefined();
    expect(({} as Record<string, unknown>).takings).toBeUndefined();
    expect(Object.keys(s.today.byPlayer ?? {})).not.toContain('__proto__');
    // ordinary ids still tally
    const d = cust();
    s.customers.push(d);
    serveCustomer(s, d, 'drip', 'p1', 0, false);
    expect(s.today.byPlayer?.p1?.serves).toBe(1);
  });
});
