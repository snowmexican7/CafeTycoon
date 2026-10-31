import { describe, expect, it } from 'vitest';
import { createRun, startDay } from '../sim/run';
import { stationsFromSlots } from '../sim/slots';
import { GEAR, type GearId } from '../data/gear';
import { TICK_RATE } from '../sim/constants';
import { COOLING_SECONDS } from '../sim/cooling';
import type { GameState, StationKind } from '../sim/types';
import {
  passTraySlots,
  trayBursts,
  trayCustomerLabel,
  trayDoneMark,
  trayInHand,
  trayListLine,
  trayRefuseLine,
  trayTableView,
  trayToolLabel,
} from './trayModel';

function gearDay(): GameState {
  const kits: (GearId | 'steamer')[] = ['c1', 'e1', 'steamer', 'd1'];
  const s = createRun({
    seed: 7,
    hostId: 'p1',
    players: [
      { id: 'p1', name: 'Ana' },
      { id: 'p2', name: 'Ben' },
    ],
    settings: { bots: 0 },
    tier: 'cart',
    gear: true,
  });
  const slots: (StationKind | null)[] = [...s.slots!];
  const slotGear: (GearId | null)[] = [...s.slotGear!];
  kits.forEach((id, i) => {
    slots[i] = id === 'steamer' ? 'steamer' : GEAR[id].station;
    slotGear[i] = id === 'steamer' ? null : id;
  });
  s.slots = slots;
  s.slotGear = slotGear;
  s.stations = stationsFromSlots(s.tier, slots, slotGear);
  s.day = 2;
  return startDay(s);
}

const clone = <T>(x: T): T => structuredClone(x);

function withLog(s: GameState, ...kinds: { kind: GameState['log'][number]['kind']; data?: GameState['log'][number]['data'] }[]): GameState {
  const n = clone(s);
  for (const e of kinds) n.log.push({ seq: n.nextLogSeq++, tick: n.tick, kind: e.kind, data: e.data ?? {} });
  return n;
}

