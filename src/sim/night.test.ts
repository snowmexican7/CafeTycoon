import { describe, it, expect } from 'vitest';
import { CATALOGUE, catalogueById } from '../data/catalogue';
import { ECONOMY } from '../data/economy';
import { applyNightInput, dealHand, eligibleItems, nightClock, restockCost, stepNight } from './night';
import { createRun } from './run';
import { secondsToTicks } from './constants';
import { sanitizeSettings } from './validate';
import { step } from './step';
import type { GameState } from './types';

const run = (seed = 1) => createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }], settings: { bots: 0 } });

describe('night phase', () => {
  it('deals four distinct eligible ids with a cheap option and two paths', () => {
    const s = run();
    expect(s.hand).toHaveLength(4);
    expect(new Set(s.hand).size).toBe(4);
    expect(s.hand.some((id) => catalogueById[id].cost < 30)).toBe(true);
    expect(new Set(s.hand.map((id) => catalogueById[id].path)).size).toBeGreaterThanOrEqual(2);
    expect(s.hand).not.toContain('laMazzoccaPro'); // requires dualBoiler
  });

  it('respects owned, requires, and excludes', () => {
    const s = run();
    s.owned = [{ itemId: 'dualBoiler', effects: [] }, { itemId: 'singleOrigin', effects: [] }];
    const ids = eligibleItems(s).map((i) => i.id);
    expect(ids).not.toContain('dualBoiler');
    expect(ids).toContain('laMazzoccaPro');
    expect(ids).not.toContain('cheapBeans');
    expect(ids).toContain('chirperThread'); // tomorrow items are always eligible
  });

  it('deals fewer than five when the pool is thin, and zero when empty', () => {
    // Review Focus 3
    const s = run();
    s.owned = CATALOGUE.filter((i) => i.duration === 'permanent').map((i) => ({ itemId: i.id, effects: [] }));
    expect(dealHand(s).hand).toHaveLength(4); // only the four 'tomorrow' ads remain
    expect(dealHand(s, []).hand).toEqual([]);
    expect(dealHand(s, [catalogueById.streetSign]).hand).toEqual([]); // owned permanent: nothing eligible
  });

  it('buys from the hand against shared cash, once per night', () => {
    // Review Focus 2
    const s = run();
    s.hand = ['streetSign', 'dualBoiler'];
    s.cash = 100;
    let t = applyNightInput(s, { kind: 'buy', playerId: 'p2', itemId: 'streetSign' });
    expect(t.cash).toBe(85);
    expect(t.owned.map((o) => o.itemId)).toEqual(['streetSign']);
    expect(t.hand).toEqual(['dualBoiler']);
    expect(t.boughtTonight).toEqual(['streetSign']);
    t = applyNightInput(t, { kind: 'buy', playerId: 'p1', itemId: 'dualBoiler' }); // 120 > 85
    expect(t.cash).toBe(85);
    expect(t.owned).toHaveLength(1);
    t = applyNightInput(t, { kind: 'buy', playerId: 'p1', itemId: 'streetSign' }); // no longer in hand
    expect(t.cash).toBe(85);
  });

  it('puts tomorrow items in activeTomorrow and resolves gambles', () => {
    const s = run();
    s.hand = ['instaGlamStory', 'mysteryRoasterSample'];
    let t = applyNightInput(s, { kind: 'buy', playerId: 'p1', itemId: 'instaGlamStory' });
    expect(t.activeTomorrow.map((o) => o.itemId)).toEqual(['instaGlamStory']);
    expect(t.owned).toHaveLength(0);
    t = applyNightInput(t, { kind: 'buy', playerId: 'p1', itemId: 'mysteryRoasterSample' });
    expect(t.owned[0].effects).toHaveLength(1);
    expect(t.owned[0].effects[0].kind).not.toBe('gamble');
  });

  it('restocks at pack prices with the supplyCost modifier', () => {
    const s = run();
    s.cash = 100;
    const t = applyNightInput(s, { kind: 'restock', playerId: 'p1', supply: 'beans', packs: 2 });
    expect(t.supplies.beans).toBe(40);
    expect(t.cash).toBe(84);
    t.owned.push({ itemId: 'bulkBeanDeal', effects: [{ kind: 'supplyCost', supply: 'beans', mul: 0.6 }] });
    expect(restockCost(t, 'beans', 1)).toBeCloseTo(4.8);
    expect(applyNightInput(t, { kind: 'restock', playerId: 'p1', supply: 'milk', packs: 100 }).cash).toBe(84); // unaffordable: no change
  });

  it('ends the night on the timer or when all connected players are ready', () => {
    let t = applyNightInput(run(), { kind: 'ready', playerId: 'p1' });
    expect(stepNight(t).phase).toBe('night');
    t = applyNightInput(t, { kind: 'ready', playerId: 'p2' });
    expect(stepNight(t).phase).toBe('day');
    const u = run();
    u.phaseTicksLeft = 1;
    expect(stepNight(u).phase).toBe('day');
    let v = run();
    v.players[1].connected = false;
    v = applyNightInput(v, { kind: 'ready', playerId: 'p1' });
    expect(stepNight(v).phase).toBe('day');
  });
});

