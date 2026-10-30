import { describe, expect, it } from 'vitest';
import { createRun, startDay } from '../sim/run';
import { stationsFromSlots } from '../sim/slots';
import { ECONOMY } from '../data/economy';
import { TICK_RATE } from '../sim/constants';
import { layoutFor } from '../data/layout';
import { GEAR, type GearId } from '../data/gear';
import type { Customer, GameState } from '../sim/types';
import { counterName, handHint, hudLive, ordersKey } from './live';
import { ticketSteps, ticketsHtml } from './tickets';

function gearDay(gear: GearId[] = ['c1', 'e1']): GameState {
  const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear: true });
  const slots = [...s.slots!];
  const slotGear = [...s.slotGear!];
  gear.forEach((id, i) => { slots[i] = GEAR[id].station; slotGear[i] = id; });
  s.slots = slots;
  s.slotGear = slotGear;
  s.stations = stationsFromSlots(s.tier, slots, slotGear);
  return startDay(s);
}
const at = (s: GameState, id: string) => { s.players[0].pos = { ...s.stations.find((x) => x.id === id)!.pos }; };
const cust = (id: number, drink: Customer['drink'], more: Partial<Customer> = {}): Customer => ({ id, drink, patienceLeft: 900, patienceMax: 1800, ...more });
const put = (s: GameState, drink: Customer['drink']) => s.pass.push({ item: drink, ticksLeft: ECONOMY.pass.staleSeconds[drink] * TICK_RATE, by: 'p1' });

describe('Gear counter hints (3.3.1)', () => {
  it('names the three spots', () => {
    expect(counterName({ id: 'counter' })).toBe('Till');
    expect(counterName({ id: 'pickup' })).toBe('Pickup counter');
    expect(counterName({ id: 'condiments' })).toBe('Condiment bar');
  });

  it('the till rings up with empty hands, also when a cup on the counter matches (that is when it helps)', () => {
    const s = gearDay();
    s.customers = [cust(1, 'coldBrew')];
    at(s, 'counter');
    let h = handHint(s, 'p1');
    expect(h.go).toBe(true);
    expect(h.title).toMatch(/^Ring up/);
    expect(h.detail).not.toMatch(/hand it off/i);
    put(s, 'coldBrew');
    h = handHint(s, 'p1');
    expect(h.go).toBe(true);
    expect(h.title).toMatch(/^Ring up/);
    expect(h.detail).toMatch(/already on the counter/);
    s.customers[0].stage = 'pickup';
    s.customers[0].rungAt = 0;
    expect(handHint(s, 'p1')).toMatchObject({ go: false, title: 'Nobody to ring up' });
  });

  it('a drink in hand at any counter spot is set on the pickup counter, never handed off', () => {
    const s = gearDay();
    s.customers = [cust(1, 'coldBrew', { stage: 'pickup', rungAt: 0 })];
    s.players[0].holding = 'coldBrew';
    for (const id of ['counter', 'pickup', 'condiments']) {
      at(s, id);
      const h = handHint(s, 'p1');
      expect(h).toMatchObject({ go: true, title: 'Set on the pickup counter' });
      expect(`${h.title} ${h.detail}`).not.toMatch(/hand/i);
    }
    for (let i = 0; i < 4; i++) put(s, 'espresso');
    expect(handHint(s, 'p1')).toMatchObject({ go: false, title: 'Pickup counter is full' });
  });

  it('empty hands at the pickup counter take a cup back', () => {
    const s = gearDay();
    at(s, 'pickup');
    expect(handHint(s, 'p1').go).toBe(false);
    put(s, 'drip');
    expect(handHint(s, 'p1')).toMatchObject({ go: true, title: 'Take a cup back' });
  });

  it('the condiment bar takes a box; the corner hands one out', () => {
    const s = gearDay();
    s.condiments = { servings: 3 };
    at(s, 'condiments');
    expect(handHint(s, 'p1').title).toBe('Bar is running low');
    s.condiments.servings = 0;
    expect(handHint(s, 'p1').title).toMatch(/empty: bring a box/);
    s.players[0].tool = 'box';
    expect(handHint(s, 'p1')).toMatchObject({ go: true, title: 'Refill the condiment bar' });
    s.condiments.servings = 20;
    expect(handHint(s, 'p1').go).toBe(false);
    at(s, 'counter');
    expect(handHint(s, 'p1').title).toBe('Carry the box to the condiment bar');
    s.players[0].tool = null;
    s.condimentBoxes = 2;
    s.players[0].pos = { ...layoutFor(s.tier).boxCorner };
    expect(handHint(s, 'p1')).toMatchObject({ go: true, title: 'Pick up a condiment box' });
  });

  it('classic keeps its hand-off hint', () => {
    const s = startDay(createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } }));
    at(s, 'counter');
    s.players[0].holding = 'espresso';
    expect(handHint(s, 'p1').title).toBe('Hand off espresso');
  });

  it('tickets end in "Pickup" in Gear and mark customers at pickup', () => {
    expect(ticketSteps('latte', false, true).at(-1)).toBe('Pickup');
    expect(ticketSteps('latte').at(-1)).toBe('Hand off');
    expect(ticketSteps('latte', true, true)).toEqual(['Pod', 'Steam', 'Pickup']);
    const s = gearDay();
    s.customers = [cust(1, 'drip'), cust(2, 'latte', { stage: 'pickup', rungAt: 0 })];
    const l = hudLive(s, 'p1');
    expect(l.gear).toBe(true);
    expect(l.orders.map((o) => o.pickup ?? false)).toEqual([false, true]);
    const before = ordersKey(l);
    s.customers[0].stage = 'pickup';
    expect(ordersKey(hudLive(s, 'p1'))).not.toBe(before);
    const html = ticketsHtml(l.orders, { mode: 'always', open: new Set(), day: 2, holding: null, prices: {}, gear: true });
    expect(html).toContain('At pickup');
    expect(html).not.toContain('Hand off');
  });
});
