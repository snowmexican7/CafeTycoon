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

describe('item 2: pods (E1) and the mixed bar', () => {
  // grinder, Pod-o-Matic, Brevelle (E2), steamer, bin: the pod machine is 'espresso', the E2 'espresso-2'.
  const MIXED: [SlotContent[], (GearId | null)[]] = [['grinder', 'espresso', 'espresso', 'steamer', 'trash', null], ['g2', 'e1', 'e2', 's3', 'b0', null]];
  const mixed = (o: Parameters<typeof gearShop>[2] = {}) => gearShop(...MIXED, o);
  const station = (s: GameState, id: string) => s.stations.find((x) => x.id === id)!;

  it('both routes free: grinder + the E2 (no pod mark); grounds never go to the pod machine', () => {
    const s = mixed();
    expect(ids(chainFor(s, sim(s), 'latte', 'serve'))).toEqual([
      'grinder:insert', 'grinder:take', 'espresso-2:insert', 'espresso-2:take', 'steamer:insert', 'steamer:take', 'counter:serve',
    ]);
    // From grounds in hand, only the E2 will do, even standing right by the pod machine.
    const p = sim(s);
    p.pos = { x: station(s, 'espresso').pos.x, y: 2 };
    expect(ids(chainFor(s, p, 'espresso', 'serve', 'grounds'))).toEqual(['espresso-2:insert', 'espresso-2:take', 'counter:serve']);
  });

  it('the grinder route busy: the pod machine pulls the shot from empty hands', () => {
    const s = mixed();
    station(s, 'espresso-2').busyTicksLeft = 300;
    station(s, 'espresso-2').making = 'espresso';
    expect(ids(chainFor(s, sim(s), 'espresso', 'serve'))).toEqual(['espresso:insert', 'espresso:take', 'counter:serve']);
  });

  it('grounds in hand, no bin, floor at the mess cap: pulled through the E2, never the pod machine', () => {
    const s = gearShop(['grinder', 'espresso', 'espresso', 'steamer', null, null], ['g2', 'e1', 'e2', 's3', null, null]);
    const p = sim(s);
    p.holding = 'grounds';
    p.pos = { x: station(s, 'espresso').pos.x, y: 2 };
    for (let i = 0; s.messes.length < 12; i++) s.messes.push({ id: 500 + i, kind: 'spill', x: 1 + (i % 9), y: 4 + Math.floor(i / 9), amount: 1 });
    expect(ids(think(s, p))).toEqual(['espresso-2:insert', 'espresso-2:take', 'counter:put']);
  });

  it('a mixed bar serves a run of lattes end to end, and the pod machine never holds grounds', () => {
    let s = mixed({ standIns: 2 });
    s.customers = [order(910, 'latte'), order(911, 'latte'), order(912, 'espresso'), order(913, 'latte')];
    let podGrounds = false;
    s = serveAll(s, 60 * 180, (x) => { if (station(x, 'espresso').output === 'grounds') podGrounds = true; });
    expect(podGrounds).toBe(false);
    expect(s.today.served).toBe(4);
    expect(s.today.wasted ?? 0).toBe(0);
  });

  it('a mixed bar with no grinder: shots come from the pod machine', () => {
    let s = gearShop(['espresso', 'espresso', 'steamer', 'trash', null, null], ['e1', 'e2', 's3', 'b0', null, null]);
    expect(ids(chainFor(s, sim(s), 'espresso', 'serve'))).toEqual(['espresso:insert', 'espresso:take', 'counter:serve']);
    s.customers = [order(920, 'espresso'), order(921, 'latte')];
    s = serveAll(s);
    expect(s.today.served).toBe(2);
  });
});

