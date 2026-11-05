import { describe, expect, it } from 'vitest';
import { servingRun } from './pickupModel';
import { CONDIMENTS_ID, PICKUP_ID, SYRUP_ID } from '../data/layout';

const st = (id: string, x: number, y = 6, kind = 'counter') => ({ id, kind, pos: { x, y } });

describe('ui-3.9.2 servingRun (one solid front counter)', () => {
  it('joins the till with the pickup and condiment spots beside it', () => {
    const run = servingRun([st('grinder', 1, 2, 'grinder'), st('counter', 6), st(PICKUP_ID, 5), st(CONDIMENTS_ID, 4), st(SYRUP_ID, 2)]);
    expect(run).toEqual({ ids: [CONDIMENTS_ID, PICKUP_ID, 'counter'], y: 6, x0: 3.5, x1: 6.5 });
  });
  it('stops at a gap so it never covers walkable floor', () => {
    const run = servingRun([st('counter', 6), st(PICKUP_ID, 5), st(CONDIMENTS_ID, 3)]);
    expect(run?.ids).toEqual([PICKUP_ID, 'counter']);
    expect(run?.x0).toBe(4.5);
  });
  it('is null for a classic run (the till alone) or with no till', () => {
    expect(servingRun([st('counter', 6), st('grinder', 5, 6, 'grinder')])).toBeNull();
    expect(servingRun([st(PICKUP_ID, 5)])).toBeNull();
  });
});
