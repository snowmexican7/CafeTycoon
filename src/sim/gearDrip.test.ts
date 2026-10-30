import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { finishDay } from './closing';
import { applyGearInput, gearArea, gearAskedFor, gearPotPour } from './gear';
import { interact, stepStations } from './stations';
import { GEAR, type GearId } from '../data/gear';
import { menuDrinks, unlockedDrinks } from './unlocks';
import { availableDrinks } from './customers';
import { TICK_RATE } from './constants';
import type { CreateRunOptions, GameState } from './types';

const opts = (gear?: boolean, seed = 7): CreateRunOptions => ({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear });
const buy = (s: GameState, gear: GearId) => applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear });
const at = (s: GameState, kind: string) => {
  const st = s.stations.find((x) => x.kind === kind)!;
  s.players[0].pos = { ...st.pos, y: st.pos.y + 1 };
  return st;
};
const finish = (s: GameState) => { while (s.stations.some((x) => x.busyTicksLeft > 0)) { s.tick += 1; stepStations(s); } };

describe('Gear Tree G4d: drip', () => {
  it('buying a drip machine puts drip on the menu; classic runs never have it', () => {
    const classic = createRun(opts(false));
    expect(unlockedDrinks(classic)).not.toContain('drip');
    const s = createRun(opts(true));
    expect(unlockedDrinks(s)).not.toContain('drip');
    buy(s, 'd1');
    expect(s.stations.some((x) => x.kind === 'drip' && x.gear === 'd1')).toBe(true);
    expect(menuDrinks(s)).toContain('drip');
    s.supplies.beans = 5;
    expect(availableDrinks(s)).toContain('drip');
  });

  it('one press brews a pot from one unit of beans; each press after pours a cup until it is empty', () => {
    const s = createRun(opts(true));
    buy(s, 'd2');
    s.supplies.beans = 3;
    startDay(s);
    const st = at(s, 'drip');
    interact(s, 'p1');
    expect([st.making, s.supplies.beans]).toEqual(['drip', 2]);
    expect(st.busyTicksLeft).toBe(Math.round((20 / GEAR.d2.speed) * TICK_RATE));
    finish(s);
    expect(st.potLeft).toBe(GEAR.d2.pot!.cups);
    st.potOff = undefined; // whatever the roll was, test the pour itself
    for (let i = 0; i < GEAR.d2.pot!.cups; i++) {
      s.players[0].holding = null;
      interact(s, 'p1');
      expect(s.players[0].holding).toBe('drip');
      expect(s.players[0].cupSlips ?? 0).toBe(0);
    }
    expect([st.output, st.potLeft]).toEqual([null, undefined]);
    expect(s.supplies.beans).toBe(2);
  });

  it('a pot left too long goes cold: the cup gets a complaint and a half tip; the urn never goes cold', () => {
    const s = createRun(opts(true));
    buy(s, 'd1');
    s.supplies.beans = 3;
    startDay(s);
    const st = at(s, 'drip');
    interact(s, 'p1');
    finish(s);
    delete st.potOff;
    s.tick += 46 * TICK_RATE;
    s.players[0].holding = null;
    interact(s, 'p1');
    expect(s.players[0].cupTemp).toBe(true);
    expect(s.log.some((e) => e.kind === 'gear.quirk' && String(e.data.text).startsWith('Too cold'))).toBe(true);
    // a scalding pot complains too
    st.potOff = 'hot';
    s.players[0].holding = null;
    interact(s, 'p1');
    expect(s.players[0].cupTemp).toBe(true);
    expect(s.log.some((e) => e.kind === 'gear.quirk' && String(e.data.text).startsWith('Too hot'))).toBe(true);
    // the urn
    const u = createRun(opts(true));
    buy(u, 'd3');
    u.supplies.beans = 3;
    startDay(u);
    const us = at(u, 'drip');
    interact(u, 'p1');
    finish(u);
    delete us.potOff;
    expect(us.potColdAt).toBeUndefined();
    u.tick += 600 * TICK_RATE;
    expect(gearPotPour(u, us).temp).toBeNull();
  });

  it('the Thrift Store Special misses temperature on about 12% of pots', () => {
    let off = 0;
    const N = 300;
    const s = createRun(opts(true, 11));
    buy(s, 'd1');
    s.supplies.beans = N + 5;
    startDay(s);
    const st = at(s, 'drip');
    for (let i = 0; i < N; i++) {
      delete st.potLeft; st.output = null;
      interact(s, 'p1');
      finish(s);
      if (st.potOff) off++;
    }
    expect(off / N).toBeGreaterThan(0.06);
    expect(off / N).toBeLessThan(0.2);
  });

  it('an office park stops losing filter walk-ins once drip is on the menu', () => {
    let seed = 1;
    let s = createRun(opts(true, seed));
    while (gearArea(s) !== 'office') s = createRun(opts(true, ++seed));
    buy(s, 'd1');
    let left = 0;
    for (let i = 0; i < 400; i++) if (gearAskedFor(s, menuDrinks(s))) left++;
    expect(s.gearAsked?.filter).toBeUndefined();
    expect(left).toBe(0); // the office only loves filter, and now it's served
  });

  it('upgrading the drip machine trades in the old one', () => {
    const s = createRun(opts(true));
    s.cash = 500;
    buy(s, 'd1');
    buy(s, 'd3');
    expect(s.stations.filter((x) => x.kind === 'drip').map((x) => x.gear)).toEqual(['d3']);
    expect(s.cash).toBe(500 - 15 + 2 - 85);
  });

  it('review M9: closing clears the drip pot (no stale potLeft/potColdAt/potOff in the save)', () => {
    const s = createRun(opts(true));
    s.cash = 500;
    buy(s, 'd1');
    startDay(s);
    const st = s.stations.find((x) => x.kind === 'drip')!;
    st.potLeft = 3;
    st.potColdAt = s.tick + 99;
    st.potOff = 'cold';
    s.phase = 'closing';
    const after = finishDay(s);
    const drip = after.stations.find((x) => x.kind === 'drip')!;
    expect(drip.potLeft).toBeUndefined();
    expect(drip.potColdAt).toBeUndefined();
    expect(drip.potOff).toBeUndefined();
  });
});
