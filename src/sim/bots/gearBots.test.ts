import { describe, it, expect } from 'vitest';
import { createRun, startDay } from '../run';
import { step } from '../step';
import { stationsFromSlots, type SlotContent } from '../slots';
import { recipeAt, interact } from '../stations';
import { BASE_DRINKS } from '../../data/drinks';
import type { GearId } from '../../data/gear';
import type { BotStep, Customer, DrinkId, GameState, Player, SupplyId, TierId } from '../types';
import { chainFor, think } from './brain';
import { addStandIns } from './roster';

/**
 * A Gear run with the back bar set by hand: `slots`/`gear` per slot, `standIns` stand-in bots (no reaction,
 * no mistakes), one parked human p1, no walk-ins, no scheduled events, plenty of every supply, and `drinks`
 * unlocked and on the menu on top of the classics.
 */
function gearShop(slots: SlotContent[], gear: (GearId | null)[], o: { standIns?: number; tier?: TierId; drinks?: DrinkId[]; seed?: number } = {}): GameState {
  const tier = o.tier ?? 'cafe';
  let s = createRun({ seed: o.seed ?? 2, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 600 }, gear: true, ...(tier !== 'cafe' ? { tier } : {}) });
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  s.slots = [...slots];
  s.slotGear = [...gear];
  s.stations = stationsFromSlots(tier, s.slots, s.slotGear);
  s.unlocked = [...BASE_DRINKS, ...(o.drinks ?? [])];
  for (const d of s.unlocked) s.menu[d] = true;
  for (const k of Object.keys(s.supplies) as SupplyId[]) s.supplies[k] = 99;
  addStandIns(s, o.standIns ?? 1);
  s = startDay(s);
  s.eventSchedule = [];
  // Park the human out of the way, below the counter row.
  s.players[0].pos = { x: 10, y: 5 };
  return s;
}

const huge = { patienceLeft: 100_000, patienceMax: 100_000 };
const order = (id: number, drink: DrinkId, extra: Partial<Customer> = {}): Customer => ({ id, drink, ...huge, ...extra });
const sim = (s: GameState, n = 1): Player => s.players.find((p) => p.id === `sim-${n}`)!;
const ids = (plan: BotStep[]) => plan.map((x) => (x.kind === 'use' ? `${x.station}:${x.action}` : x.kind));

function runUntil(state: GameState, done: (s: GameState) => boolean, maxTicks: number, each?: (s: GameState) => void): GameState {
  let s = state;
  for (let i = 0; i < maxTicks; i++) {
    if (done(s)) return s;
    s = step(s, []);
    each?.(s);
  }
  if (done(s)) return s;
  throw new Error(`condition not met within ${maxTicks} ticks`);
}

/** Run until every customer is served; returns the state. */
const serveAll = (s: GameState, ticks = 60 * 120, each?: (s: GameState) => void) => runUntil(s, (x) => x.customers.length === 0, ticks, each);

describe('item 1: the UI lane bot edits (pods-only bar, gear recipe in act)', () => {
  it('recipeAt is the recipe interact runs: gear first, allowed only when on the menu', () => {
    const s = gearShop(['grinder', 'espresso', 'drip', 'steamer', 'trash', null], ['g2', 'e1', 'd4b', 's3', 'b0', null], { drinks: ['pourOver'] });
    const at = (id: string) => s.stations.find((x) => x.id === id)!;
    expect(recipeAt(s, at('espresso'), null)?.gives).toBe('espresso');
    expect(recipeAt(s, at('espresso'), 'grounds')).toBeNull();
    expect(recipeAt(s, at('drip'), null)?.gives).toBe('pourOver');
    expect(recipeAt(s, at('steamer'), 'espresso')?.gives).toBe('latte');
    s.menu.pourOver = false;
    expect(recipeAt(s, at('drip'), null)).toBeNull();
  });

  it('pods only, no grinder: the shot comes from empty hands and a latte is served end to end', () => {
    let s = gearShop(['espresso', 'steamer', 'trash', null, null, null], ['e1', 's3', 'b0', null, null, null]);
    expect(ids(chainFor(s, sim(s), 'latte', 'serve'))).toEqual(['espresso:insert', 'espresso:take', 'steamer:insert', 'steamer:take', 'counter:serve']);
    s.customers = [order(900, 'latte')];
    const beans = s.supplies.beans;
    s = serveAll(s);
    expect(s.today.drinks!.latte).toBe(1);
    expect(s.supplies.beans).toBe(beans - 1); // one pod
  });

  it('pods only with a grinder in a slot (smoke fix): bots skip the grinder and still serve', () => {
    let s = gearShop(['grinder', 'espresso', 'trash', null, null, null], ['g2', 'e1', 'b0', null, null, null]);
    expect(ids(chainFor(s, sim(s), 'espresso', 'serve'))).toEqual(['espresso:insert', 'espresso:take', 'counter:serve']);
    s.customers = [order(901, 'espresso')];
    let ground = false;
    s = serveAll(s, 60 * 60, (x) => { if (x.stations.find((st) => st.kind === 'grinder')!.busyTicksLeft > 0) ground = true; });
    expect(ground).toBe(false);
    expect(s.today.drinks!.espresso).toBe(1);
  });

  it('a stand-in at a pod machine presses use with empty hands (no wasted press with grounds)', () => {
    const s = gearShop(['espresso', 'trash', null, null, null, null], ['e1', 'b0', null, null, null, null]);
    const p = sim(s);
    const st = s.stations.find((x) => x.id === 'espresso')!;
    p.pos = { x: st.pos.x, y: st.pos.y + 1 };
    interact(s, p.id);
    expect(st.making).toBe('espresso');
  });

  it('think plans from empty hands on a pods-only bar', () => {
    const s = gearShop(['espresso', 'trash', null, null, null, null], ['e1', 'b0', null, null, null, null]);
    s.customers = [order(902, 'espresso')];
    expect(ids(think(s, sim(s)))).toEqual(['espresso:insert', 'espresso:take', 'counter:serve']);
  });
});
