import { describe, it, expect } from 'vitest';
import { createRun } from './run';
import { step } from './step';
import { finishDay } from './closing';
import { canMake } from './growth';
import { syncBots } from './bots/roster';
import { setStrategistMenu } from './strategist';
import type { GameState } from './types';

/**
 * Round 4 f follow-up: a hired Strategist also sets the menu (every drink the bar can make on, every one it can't off),
 * at each night start and the moment they are hired. Hand-set menu changes stand until the next night start.
 */
const gearRun = (players = 1): GameState => {
  let s = createRun({
    seed: 7, hostId: 'p1', players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` })),
    settings: { dayLengthSec: 150, nightLengthSec: 30, bots: 0 }, tier: 'stand', gear: true,
  });
  const cash = s.cash;
  s.cash = 300;
  for (const g of ['c1', 'e1'] as const) s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: g }]);
  s.cash = cash;
  return s;
};
const hire = (s: GameState): GameState => step(s, [{ kind: 'staff', playerId: 'p1', action: 'hire', role: 'strategist' }]);
const menuEvents = (s: GameState) => s.log.filter((e) => e.kind === 'strategist.menu').map((e) => e.data);
const nextNight = (s: GameState): GameState => {
  const t = structuredClone(s);
  syncBots(t);
  t.challenges = [];
  t.phase = 'closing';
  t.cash = 500;
  const n = finishDay(t);
  expect(n.phase).toBe('night');
  return n;
};

describe('the Strategist sets the menu', () => {
  it('the fixture: espresso and cold brew can be made, the latte cannot (a pod machine has no wand)', () => {
    const s = gearRun();
    expect([canMake(s, 'espresso'), canMake(s, 'coldBrew'), canMake(s, 'latte')]).toEqual([true, true, false]);
  });

  it('on hire: makeable drinks go on, the rest go off, one strategist.menu { drink, on } per switch', () => {
    let s = gearRun();
    s.menu.coldBrew = false;
    s = hire(s);
    expect([s.menu.espresso, s.menu.coldBrew, s.menu.latte]).toEqual([true, true, false]);
    expect(menuEvents(s)).toEqual([{ drink: 'latte', on: false }, { drink: 'coldBrew', on: true }]);
  });

  it('the menu is set before the prices, so the prices are searched over the new menu', () => {
    let s = gearRun();
    s.menu.coldBrew = false;
    s = hire(s);
    const kinds = s.log.filter((e) => e.kind === 'strategist.menu' || e.kind === 'strategist.set').map((e) => e.kind);
    expect(kinds.indexOf('strategist.menu')).toBe(0);
  });

  it('a hand-set menu change stands until the next night start, which puts it back', () => {
    let s = hire(gearRun());
    s = step(s, [{ kind: 'menu', playerId: 'p1', drink: 'coldBrew', on: false }]);
    s = step(s, [{ kind: 'menu', playerId: 'p1', drink: 'latte', on: true }]);
    expect([s.menu.coldBrew, s.menu.latte]).toEqual([false, true]);
    s = step(s, []);
    expect([s.menu.coldBrew, s.menu.latte]).toEqual([false, true]);
    const n = nextNight(s);
    expect([n.menu.espresso, n.menu.coldBrew, n.menu.latte]).toEqual([true, true, false]);
  });

  it('without a strategist nobody touches the menu at night start', () => {
    const s = gearRun();
    s.menu.coldBrew = false;
    const n = nextNight(s);
    expect([n.menu.coldBrew, n.menu.latte]).toEqual([false, true]);
    expect(menuEvents(n)).toEqual([]);
  });

  it('a machine bought tonight puts its drinks on the menu at once (the strategist would not leave it off till tomorrow night)', () => {
    let s = hire(gearRun());
    expect(s.menu.latte).toBe(false);
    s.cash = 2000;
    s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: 'g1' }]);
    expect(s.menu.latte).toBe(false); // a grinder alone makes no latte
    s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: 'e5' }]); // built-in wand
    expect(canMake(s, 'latte')).toBe(true);
    expect(s.menu.latte).toBe(true);
    expect(menuEvents(s).at(-1)).toEqual({ drink: 'latte', on: true });
  });

  it('a bar that can make nothing yet leaves the menu alone', () => {
    const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear: true });
    s.staff = { strategist: true };
    for (const k of Object.keys(s.menu) as (keyof typeof s.menu)[]) s.menu[k] = true;
    s.slots = s.slots!.map(() => null);
    s.stations = s.stations.filter((x) => x.kind === 'counter');
    const before = { ...s.menu };
    setStrategistMenu(s);
    expect(s.menu).toEqual(before);
  });
});
