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

describe('sink and pot hints (3.3.3, FB2 A3)', () => {
  const drip = (): GameState => {
    const s = gearDay(['d1', 'e1']);
    s.unlocked = [...(s.unlocked ?? []), 'drip'];
    s.menu.drip = true;
    return s;
  };
  const below = (s: GameState, id: string) => { const p = s.stations.find((x) => x.id === id)!.pos; s.players[0].pos = { x: p.x, y: p.y + 1 }; };
  const atSink = (s: GameState) => { const p = s.stations.find((x) => x.id === 'sink')!.pos; s.players[0].pos = { x: p.x - 1, y: p.y }; };

  it('names the back sink', () => {
    expect(counterName({ id: 'sink' })).toBe('Back sink');
  });

  it('a stale pot says lift it with empty hands, and wait with full ones', () => {
    const s = drip();
    const d = s.stations.find((x) => x.id === 'drip')!;
    d.stale = true;
    below(s, 'drip');
    expect(handHint(s, 'p1')).toMatchObject({ go: true, title: 'Stale pot: lift the pot (E)' });
    expect(handHint(s, 'p1').detail).toMatch(/sink/);
    s.players[0].holding = 'latte';
    expect(handHint(s, 'p1')).toMatchObject({ go: false, title: 'Stale pot: empty hands to lift it' });
  });

  it('a cold pot no longer offers a pour', () => {
    const s = drip();
    const d = s.stations.find((x) => x.id === 'drip')!;
    d.output = 'drip';
    d.potLeft = 3;
    d.potColdAt = s.tick - 1;
    below(s, 'drip');
    expect(handHint(s, 'p1').title).toBe('Pot went cold: lift the pot (E)');
    d.potColdAt = s.tick + 9999;
    expect(handHint(s, 'p1').title).toBe('Pour a cup of drip');
  });

  it('carrying the pot points at the sink, then says dump it there', () => {
    const s = drip();
    s.players[0].tool = 'pot';
    s.stations.find((x) => x.id === 'drip')!.potOut = 'p1';
    below(s, 'drip');
    expect(handHint(s, 'p1')).toMatchObject({ go: false, title: 'Carry it to the sink' });
    expect(hudLive(s, 'p1').tool).toMatchObject({ label: 'Old drip pot' });
    atSink(s);
    expect(handHint(s, 'p1')).toMatchObject({ go: true, title: 'Dump the pot' });
  });

  it('at the sink: nothing with empty hands, dump a cold cup, warn on a warm one, grounds go in the bin', () => {
    const s = drip();
    atSink(s);
    expect(handHint(s, 'p1')).toMatchObject({ go: false, title: '' });
    s.players[0].holding = 'drip';
    s.players[0].heldSince = s.tick;
    expect(handHint(s, 'p1').title).toBe('Dump it');
    s.tick += 10_000;
    expect(handHint(s, 'p1')).toMatchObject({ go: true, title: 'Dump it: the drip coffee went cold' });
    expect(hudLive(s, 'p1').heldCold).toBe(true);
    s.players[0].holding = 'grounds';
    expect(handHint(s, 'p1')).toMatchObject({ go: false, title: 'Grounds go in the bin' });
  });

  it('a cold cup elsewhere adds "dump it at the sink"; take-back names the cold cup', () => {
    const s = drip();
    s.players[0].holding = 'drip';
    s.players[0].heldSince = s.tick - 10_000;
    at(s, 'pickup');
    expect(handHint(s, 'p1').detail).toMatch(/cold: dump it at the sink/);
    s.players[0].holding = null;
    s.players[0].heldSince = undefined;
    s.pass.push({ item: 'drip', ticksLeft: 999, by: 'p1', madeAt: s.tick - 10_000 });
    expect(handHint(s, 'p1')).toMatchObject({ go: true, title: 'Take back the cold drip coffee' });
  });
});

describe('Play solo helper picker (3.3.3, FB2 A1)', () => {
  it('draws Off / 1 / 2 with the stored choice checked, and reads it back', async () => {
    const { readSoloBots, soloBotsSeg } = await import('./title');
    const html = soloBotsSeg(1);
    expect(html).toMatch(/value="0"[^>]*><span>Off/);
    expect(html).toMatch(/value="1" checked/);
    expect(html).toMatch(/2 bots/);
    expect(soloBotsSeg('auto')).not.toMatch(/checked/);
    expect(readSoloBots('0')).toBe(0);
    expect(readSoloBots('2')).toBe(2);
    expect(readSoloBots('3')).toBeUndefined();
    expect(readSoloBots(undefined)).toBeUndefined();
    expect(readSoloBots('')).toBeUndefined();
  });
});

describe('3.3.5: no "tap" in cold brew wording (Kennedy found it confusing)', () => {
  it('step words and station names say cold brew, not tap', async () => {
    const { DRINK_STEPS, STATION_NAME } = await import('./live');
    const words = [...Object.values(DRINK_STEPS).flat(), ...Object.values(STATION_NAME)];
    expect(words.filter((w) => /\btaps?\b/i.test(w))).toEqual([]);
    expect(DRINK_STEPS.coldBrew[0]).toBe('Pour cold brew');
  });
});
