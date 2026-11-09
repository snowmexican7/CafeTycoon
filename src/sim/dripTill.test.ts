import { describe, expect, it } from 'vitest';
import { GEAR } from '../data/gear';
import { BASE_DRINKS } from '../data/drinks';
import { createRun, startDay } from './run';
import { applyGearInput } from './gear';
import { step } from './step';
import { addStandIns } from '../harness/crew';
import { think } from '../harness/brain';
import { targetNodes } from './path';
import { groups } from './rearrange';
import type { CreateRunOptions, Customer, GameState, TierId, Vec2 } from './types';

const opts = (tier: TierId): CreateRunOptions => ({
  seed: 11,
  hostId: 'p1',
  players: [{ id: 'p1', name: 'K' }],
  tier,
  gear: true,
});
const buy = (s: GameState, gear: keyof typeof GEAR) => applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear });
const dripAt = (s: GameState): Vec2 => {
  const st = s.stations.find((x) => x.kind === 'drip' && !x.twin);
  if (!st) throw new Error('no drip');
  return { x: Math.round(st.pos.x), y: Math.round(st.pos.y) };
};
const till = (s: GameState) => s.stations.find((x) => x.id === 'counter')!;

describe('Round 5 block 6: drip sits by the till', () => {
  for (const tier of ['stand', 'cart', 'cafe'] as const) {
    it(`a drip bought into an empty ${tier} shop sits on the row above the till`, () => {
      const s = createRun(opts(tier));
      s.cash = 200;
      buy(s, 'd1');
      const pos = dripAt(s);
      const t = till(s);
      // Nearest y = till−1 tile `layoutProblems` accepts (stand may sit several columns left of the till).
      expect(pos.y).toBe(Math.round(t.pos.y) - 1);
      expect(pos.y).not.toBe(1);
      expect(s.slotPos?.some((p) => p && p.x === pos.x && p.y === pos.y)).toBe(true);
    });
  }

  it('a night move overrides the till seat and is kept', () => {
    let s = createRun(opts('stand'));
    s.cash = 200;
    buy(s, 'd1');
    const before = dripAt(s);
    expect(before.y).toBe(5);
    s = step(s, [{ kind: 'moveStation', playerId: 'p1', station: 'drip', to: { x: 3, y: 3 } }]);
    expect(dripAt(s)).toEqual({ x: 3, y: 3 });
    expect(s.slotPos?.some((p) => p && p.x === 3 && p.y === 3)).toBe(true);
  });

  it('pour-over bars are not seated by the till (still need an Office Urn first)', () => {
    const s = createRun(opts('cafe'));
    s.cash = 500;
    buy(s, 'd3'); // unlocks the pour-over branch
    buy(s, 'd4b');
    const pour = s.stations.find((x) => x.gear === 'd4b');
    expect(pour).toBeTruthy();
    // Pour-over keeps a back-bar default (not forced to y = till-1).
    expect(Math.round(pour!.pos.y)).toBe(1);
  });

  it('upgrading a drip in place keeps its till seat', () => {
    const s = createRun(opts('stand'));
    s.cash = 500;
    buy(s, 'd1');
    const was = dripAt(s);
    buy(s, 'd2');
    expect(dripAt(s)).toEqual(was);
    expect(s.slotGear?.includes('d2')).toBe(true);
  });

  it('bots still brew and pour drip from a till-side pot', () => {
    let s = createRun({ ...opts('cafe'), settings: { dayLengthSec: 600 } });
    s.cash = 200;
    buy(s, 'd1');
    expect(dripAt(s).y).toBe(Math.round(till(s).pos.y) - 1);
    s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
    s.unlocked = [...BASE_DRINKS, 'drip'];
    s.menu.drip = true;
    for (const k of Object.keys(s.supplies) as (keyof typeof s.supplies)[]) s.supplies[k] = 99;
    addStandIns(s, 1);
    s = startDay(s);
    s.eventSchedule = [];
    s.players[0]!.pos = { x: 10, y: 5 };
    const bot = s.players.find((p) => p.id === 'sim-1')!;
    s.customers = [{ id: 2001, drink: 'drip', patienceLeft: 100_000, patienceMax: 100_000, stage: 'pickup', rungAt: 0 } as Customer];
    const plan = think(s, bot);
    expect(plan.map((x) => (x.kind === 'use' ? `${x.station}:${x.action}` : x.kind))).toEqual(['drip:insert', 'drip:take', 'pickup:put']);
    for (let i = 0; i < 60 * 90 && s.customers.length > 0; i++) s = step(s, []);
    expect(s.today.drinks?.drip).toBe(1);
  });

  it('buying a drip never pushes a machine the crew placed off its tile', () => {
    let s = createRun(opts('cafe'));
    s.cash = 500;
    buy(s, 'e2');
    s = step(s, [{ kind: 'moveStation', playerId: 'p1', station: 'espresso', to: { x: 8, y: 5 } }]);
    const esp = () => s.stations.find((x) => x.id === 'espresso')!.pos;
    expect(esp()).toEqual({ x: 8, y: 5 });
    buy(s, 'd1');
    expect(esp()).toEqual({ x: 8, y: 5 });
    expect(dripAt(s)).not.toEqual({ x: 8, y: 5 });
  });

  it('a second drip does not push the first one off its seat', () => {
    const s = createRun(opts('cafe'));
    s.cash = 500;
    buy(s, 'd1');
    const first = dripAt(s);
    expect(first.y).toBe(Math.round(till(s).pos.y) - 1);
    buy(s, 'd1');
    const drips = s.stations.filter((x) => x.kind === 'drip' && !x.twin);
    expect(drips).toHaveLength(2);
    expect(drips.find((x) => x.id === 'drip')!.pos).toEqual(first);
  });

  it('the drip keeps a till-side seat when the shop grows from a cart (kept, or seated again after a reset)', () => {
    let s = createRun(opts('cart'));
    s.cash = 100_000;
    buy(s, 'd1');
    let kept = step(structuredClone(s), [{ kind: 'grow', playerId: 'p1', tier: 'stand' }]);
    expect(kept.tier).toBe('stand');
    expect(dripAt(kept).y).toBe(Math.round(till(kept).pos.y) - 1);
    // A move the stand can't keep (its fridge comes to (1,3)) resets the layout; the drip is seated by the till again.
    buy(s, 'e2');
    s = step(s, [{ kind: 'moveStation', playerId: 'p1', station: 'espresso', to: { x: 1, y: 3 } }]);
    expect(s.stations.find((x) => x.id === 'espresso')!.pos).toEqual({ x: 1, y: 3 });
    s = step(s, [{ kind: 'grow', playerId: 'p1', tier: 'stand' }]);
    expect(s.tier).toBe('stand');
    expect(s.log.filter((e) => e.kind === 'station.reset')).toHaveLength(1);
    expect(dripAt(s).y).toBe(Math.round(till(s).pos.y) - 1);
  });

  /** How many working tiles each fixture (a station of no slot) has. */
  const fixtureReach = (s: GameState): Record<string, number> => {
    const inSlots = new Set(groups(s).flat().map((x) => x.id));
    return Object.fromEntries(s.stations.filter((x) => !inSlots.has(x.id)).map((x) => [x.id, targetNodes(s, x, x.pos).length]));
  };

  for (const tier of ['stand', 'cart', 'cafe'] as const) {
    it(`seating a drip on the ${tier} takes no fixture's working tile`, () => {
      const s = createRun(opts(tier));
      s.cash = 500;
      const before = fixtureReach(s);
      buy(s, 'd1');
      expect(fixtureReach(s)).toEqual(before);
    });
  }

  it('on the stand with a steam wand bought first, the drip leaves the syrup rack and the tray table their tiles', () => {
    const s = createRun(opts('stand'));
    s.cash = 2000;
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'e3', wand: 'weak' });
    expect(s.stations.some((x) => x.id === 'syrups')).toBe(true);
    const before = fixtureReach(s);
    buy(s, 'd1');
    expect(fixtureReach(s)).toEqual(before);
  });
});
