import { describe, expect, it } from 'vitest';
import { CONDIMENTS_ID, PICKUP_ID, SYRUP_ID, TRAY_ID } from '../data/layout';
import { TICK_RATE } from '../sim/constants';
import { boxStackOffset, counterSpotOf, customerSpots, pickupCups, PICKUP_MIN_X, PICKUP_Y, servingsGauge, type SpotsLayout } from './pickupModel';
import type { GameState } from '../sim/types';

const lay: SpotsLayout = {
  width: 12,
  queueSlots: [0, 1, 2, 3].map((i) => ({ x: 6 + i, y: 7.6 })),
  till: { x: 6, y: 6 },
  pickup: { x: 5, y: 6 },
};

describe('pickupModel (3.3.1)', () => {
  it('counterSpotOf splits the Gear counter into till / pickup / bar, classic keeps one counter', () => {
    const gear = [{ id: 'counter' }, { id: PICKUP_ID }, { id: CONDIMENTS_ID }, { id: TRAY_ID }, { id: SYRUP_ID }];
    expect(counterSpotOf({ id: 'counter', kind: 'counter' }, gear)).toBe('till');
    expect(counterSpotOf({ id: PICKUP_ID, kind: 'counter' }, gear)).toBe('pickup');
    expect(counterSpotOf({ id: CONDIMENTS_ID, kind: 'counter' }, gear)).toBe('condiments');
    expect(counterSpotOf({ id: TRAY_ID, kind: 'counter' }, gear)).toBe('trayTable');
    expect(counterSpotOf({ id: SYRUP_ID, kind: 'counter' }, gear)).toBe('syrups');
    expect(counterSpotOf({ id: 'counter', kind: 'counter' }, [{ id: 'counter' }])).toBeUndefined();
    expect(counterSpotOf({ id: 'espresso', kind: 'espresso' }, gear)).toBeUndefined();
  });

  it('classic customers use the queue slots, overflow on the last one', () => {
    const spots = customerSpots(Array.from({ length: 6 }, () => ({ stage: 'queue' as never })), false, lay);
    expect(spots.slice(0, 4)).toEqual(lay.queueSlots);
    expect(spots[5]).toEqual(lay.queueSlots[3]);
  });

  it('Gear: the order line runs right of the till, the pickup crowd waits left at pickup', () => {
    const cs = [{ stage: 'queue' }, { stage: 'pickup' }, { stage: 'queue' }, { stage: 'pickup' }, { stage: 'pickup' }] as never[];
    const s = customerSpots(cs, true, lay);
    expect(s[0]).toEqual({ x: 6, y: 7.6 });
    expect(s[2]!.x).toBeGreaterThan(6);
    expect(s[1]).toEqual({ x: 5, y: PICKUP_Y });
    expect(s[3]!.x).toBeLessThan(5);
    expect(s[4]!.x).toBeLessThan(s[3]!.x);
    const crowd = customerSpots(Array.from({ length: 12 }, () => ({ stage: 'pickup' })) as never[], true, lay);
    expect(Math.min(...crowd.map((p) => p.x))).toBeGreaterThanOrEqual(PICKUP_MIN_X);
    const line = customerSpots(Array.from({ length: 20 }, () => ({ stage: 'queue' })) as never[], true, lay);
    expect(Math.max(...line.map((p) => p.x))).toBeLessThanOrEqual(lay.width - 0.45);
  });

  it('servingsGauge reads ok / low / empty', () => {
    expect(servingsGauge(20, 20)).toMatchObject({ pips: 20, tone: 'ok', text: '20/20' });
    expect(servingsGauge(5, 20)).toMatchObject({ tone: 'low' });
    expect(servingsGauge(6, 20).tone).toBe('ok');
    expect(servingsGauge(0, 20)).toMatchObject({ pips: 0, tone: 'empty', text: 'EMPTY: bring a box' });
    expect(servingsGauge(99, 20).pips).toBe(20);
  });

  it('boxStackOffset stacks two columns upward', () => {
    expect(boxStackOffset(0).y).toBe(0);
    expect(boxStackOffset(1).y).toBe(0);
    expect(boxStackOffset(0).x).toBeLessThan(boxStackOffset(1).x);
    expect(boxStackOffset(2).y).toBeLessThan(0);
  });

  it('pickupCups: at most 4 coasters in Gear, flags stale and wanted cups', () => {
    const pass = ['latte', 'drip', 'latte', 'coldBrew', 'mocha'].map((item, i) => ({ item, ticksLeft: i === 1 ? 2 * TICK_RATE : 60 * TICK_RATE }));
    const state = { gear: true, pass, customers: [{ stage: 'pickup', drink: 'coldBrew' }, { stage: 'queue', drink: 'latte' }] } as unknown as GameState;
    const cups = pickupCups(state);
    expect(cups).toHaveLength(4);
    expect(cups.map((c) => c.stale)).toEqual([false, true, false, false]);
    expect(cups.map((c) => c.wanted)).toEqual([false, false, false, true]);
  });
});

describe('Gear counters get no number badge (3.3.1)', () => {
  it('the till stays badge 1 and the pickup counter and bar are skipped like twins', async () => {
    const { stationBadges } = await import('./slotModel');
    const list = [
      { id: 'counter', kind: 'counter' },
      { id: PICKUP_ID, kind: 'counter' },
      { id: CONDIMENTS_ID, kind: 'counter' },
      { id: 'espresso', kind: 'espresso' },
    ];
    const b = stationBadges(list.map((s) => ({ kind: s.kind, twin: ['pickup', 'condiments'].includes(counterSpotOf(s, list) ?? '') })));
    expect(b).toEqual([1, 1, 1, 1]);
    expect(stationBadges(list.map((s) => ({ kind: s.kind })))).toEqual([1, 2, 3, 1]); // what 3.3.0 drew
  });
});