describe('item 3: jams and dead machines (G5)', () => {
  const station = (s: GameState, id: string) => s.stations.find((x) => x.id === id)!;

  it('a jammed Pod-o-Matic: the bot whacks it with empty hands, then pulls the shot and serves', () => {
    let s = gearShop(['espresso', 'trash', null, null, null, null], ['e1', 'b0', null, null, null, null]);
    station(s, 'espresso').jammed = true;
    s.customers = [order(930, 'espresso')];
    let whacked = false;
    let claimed = false;
    let dropped = false; // the whack is part of the chain: the claim is never let go in between
    s = serveAll(s, 60 * 60, (x) => {
      if (x.log.some((e) => e.kind === 'gear.quirk' && String(e.data.text).includes('whacked'))) whacked = true;
      if (sim(x).bot!.claim === 930) claimed = true;
      else if (claimed && x.customers.length > 0) dropped = true;
    });
    expect(s.today.drinks!.espresso).toBe(1);
    expect(whacked).toBe(true);
    expect(dropped).toBe(false);
  });

  it('holding grounds at a jammed machine: waits for a whack, and goes on once someone fixes it', () => {
    let s = gearShop(['grinder', 'espresso', 'trash', null, null, null], ['g2', 'e2', 'b0', null, null, null]);
    const p = sim(s);
    const esp = station(s, 'espresso');
    esp.jammed = true;
    p.holding = 'grounds';
    p.pos = { x: esp.pos.x, y: 2 };
    s.customers = [order(931, 'espresso')];
    p.bot!.claim = 931;
    p.bot!.claimDrink = 'espresso';
    p.bot!.plan = chainFor(s, p, 'espresso', 'serve', 'grounds');
    expect(p.bot!.plan).toEqual([]); // a jammed machine is no plan for full hands...
    p.bot!.plan = [{ kind: 'use', station: 'espresso', action: 'insert', makes: 'espresso' }, { kind: 'use', station: 'espresso', action: 'take' }, { kind: 'use', station: 'counter', action: 'serve' }];
    for (let i = 0; i < 300; i++) s = step(s, []); // ...but one that jams under the bot's feet is waited out
    expect(sim(s).holding).toBe('grounds');
    expect(sim(s).bot!.plan[0]).toMatchObject({ station: 'espresso', action: 'insert' });
    delete station(s, 'espresso').jammed; // the human whacks it
    s = serveAll(s, 60 * 60);
    expect(s.today.drinks!.espresso).toBe(1);
  });

  it('holding grounds at a jammed machine nobody whacks: past the wait cap the grounds go in the bin', () => {
    let s = gearShop(['grinder', 'espresso', 'trash', null, null, null], ['g2', 'e2', 'b0', null, null, null]);
    const p = sim(s);
    const esp = station(s, 'espresso');
    esp.jammed = true;
    p.holding = 'grounds';
    p.pos = { x: esp.pos.x, y: 2 };
    p.bot!.plan = [{ kind: 'use', station: 'espresso', action: 'insert', makes: 'espresso' }, { kind: 'use', station: 'espresso', action: 'take' }, { kind: 'use', station: 'counter', action: 'put' }];
    for (let i = 0; i < 800; i++) s = step(s, []);
    expect(sim(s).holding).toBe('grounds'); // still within the cap
    s = runUntil(s, (x) => sim(x).holding === null, 60 * 30);
    expect(station(s, 'espresso').jammed).toBe(true); // full hands never whack
  });

  it('a dead steamer is treated as absent: a latte goes to the live one', () => {
    const s = gearShop(['grinder', 'espresso', 'steamer', 'steamer', 'trash', null], ['g2', 'e3', 's1', 's2', 'b0', null]);
    station(s, 'steamer').dead = true;
    const steps = ids(chainFor(s, sim(s), 'latte', 'serve'));
    expect(steps).toContain('steamer-2:insert');
    expect(steps).not.toContain('steamer:insert');
  });

  it('the only steamer dead: latte orders are skipped for ones the bar can still make', () => {
    let s = gearShop(['grinder', 'espresso', 'steamer', 'trash', null, null], ['g2', 'e3', 's1', 'b0', null, null]);
    station(s, 'steamer').dead = true;
    s.customers = [order(940, 'latte'), order(941, 'espresso')];
    expect(ids(think(s, sim(s)))[0]).toBe('grinder:insert');
    expect(sim(s).bot!.claim).toBe(941);
    s = runUntil(s, (x) => !x.customers.some((c) => c.id === 941), 60 * 60);
    expect(s.today.drinks!.espresso).toBe(1);
    expect(station(s, 'steamer').busyTicksLeft).toBe(0);
  });

  it('a steamer dies mid-chain: the bot re-plans to the other one and serves the latte', () => {
    let s = gearShop(['grinder', 'espresso', 'steamer', 'steamer', 'trash', null], ['g2', 'e3', 's1', 's2', 'b0', null]);
    s.customers = [order(950, 'latte')];
    s = runUntil(s, (x) => sim(x).holding === 'espresso', 60 * 60);
    const plan = sim(s).bot!.plan;
    const target = plan.find((x) => x.kind === 'use' && x.action === 'insert');
    expect(target).toBeDefined();
    const first = (target as { station: string }).station;
    station(s, first).dead = true;
    s = step(s, []);
    const next = sim(s).bot!.plan.find((x) => x.kind === 'use' && x.action === 'insert') as { station: string };
    expect(next.station).not.toBe(first);
    s = serveAll(s, 60 * 60);
    expect(s.today.drinks!.latte).toBe(1);
  });

  it('the only steamer dies mid-chain: the shot goes on the pass and the bot does not stall', () => {
    let s = gearShop(['grinder', 'espresso', 'steamer', 'trash', null, null], ['g2', 'e3', 's1', 'b0', null, null]);
    s.customers = [order(960, 'latte')];
    s = runUntil(s, (x) => sim(x).holding === 'espresso', 60 * 60);
    station(s, 'steamer').dead = true;
    s = runUntil(s, (x) => sim(x).holding === null, 60 * 30);
    expect(s.pass.some((i) => i.item === 'espresso')).toBe(true);
    expect(sim(s).bot!.claim).toBeNull();
  });
});

