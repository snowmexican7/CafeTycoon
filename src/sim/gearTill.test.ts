import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { applyGearInput } from './gear';
import { counterInteract } from './pass';
import { serveCustomer } from './customers';
import { TILL, tillNext, tillSpeedTip } from './till';
import { TICK_RATE } from './constants';
import { gearVM } from '../ui/gearVM';
import type { CreateRunOptions, Customer, GameState } from './types';

const opts = (gear: boolean, players = 1): CreateRunOptions => ({ seed: 7, hostId: 'p1', players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` })), settings: { bots: 0 }, tier: 'stand', gear });
const day = (gear: boolean) => {
  const s = createRun(opts(gear));
  if (gear) applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'c1' });
  startDay(s);
  return s;
};
const cust = (s: GameState, id: number): Customer => {
  const c: Customer = { id, drink: 'coldBrew', patienceLeft: 50, patienceMax: 100 };
  s.customers.push(c);
  return c;
};

describe('Gear G4g: the till is a job', () => {
  it('empty hands at the counter ring up the next customer: patience up, one at a time, in line order', () => {
    const s = day(true);
    s.customers = [];
    const a = cust(s, 901), b = cust(s, 902);
    counterInteract(s, 'p1');
    expect(a.rungAt).toBe(s.tick);
    expect(a.patienceLeft).toBe(75);
    expect(b.rungAt).toBeUndefined();
    counterInteract(s, 'p1');
    expect(b.rungAt).toBe(s.tick);
    expect(tillNext(s)).toBeUndefined();
  });
  it('fast hand-off pays a speed tip; slow or never rung pays none', () => {
    const s = day(true);
    const c: Customer = { id: 1, drink: 'coldBrew', patienceLeft: 1, patienceMax: 1, rungAt: s.tick };
    expect(tillSpeedTip(s, c)).toBe(TILL.fast.tip);
    s.tick += 45 * TICK_RATE;
    expect(tillSpeedTip(s, c)).toBe(TILL.ok.tip);
    s.tick += 30 * TICK_RATE;
    expect(tillSpeedTip(s, c)).toBe(0);
    expect(tillSpeedTip(s, { ...c, rungAt: undefined })).toBe(0);
  });
  it('serving a freshly rung customer earns exactly the speed tip more than an unrung one', () => {
    const tipFor = (ring: boolean) => {
      const s = day(true);
      s.customers = [];
      const c = cust(s, 900);
      if (ring) counterInteract(s, 'p1');
      c.patienceLeft = 50;
      const before = s.today.tips;
      serveCustomer(s, c, 'coldBrew', 'p1');
      return s.today.tips - before;
    };
    expect(tipFor(true) - tipFor(false)).toBeCloseTo(TILL.fast.tip, 2);
  });
  it('classic runs and bots never ring', () => {
    const s = day(false);
    s.customers = [];
    const c = cust(s, 903);
    counterInteract(s, 'p1');
    expect(c.rungAt).toBeUndefined();
    const g = day(true);
    g.customers = [];
    const d = cust(g, 904);
    g.players[0].bot = {} as never;
    counterInteract(g, 'p1');
    expect(d.rungAt).toBeUndefined();
  });
  it('co-op pick night shows the two-cheap-machines hint; solo does not', () => {
    expect(gearVM(createRun(opts(true, 2))).coopHint).toMatch(/Two cheap machines/);
    expect(gearVM(createRun(opts(true, 1))).coopHint).toBeUndefined();
  });
});
