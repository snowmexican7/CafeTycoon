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
  it('ringing up moves the customer to pickup with +50% patience, in line order', () => {
    const s = day(true);
    s.customers = [];
    const a = cust(s, 901), b = cust(s, 902);
    b.patienceLeft = 20;
    expect(TILL.patienceBoost).toBe(0.5);
    counterInteract(s, 'p1');
    expect(a.rungAt).toBe(s.tick);
    expect(a.stage).toBe('pickup');
    expect(a.patienceLeft).toBe(100);
    expect(b.rungAt).toBeUndefined();
    expect(b.stage ?? 'order').toBe('order');
    counterInteract(s, 'p1');
    expect(b.rungAt).toBe(s.tick);
    expect(b.stage).toBe('pickup');
    expect(b.patienceLeft).toBe(70);
    expect(tillNext(s)).toBeUndefined();
    const rung = s.log.filter((e) => e.kind === 'till.rung');
    expect(rung).toHaveLength(2);
    expect(rung[0].data).toMatchObject({ customer: 901, drink: 'coldBrew', by: 'p1' });
    const quirk = s.log.filter((e) => e.kind === 'gear.quirk').map((e) => String(e.data.text));
    expect(quirk[0]).toMatch(/Set it on the pickup counter fast for a tip\.$/);
  });
  it('the till skips campers, upset customers and anyone already at pickup; classic never rings', () => {
    const s = day(true);
    s.customers = [];
    const camper = cust(s, 910);
    camper.egg = 'camper';
    const upset = cust(s, 911);
    upset.upset = { ticksLeft: 100 };
    const atPickup = cust(s, 912);
    atPickup.stage = 'pickup';
    const rung = cust(s, 913);
    rung.rungAt = s.tick;
    expect(tillNext(s)).toBeUndefined();
    const next = cust(s, 914);
    expect(tillNext(s)).toBe(next);
    const c = day(false);
    c.customers = [];
    cust(c, 915);
    expect(tillNext(c)).toBeUndefined();
  });
  it('a player with a tool in hand cannot ring', () => {
    const s = day(true);
    s.customers = [];
    const c = cust(s, 920);
    s.players[0].tool = 'mop';
    counterInteract(s, 'p1');
    expect(c.rungAt).toBeUndefined();
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
  it('classic runs never ring', () => {
    const s = day(false);
    s.customers = [];
    const c = cust(s, 903);
    counterInteract(s, 'p1');
    expect(c.rungAt).toBeUndefined();
  });
  it('bots ring too', () => {
    const g = day(true);
    g.customers = [];
    const d = cust(g, 904);
    g.players[0].bot = {} as never;
    counterInteract(g, 'p1');
    expect(d.rungAt).toBe(g.tick);
    expect(d.stage).toBe('pickup');
    expect(g.log.some((e) => e.kind === 'till.rung' && e.data.by === 'p1')).toBe(true);
  });
  it('co-op pick night shows the two-cheap-machines hint; solo does not', () => {
    expect(gearVM(createRun(opts(true, 2))).coopHint).toMatch(/Two cheap machines/);
    expect(gearVM(createRun(opts(true, 1))).coopHint).toBeUndefined();
  });
});