describe('trayModel (FB2 B7 rest)', () => {
  it('trayCustomerLabel prefers a name, else #id', () => {
    const s = gearDay();
    s.customers = [{ id: 9, drink: 'latte', patienceLeft: 100, patienceMax: 100, name: 'Ada', stage: 'pickup' }];
    expect(trayCustomerLabel(s, 9)).toBe('Ada');
    expect(trayCustomerLabel(s, 42)).toBe('#42');
  });

  it('trayTableView lists done ticks, cool on done cups, and a customer label', () => {
    const s = gearDay();
    s.customers = [{ id: 7, drink: 'latte', patienceLeft: 900, patienceMax: 1200, name: 'June', stage: 'pickup', order: 'combo', items: [
      { drink: 'latte', done: false },
      { drink: 'espresso', done: false },
    ] }];
    s.tray = {
      customer: 7,
      items: [
        { drink: 'latte', done: true, madeAt: s.tick },
        { drink: 'espresso', done: false },
      ],
    };
    const v = trayTableView(s)!;
    expect(v.label).toBe('June');
    expect(v.done).toBe(1);
    expect(v.total).toBe(2);
    expect(v.complete).toBe(false);
    expect(v.items[0]).toMatchObject({ drink: 'latte', done: true });
    expect(v.items[0]!.cool).toBeGreaterThanOrEqual(0);
    expect(v.items[0]!.cool).toBeLessThan(0.2);
    expect(v.items[1]).toMatchObject({ drink: 'espresso', done: false, cool: null });
    expect(trayListLine(v)).toContain('✓Latte');
    expect(trayListLine(v)).toContain('○Espresso');
    expect(trayDoneMark(true)).toBe('✓');
    expect(trayDoneMark(false)).toBe('○');

    s.tray.items[1] = { drink: 'espresso', done: true, madeAt: s.tick };
    expect(trayTableView(s)!.complete).toBe(true);
    expect(trayTableView({ ...s, gear: undefined })).toBeNull();
    const empty = clone(s);
    delete empty.tray;
    expect(trayTableView(empty)).toBeNull();
  });

  it('tray cups cool via trayCool (fresh → colder with age)', () => {
    const s = gearDay();
    s.customers = [{ id: 3, drink: 'latte', patienceLeft: 100, patienceMax: 100, stage: 'pickup' }];
    s.tray = {
      customer: 3,
      items: [
        { drink: 'latte', done: true, madeAt: s.tick },
        { drink: 'latte', done: true, madeAt: s.tick - Math.round(COOLING_SECONDS.latte! * TICK_RATE) },
      ],
    };
    const v = trayTableView(s)!;
    expect(v.items[0]!.cool!).toBeLessThan(0.15);
    expect(v.items[1]!.cool!).toBe(1);
  });

  it('trayInHand and trayToolLabel read Player.tool tray', () => {
    const s = gearDay();
    s.customers = [{ id: 11, drink: 'latte', patienceLeft: 100, patienceMax: 100, name: 'Ravi', stage: 'pickup' }];
    const p = s.players[0]!;
    p.tool = 'tray';
    p.tray = {
      customer: 11,
      items: [
        { drink: 'latte', done: true, madeAt: s.tick },
        { drink: 'espresso', done: true, madeAt: s.tick },
      ],
    };
    const hand = trayInHand(s, p)!;
    expect(hand).toMatchObject({ customer: 11, label: 'Ravi', drinks: ['latte', 'espresso'] });
    expect(hand.cool).toHaveLength(2);
    expect(trayToolLabel(s, p)).toEqual({ label: 'Tray · Ravi · 2 cups', icon: '🍽️' });
    p.tool = 'mop';
    expect(trayInHand(s, p)).toBeNull();
    expect(trayToolLabel(s, p)).toBeNull();
  });

  it('passTraySlots names the customer on a PassItem.tray coaster', () => {
    const s = gearDay();
    s.customers = [{ id: 5, drink: 'latte', patienceLeft: 100, patienceMax: 100, name: 'Bo', stage: 'pickup' }];
    s.pass = [
      { item: 'latte', ticksLeft: 999, tray: { customer: 5, drinks: [{ drink: 'latte', madeAt: s.tick }, { drink: 'mocha', madeAt: s.tick }] } },
      { item: 'espresso', ticksLeft: 999 },
    ];
    const trays = passTraySlots(s);
    expect(trays).toHaveLength(1);
    expect(trays[0]).toMatchObject({ index: 0, label: 'Bo', drinks: ['latte', 'mocha'] });
    expect(trays[0]!.cool).toHaveLength(2);
  });

  it('trayBursts: refuse bubble once, plus small cues for claim/add/pick/put/take/spill/void', () => {
    const a = gearDay();
    a.customers = [{ id: 8, drink: 'latte', patienceLeft: 100, patienceMax: 100, name: 'Ada', stage: 'pickup' }];
    a.players[0]!.pos = { x: 2, y: 4 };
    const b = withLog(
      a,
      { kind: 'tray.refuse', data: { drink: 'latte', by: 'p1' } },
      { kind: 'tray.claim', data: { customer: 8, by: 'p1' } },
      { kind: 'tray.add', data: { drink: 'latte', by: 'p1', customer: 8 } },
      { kind: 'tray.pick', data: { by: 'p1', customer: 8 } },
      { kind: 'tray.put', data: { by: 'p1', customer: 8 } },
      { kind: 'tray.take', data: { customer: 8 } },
      { kind: 'tray.spill', data: { by: 'p1', customer: 8, cups: 2 } },
      { kind: 'tray.void', data: { customer: 8, cups: 2 } },
    );
    const { bursts, lastSeq } = trayBursts(a, b, a.nextLogSeq - 1);
    expect(bursts.filter((x) => x.kind === 'refuse')).toEqual([
      expect.objectContaining({ kind: 'refuse', by: 'p1', drink: 'latte', text: expect.stringContaining('Latte') }),
    ]);
    const cues = bursts.filter((x) => x.kind === 'cue').map((x) => (x.kind === 'cue' ? x.text : ''));
    expect(cues).toEqual([
      'Tray for Ada',
      '+Latte',
      'Tray up · Ada',
      'Tray ready · Ada',
      'Ada took the tray',
      'Tray spill! 2 cups',
      'Tray cleared · 2 cups wasted',
    ]);
    expect(trayBursts(b, clone(b), lastSeq).bursts).toEqual([]);
    expect(trayBursts(null, b, -1).bursts).toEqual([]);
    expect(trayRefuseLine(0)).toMatch(/doesn't go here|Wrong tray|Can't take/);
  });
});