const relaxed = (humans = 3): GameState =>
  createRun({
    seed: 3,
    hostId: 'p1',
    players: Array.from({ length: humans }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` })),
    settings: { bots: 0, nightLengthSec: 0 },
  });
const ready = (s: GameState, ...ids: string[]) => {
  for (const id of ids) applyNightInput(s, { kind: 'ready', playerId: id });
};

describe('relaxed night', () => {
  it('sanitizeSettings keeps 0 and still clamps other lengths to 30..600', () => {
    expect(sanitizeSettings({ nightLengthSec: 0 }).nightLengthSec).toBe(0);
    expect(sanitizeSettings({ nightLengthSec: 10 }).nightLengthSec).toBe(30);
    expect(sanitizeSettings({ nightLengthSec: 10_000 }).nightLengthSec).toBe(600);
  });

  it('defaults to a 120 s timed night', () => {
    expect(ECONOMY.nightLengthSec).toBe(120);
    expect(createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] }).settings.nightLengthSec).toBe(120);
  });

  it('starts with no clock and no last call', () => {
    const s = relaxed();
    expect(s.phaseTicksLeft).toBe(0);
    expect(s.lastCall).toBeUndefined();
  });

  it('never opens after 10 000 ticks with nobody ready', () => {
    let s = relaxed();
    for (let i = 0; i < 10_000; i++) s = stepNight(s);
    expect(s.phase).toBe('night');
    expect(s.phaseTicksLeft).toBe(0);
    expect(s.lastCall).toBeUndefined();
  });

  it('opens the tick after every connected human is ready', () => {
    let s = relaxed(2);
    ready(s, 'p1');
    s = stepNight(s);
    expect(s.phase).toBe('night');
    ready(s, 'p2');
    s = stepNight(s);
    expect(s.phase).toBe('day');
    expect(s.lastCall).toBeUndefined();
  });

  it('with 3 humans and 2 ready the last call starts and opens the day 30 s later', () => {
    let s = relaxed(3);
    ready(s, 'p1', 'p2');
    s = stepNight(s);
    expect(s.lastCall).toBe(secondsToTicks(30) - 1);
    for (let i = 0; i < secondsToTicks(30) - 2; i++) s = stepNight(s);
    expect(s.phase).toBe('night');
    s = stepNight(s);
    expect(s.phase).toBe('day');
    expect(s.lastCall).toBeUndefined();
  });

  it('a human who readied and then left does not count toward the last call or nightClock.ready', () => {
    let s = relaxed(2);
    ready(s, 'p1');
    s = step(s, [{ kind: 'leave', playerId: 'p1' }]);
    for (let i = 0; i < 2000; i++) s = stepNight(s);
    expect(s.phase).toBe('night');
    expect(s.lastCall).toBeUndefined();
    expect(nightClock(s).ready).toEqual([]);
    expect(nightClock(s).needed).toBe(1);
  });

  it('with 2 humans and 1 ready (not more than half) there is no last call', () => {
    let s = relaxed(2);
    ready(s, 'p1');
    for (let i = 0; i < 2000; i++) s = stepNight(s);
    expect(s.phase).toBe('night');
    expect(s.lastCall).toBeUndefined();
  });

  it('a started last call keeps running when the ready share drops', () => {
    let s = relaxed(3);
    ready(s, 'p1', 'p2');
    s = stepNight(s);
    s.ready = [];
    s = stepNight(s);
    expect(s.lastCall).toBe(secondsToTicks(30) - 2);
  });

  it('Review Focus 2: with every human disconnected the last call starts at once', () => {
    let s = relaxed(2);
    for (const p of s.players) p.connected = false;
    s = stepNight(s);
    expect(s.lastCall).toBe(secondsToTicks(30) - 1);
    for (let i = 0; i < secondsToTicks(30) - 1; i++) s = stepNight(s);
    expect(s.phase).toBe('day');
  });

  it('works through step() end to end', () => {
    let s = relaxed(1);
    s = step(s, [{ kind: 'ready', playerId: 'p1' }]);
    s = step(s, []);
    expect(s.phase).toBe('day');
  });

  it('a timed night is unchanged: counts down, no last call, identical across runs', () => {
    const play = () => {
      let s = createRun({ seed: 9, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, nightLengthSec: 30, dayLengthSec: 30 } });
      for (let i = 0; i < 30 * 60 + 900; i++) s = step(s, []);
      return s;
    };
    const a = play();
    expect(a.phase).toBe('day');
    expect(a.lastCall).toBeUndefined();
    expect(JSON.stringify(a)).toBe(JSON.stringify(play()));
    expect(JSON.stringify(a)).not.toContain('lastCall');
  });
});

describe('nightClock', () => {
  it('timed shape', () => {
    const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }], settings: { bots: 0 } });
    ready(s, 'p2');
    expect(nightClock(s)).toEqual({ mode: 'timed', secondsLeft: 120, lastCallSecondsLeft: null, ready: ['p2'], needed: 2 });
    s.phaseTicksLeft = 61;
    expect(nightClock(s).secondsLeft).toBe(2);
  });

  it('relaxed shape, before and during a last call; bots are not counted', () => {
    let s = createRun({
      seed: 1,
      hostId: 'p1',
      players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }, { id: 'p3', name: 'T' }],
      settings: { bots: 1, nightLengthSec: 0 },
    });
    expect(nightClock(s)).toEqual({ mode: 'relaxed', secondsLeft: null, lastCallSecondsLeft: null, ready: [], needed: 3 });
    ready(s, 'p1', 'p2');
    s = stepNight(s);
    expect(nightClock(s)).toEqual({ mode: 'relaxed', secondsLeft: null, lastCallSecondsLeft: 30, ready: ['p1', 'p2'], needed: 3 });
  });
});