describe('item 4: drip pots (G4d)', () => {
  const station = (s: GameState, id: string) => s.stations.find((x) => x.id === id)!;
  const POTS = (a: GearId, b: GearId | null = null) => gearShop(['drip', 'trash', b ? 'drip' : null, null, null, null], [a, 'b0', b, null, null, null], { drinks: ['drip'] });
  const fill = (s: GameState, st: ReturnType<typeof station>, cups: number, cold = false) => {
    st.output = 'drip';
    st.potLeft = cups;
    if (cold) st.potColdAt = s.tick - 1;
  };

  it('an empty Thrift Store Special: the bot brews a pot (20 s, past the wait cap), pours and serves', () => {
    let s = POTS('d1');
    s.customers = [order(1000, 'drip')];
    expect(ids(think(s, sim(s)))).toEqual(['drip:insert', 'drip:take', 'counter:serve']);
    let dropped = false; // waits the brew out instead of giving up at the wait cap
    s = serveAll(s, 60 * 60, (x) => { if (x.customers.length > 0 && sim(x).bot!.claim !== 1000) dropped = true; });
    expect(s.today.drinks!.drip).toBe(1);
    expect(dropped).toBe(false);
  });

  it('three drip orders: one pot brewed (one unit of beans), three cups poured, nothing on the pass or binned', () => {
    let s = POTS('d2');
    const beans = s.supplies.beans;
    s.customers = [order(1001, 'drip'), order(1002, 'drip'), order(1003, 'drip')];
    s = serveAll(s, 60 * 90);
    expect(s.today.drinks!.drip).toBe(3);
    expect(s.supplies.beans).toBe(beans - 1);
    expect(s.today.wasted ?? 0).toBe(0);
  });

  it('a pot sitting with cups and no drip orders is left alone (not poured onto the pass)', () => {
    let s = POTS('d3');
    fill(s, station(s, 'drip'), 10);
    for (let i = 0; i < 60 * 30; i++) s = step(s, []);
    expect(station(s, 'drip').potLeft).toBe(10);
    expect(s.pass).toEqual([]);
  });

  it('several pots: pour from the hot one; brew in an empty machine rather than pour a cold cup', () => {
    const s = POTS('d2', 'd2');
    const [a, b] = [station(s, 'drip'), station(s, 'drip-2')];
    fill(s, a, 3, true);
    fill(s, b, 3);
    sim(s).pos = { x: a.pos.x, y: 2 }; // standing by the cold one
    expect(ids(chainFor(s, sim(s), 'drip', 'serve'))[0]).toBe('drip-2:insert');
    b.output = null;
    delete b.potLeft;
    expect(ids(chainFor(s, sim(s), 'drip', 'serve'))[0]).toBe('drip-2:insert'); // brew there
  });

  it('only a cold pot: the cup is poured and served (half tip), no bin-and-repour loop', () => {
    let s = POTS('d2');
    fill(s, station(s, 'drip'), 3, true);
    s.customers = [order(1010, 'drip')];
    s = serveAll(s, 60 * 60);
    expect(s.today.drinks!.drip).toBe(1);
    expect(s.today.wasted ?? 0).toBe(0);
    expect(station(s, 'drip').potLeft).toBe(2);
  });

  it('a temperature miss with a hot pot elsewhere: one retry (bin, pour again), then serve', () => {
    let s = POTS('d2', 'd2');
    const [a, b] = [station(s, 'drip'), station(s, 'drip-2')];
    fill(s, a, 3);
    fill(s, b, 3);
    a.potOff = 'cold'; // brewed off: every cup from it complains
    const p = sim(s);
    p.pos = { x: a.pos.x, y: 2 };
    s.customers = [order(1020, 'drip')];
    p.bot!.claim = 1020;
    p.bot!.claimDrink = 'drip';
    p.bot!.plan = [{ kind: 'use', station: 'drip', action: 'insert', makes: 'drip' }, { kind: 'use', station: 'drip', action: 'take' }, { kind: 'use', station: 'counter', action: 'serve' }];
    s = serveAll(s, 60 * 60);
    expect(s.today.drinks!.drip).toBe(1);
    expect(s.today.wasted ?? 0).toBe(1); // the one retry
    expect(station(s, 'drip').potLeft).toBe(2); // the off cup, binned
    expect(station(s, 'drip-2').potLeft).toBe(2); // the good cup came from the hot pot
  });

  it('a second miss on the same claim is served as it is', () => {
    let s = POTS('d2', 'd2');
    fill(s, station(s, 'drip-2'), 3);
    const p = sim(s);
    s.customers = [order(1030, 'drip')];
    p.holding = 'drip';
    p.cupTemp = true;
    p.bot!.claim = 1030;
    p.bot!.claimDrink = 'drip';
    p.bot!.retried = 1030;
    p.bot!.plan = [{ kind: 'use', station: 'counter', action: 'serve' }];
    s = serveAll(s, 60 * 30);
    expect(s.today.wasted ?? 0).toBe(0);
    expect(station(s, 'drip-2').potLeft).toBe(3);
  });
});
