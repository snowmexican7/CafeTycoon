import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { serveCustomer } from './customers';
import { counterInteract } from './pass';
import { stepPickup } from './pickup';
import type { GameState } from './types';

const run = (): GameState => {
  const s = createRun({ seed: 9, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear: true });
  startDay(s);
  return s;
};
const cust = (s: GameState) => ({ id: 99, kind: 'normal', drink: 'drip', patienceLeft: 100, patienceMax: 100, pos: { x: 0, y: 0 } }) as unknown as GameState['customers'][number];

describe('Gear G4h: too hot / too cold = half tip', () => {
  it('a temp-missed cup tips half of an identical good one', () => {
    const a = run(); const b = run();
    const ca = cust(a); const cb = cust(b);
    a.customers.push(ca); b.customers.push(cb);
    serveCustomer(a, ca, 'drip', 'p1', 0, false);
    serveCustomer(b, cb, 'drip', 'p1', 0, true);
    expect(a.today.tips).toBeGreaterThan(0);
    expect(b.today.tips).toBeCloseTo(Math.round((a.today.tips / 2) * 100) / 100, 2);
  });

  it('the miss travels with the cup through the pass and clears after serving', () => {
    const s = run();
    const p = s.players[0];
    p.holding = 'drip'; p.cupTemp = true;
    s.customers = [];
    counterInteract(s, 'p1');
    expect(s.pass[0]?.temp).toBe(true);
    expect(p.cupTemp).toBeUndefined();
    // Batch/pickup: empty hands take a cup back at the pickup counter (the till rings up instead).
    counterInteract(s, 'p1', s.stations.find((x) => x.id === 'pickup'));
    expect(p.holding).toBe('drip');
    expect(p.cupTemp).toBe(true);
    // Set down again, a rung customer takes it: half tip, as a hand-served miss did.
    counterInteract(s, 'p1');
    const a = run();
    const ca = cust(a);
    a.customers.push(ca);
    serveCustomer(a, ca, 'drip', 'p1', 0, true);
    s.customers.push({ ...cust(s), stage: 'pickup' });
    stepPickup(s);
    expect([s.today.served, s.today.tips, s.pass.length]).toEqual([1, a.today.tips, 0]);
  });
});
