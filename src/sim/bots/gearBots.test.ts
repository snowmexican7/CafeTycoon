import { describe, it, expect } from 'vitest';
import { createRun, startDay } from '../run';
import { step } from '../step';
import { stationsFromSlots, type SlotContent } from '../slots';
import { recipeAt, interact } from '../stations';
import { gearArea } from '../gear';
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
  s.milkOut = 99; // FB2 A4: plenty of milk out at the bar too
  // Park the human out of the way, below the counter row.
  s.players[0].pos = { x: 10, y: 5 };
  return s;
}

const huge = { patienceLeft: 100_000, patienceMax: 100_000 };
const order = (id: number, drink: DrinkId, extra: Partial<Customer> = {}): Customer => ({ id, drink, ...huge, ...extra });
const sim = (s: GameState, n = 1): Player => s.players.find((p) => p.id === `sim-${n}`)!;
const ids = (plan: BotStep[]) => plan.map((x) => (x.kind === 'use' ? `${x.station}:${x.action}` : x.kind));
/** Batch/pickup (Task 13): a customer already rung up at the till, so `think` goes straight to making the drink. */
const rung = (id: number, drink: DrinkId, extra: Partial<Customer> = {}): Customer => order(id, drink, { stage: 'pickup', rungAt: 0, ...extra });

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
    expect(ids(chainFor(s, sim(s), 'latte', 'serve'))).toEqual(['espresso:insert', 'espresso:take', 'steamer:insert', 'steamer:take', 'pickup:put']);
    s.customers = [order(900, 'latte')];
    const beans = s.supplies.beans;
    s = serveAll(s);
    expect(s.today.drinks!.latte).toBe(1);
    expect(s.supplies.beans).toBe(beans - 1); // one pod
  });

  it('pods only with a grinder in a slot (smoke fix): bots skip the grinder and still serve', () => {
    let s = gearShop(['grinder', 'espresso', 'trash', null, null, null], ['g2', 'e1', 'b0', null, null, null]);
    expect(ids(chainFor(s, sim(s), 'espresso', 'serve'))).toEqual(['espresso:insert', 'espresso:take', 'pickup:put']);
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
    s.customers = [rung(902, 'espresso')];
    expect(ids(think(s, sim(s)))).toEqual(['espresso:insert', 'espresso:take', 'pickup:put']);
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
      'grinder:insert', 'grinder:take', 'espresso-2:insert', 'espresso-2:take', 'steamer:insert', 'steamer:take', 'pickup:put',
    ]);
    // From grounds in hand, only the E2 will do, even standing right by the pod machine.
    const p = sim(s);
    p.pos = { x: station(s, 'espresso').pos.x, y: 2 };
    expect(ids(chainFor(s, p, 'espresso', 'serve', 'grounds'))).toEqual(['espresso-2:insert', 'espresso-2:take', 'pickup:put']);
  });

  it('the grinder route busy: the pod machine pulls the shot from empty hands', () => {
    const s = mixed();
    station(s, 'espresso-2').busyTicksLeft = 300;
    station(s, 'espresso-2').making = 'espresso';
    expect(ids(chainFor(s, sim(s), 'espresso', 'serve'))).toEqual(['espresso:insert', 'espresso:take', 'pickup:put']);
  });

  it('grounds in hand, no bin, floor at the mess cap: pulled through the E2, never the pod machine', () => {
    const s = gearShop(['grinder', 'espresso', 'espresso', 'steamer', null, null], ['g2', 'e1', 'e2', 's3', null, null]);
    const p = sim(s);
    p.holding = 'grounds';
    p.pos = { x: station(s, 'espresso').pos.x, y: 2 };
    for (let i = 0; s.messes.length < 12; i++) s.messes.push({ id: 500 + i, kind: 'spill', x: 1 + (i % 9), y: 4 + Math.floor(i / 9), amount: 1 });
    expect(ids(think(s, p))).toEqual(['espresso-2:insert', 'espresso-2:take', 'pickup:put']);
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
    expect(ids(chainFor(s, sim(s), 'espresso', 'serve'))).toEqual(['espresso:insert', 'espresso:take', 'pickup:put']);
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
    s.customers = [rung(940, 'latte'), rung(941, 'espresso')];
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
    s.customers = [rung(1000, 'drip')];
    expect(ids(think(s, sim(s)))).toEqual(['drip:insert', 'drip:take', 'pickup:put']);
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

describe('item 5: level-up drinks (G6/G6b/G6c, G10a) and the recipe clash', () => {
  const NEW: DrinkId[] = ['americano', 'cappuccino', 'doppio', 'sweetCream', 'cafeAuLait', 'redEye', 'icedLatte', 'mocha', 'drip'];
  const FULL = (o: Parameters<typeof gearShop>[2] = {}) =>
    gearShop(['grinder', 'espresso', 'steamer', 'coldBrewTap', 'drip', 'trash'], ['g2', 'e3', 's3', 'c4', 'd3', 'b0'], { drinks: NEW, ...o });

  for (const d of ['americano', 'cappuccino', 'doppio', 'sweetCream', 'cafeAuLait', 'redEye', 'icedLatte', 'mocha'] as DrinkId[]) {
    it(`a bot makes and serves a ${d} end to end`, () => {
      let s = FULL();
      s.customers = [order(1100, d)];
      s = serveAll(s, 60 * 90);
      expect(s.today.drinks![d]).toBe(1);
      expect(s.today.wasted ?? 0).toBe(0);
    });
  }

  it('the chains: drip pours in hand go on to the steamer or the espresso machine', () => {
    const s = FULL();
    expect(ids(chainFor(s, sim(s), 'cafeAuLait', 'serve'))).toEqual(['drip:insert', 'drip:take', 'steamer:insert', 'steamer:take', 'pickup:put']);
    expect(ids(chainFor(s, sim(s), 'redEye', 'serve'))).toEqual(['drip:insert', 'drip:take', 'espresso:insert', 'espresso:take', 'pickup:put']);
    expect(ids(chainFor(s, sim(s), 'sweetCream', 'serve'))).toEqual(['coldBrewTap:insert', 'coldBrewTap:insert', 'coldBrewTap:take', 'pickup:put']); // Task 14: the pour is one step
    expect(chainFor(s, sim(s), 'americano', 'serve').find((x) => x.kind === 'use' && x.makes === 'americano')).toMatchObject({ station: 'espresso' });
  });

  it('americano and red-eye never go on a pod machine: the shot may, the top-up goes to the E2', () => {
    const s = gearShop(['espresso', 'espresso', 'drip', 'trash', null, null], ['e1', 'e2', 'd3', 'b0', null, null], { drinks: ['americano', 'redEye', 'drip'] });
    expect(ids(chainFor(s, sim(s), 'americano', 'serve'))).toEqual(['espresso:insert', 'espresso:take', 'espresso-2:insert', 'espresso-2:take', 'pickup:put']);
    expect(ids(chainFor(s, sim(s), 'redEye', 'serve'))).toEqual(['drip:insert', 'drip:take', 'espresso-2:insert', 'espresso-2:take', 'pickup:put']);
    const pods = gearShop(['espresso', 'drip', 'trash', null, null, null], ['e1', 'd3', 'b0', null, null, null], { drinks: ['americano', 'redEye', 'drip'] });
    expect(chainFor(pods, sim(pods), 'americano', 'serve')).toEqual([]);
    expect(chainFor(pods, sim(pods), 'redEye', 'serve')).toEqual([]);
  });

  it('clash: an older mocha ticket claimed by someone else keeps this bot off the cappuccino', () => {
    let s = FULL({ standIns: 2 });
    s.customers = [rung(1200, 'mocha'), rung(1201, 'cappuccino')];
    const other = sim(s, 2);
    other.bot!.claim = 1200;
    other.bot!.claimDrink = 'mocha';
    other.bot!.plan = [{ kind: 'idle', node: { x: 9, y: 4 } }];
    other.pos = { x: 9, y: 4 };
    const plan = think(s, sim(s));
    expect(sim(s).bot!.claim).toBeNull(); // (it preps cold brew instead)
    expect(plan.some((x) => x.kind === 'use' && x.station.startsWith('steamer'))).toBe(false);
    s.customers = [rung(1201, 'cappuccino')]; // the mocha is gone: now the steamer makes cappuccino
    expect(ids(think(s, sim(s)))).toContain('pickup:put');
    expect(sim(s).bot!.claim).toBe(1201);
  });

  it('clash: the oldest such ticket is its own, so the bot carries the latte to the steamer', () => {
    let s = FULL();
    s.customers = [order(1210, 'cappuccino'), order(1211, 'mocha')];
    s = serveAll(s, 60 * 120);
    expect(s.today.drinks!.cappuccino).toBe(1);
    expect(s.today.drinks!.mocha).toBe(1);
    expect(s.today.wasted ?? 0).toBe(0);
  });

  it('clash at the machine: an older mocha appears while the bot holds a latte for a cappuccino; it waits, then makes the cappuccino', () => {
    let s = FULL();
    const p = sim(s);
    const steamer = s.stations.find((x) => x.id === 'steamer')!;
    p.pos = { x: steamer.pos.x, y: 2 };
    p.holding = 'latte';
    s.customers = [order(1220, 'mocha'), order(1221, 'cappuccino')];
    p.bot!.claim = 1221;
    p.bot!.claimDrink = 'cappuccino';
    p.bot!.plan = [{ kind: 'use', station: 'steamer', action: 'insert', makes: 'cappuccino' }, { kind: 'use', station: 'steamer', action: 'take' }, { kind: 'use', station: 'counter', action: 'serve' }];
    for (let i = 0; i < 120; i++) s = step(s, []);
    expect(sim(s).holding).toBe('latte');
    expect(s.stations.find((x) => x.id === 'steamer')!.making ?? null).toBeNull();
    s.customers = s.customers.filter((c) => c.id !== 1220);
    s = serveAll(s, 60 * 60);
    expect(s.today.drinks!.cappuccino).toBe(1);
    expect(s.today.drinks!.mocha ?? 0).toBe(0);
  });

  it('americano/doppio clash at the espresso machine: only the oldest such ticket is taken', () => {
    let s = FULL({ standIns: 2 });
    s.customers = [order(1230, 'doppio'), order(1231, 'americano')];
    s = serveAll(s, 60 * 120);
    expect(s.today.drinks!.doppio).toBe(1);
    expect(s.today.drinks!.americano).toBe(1);
    expect(s.today.wasted ?? 0).toBe(0);
  });

  it('pour-over: made from empty hands on the pour-over bar, never on the pot drip machine', () => {
    let s = gearShop(['drip', 'drip', 'trash', null, null, null], ['d3', 'd4b', 'b0', null, null, null], { drinks: ['drip', 'pourOver'] });
    const p = sim(s);
    p.pos = { x: s.stations[0].pos.x, y: 2 }; // standing by the urn
    expect(ids(chainFor(s, p, 'pourOver', 'serve'))).toEqual(['drip-2:insert', 'drip-2:take', 'pickup:put']);
    expect(ids(chainFor(s, p, 'drip', 'serve'))).toEqual(['drip:insert', 'drip:take', 'pickup:put']);
    s.customers = [order(1240, 'pourOver'), order(1241, 'drip')];
    s = serveAll(s, 60 * 90);
    expect(s.today.drinks!.pourOver).toBe(1);
    expect(s.today.drinks!.drip).toBe(1);
  });

  it('a busy afternoon of every new drink with two bots: all served, nothing binned', () => {
    let s = FULL({ standIns: 2 });
    s.customers = NEW.map((d, i) => rung(1300 + i, d)); // already rung: this is about the drinks (ringing: pickupBots.test.ts)
    s = serveAll(s, 60 * 300);
    expect(s.today.served).toBe(NEW.length);
    expect(s.today.wasted ?? 0).toBe(0);
  });
});

describe('item 6: multiples and twins (G4e, G9)', () => {
  const planned = (s: GameState) => s.players.flatMap((p) => (p.bot ? p.bot.plan : [])).filter((x) => x.kind === 'use').map((x) => (x as { station: string }).station);

  it('E5 twins: two bots on two espresso orders pull on different groups, and both are served', () => {
    let s = gearShop(['grinder', 'grinder', 'espresso', 'steamer', 'trash', null], ['g2', 'g2', 'e5', 's3', 'b0', null], { standIns: 2 });
    expect(s.stations.filter((x) => x.kind === 'espresso').map((x) => x.id)).toEqual(['espresso', 'espresso-2']);
    s.customers = [rung(1400, 'espresso'), rung(1401, 'espresso')];
    for (let i = 0; i < 12; i++) s = step(s, []);
    const groups = [sim(s, 1), sim(s, 2)].map((p) => p.bot!.plan.find((x) => x.kind === 'use' && x.makes === 'espresso' && x.station.startsWith('espresso')) as { station: string });
    expect(groups.every(Boolean)).toBe(true);
    expect(groups[0].station).not.toBe(groups[1].station);
    s = serveAll(s, 60 * 60);
    expect(s.today.drinks!.espresso).toBe(2);
  });

  it('a second copy of a machine (G4e): two latte orders steam on both steamers', () => {
    let s = gearShop(['grinder', 'espresso', 'steamer', 'steamer', 'trash', 'grinder'], ['g2', 'e3', 's2', 's2', 'b0', 'g2'], { standIns: 2 });
    s.customers = [rung(1410, 'latte'), rung(1411, 'latte')];
    const used = new Set<string>();
    s = serveAll(s, 60 * 90, (x) => { for (const st of x.stations) if (st.kind === 'steamer' && st.busyTicksLeft > 0) used.add(st.id); });
    expect(s.today.drinks!.latte).toBe(2);
    expect([...used].sort()).toEqual(['steamer', 'steamer-2']);
  });

  it('edge slot: an outer twin with no node to stand on is human-only; bots never target it and do not hang', () => {
    // E5 in the stand's first slot: the second group sits at x 0.45, out of reach of every whole tile.
    let s = gearShop(['espresso', 'grinder', 'steamer', 'trash'], ['e5', 'g2', 's3', 'b0'], { standIns: 2, tier: 'stand' });
    const outer = s.stations.find((x) => x.id === 'espresso-2')!;
    expect(outer.twin).toBe(true);
    expect(outer.pos.x).toBeLessThan(1);
    s.customers = [order(1420, 'espresso'), order(1421, 'espresso'), order(1422, 'latte')];
    s.players[0].pos = { x: 6, y: 4 };
    let touched = false;
    s = serveAll(s, 60 * 90, (x) => { if (planned(x).includes('espresso-2')) touched = true; });
    expect(touched).toBe(false);
    expect(s.today.served).toBe(3);
  });

  it('edge slot on the last column: the same for the outer twin on the right', () => {
    let s = gearShop(['grinder', 'steamer', 'trash', 'espresso'], ['g2', 's3', 'b0', 'e6'], { standIns: 1, tier: 'stand' });
    const outer = s.stations.find((x) => x.id === 'espresso-2')!;
    expect(outer.pos.x).toBeGreaterThan(7);
    s.players[0].pos = { x: 4, y: 4 };
    s.customers = [order(1430, 'espresso'), order(1431, 'espresso')];
    let touched = false;
    s = serveAll(s, 60 * 90, (x) => { if (planned(x).includes('espresso-2')) touched = true; });
    expect(touched).toBe(false);
    expect(s.today.served).toBe(2);
  });
});

describe('item 7: careful cups (G10b): no early pulls for the arts crowd or a snob regular', () => {
  /** A hurried bot at the espresso machine, the shot in its last 40%, a queue of four (it would pull early). */
  function hurriedAtShot(seed: number, snob: boolean): GameState {
    const s = gearShop(['grinder', 'espresso', 'trash', null, null, null], ['g2', 'e3', 'b0', null, null, null], { seed });
    const esp = s.stations.find((x) => x.id === 'espresso')!;
    esp.making = 'espresso';
    esp.busyTotal = 100;
    esp.busyTicksLeft = 40;
    s.customers = Array.from({ length: 4 }, (_, i) => order(1500 + i, 'espresso'));
    if (snob) {
      s.regulars.push({ name: 'Ines', drink: 'espresso', visits: 3, lost: 0, snob: true });
      s.customers[0] = order(1500, 'espresso', { kind: 'regular', name: 'Ines' });
    }
    const p = sim(s);
    p.pos = { x: esp.pos.x, y: 2 };
    p.bot!.personality = 'hurried';
    p.bot!.claim = 1500;
    p.bot!.claimDrink = 'espresso';
    p.bot!.plan = [{ kind: 'use', station: 'espresso', action: 'take' }, { kind: 'use', station: 'counter', action: 'serve' }];
    return s;
  }
  const seedFor = (arts: boolean) => {
    for (let seed = 1; ; seed++) if ((gearArea(createRun({ seed, hostId: 'p1', players: [], gear: true })) === 'arts') === arts) return seed;
  };
  const pulled = (s: GameState) => {
    let early = false;
    for (let i = 0; i < 4; i++) {
      s = step(s, []);
      if (s.log.some((e) => e.kind === 'cup.early')) early = true;
    }
    return early;
  };

  it('elsewhere a hurried bot pulls early (the control)', () => {
    expect(pulled(hurriedAtShot(seedFor(false), false))).toBe(true);
  });

  it('in the arts district it waits the shot out', () => {
    expect(pulled(hurriedAtShot(seedFor(true), false))).toBe(false);
  });

  it('for a snob regular it waits the shot out', () => {
    expect(pulled(hurriedAtShot(seedFor(false), true))).toBe(false);
  });
});

describe('fix round 1', () => {
  it('I1: the steamer dies while the shot is still pulling: the re-plan carries that shot to the other steamer', () => {
    let s = gearShop(['grinder', 'espresso', 'steamer', 'steamer', 'trash', null], ['g2', 'e3', 's1', 's2', 'b0', null]);
    const s1 = s.stations.find((x) => x.id === 'steamer')!;
    sim(s).pos = { x: s1.pos.x, y: 2 }; // it plans the latte on s1
    s.customers = [rung(1600, 'latte')];
    s = runUntil(s, (x) => {
      const plan = sim(x).bot!.plan;
      return plan[0]?.kind === 'use' && plan[0].station === 'espresso' && plan[0].action === 'take' && plan[1]?.kind === 'use' && plan[1].station === 'steamer';
    }, 60 * 60);
    s.stations.find((x) => x.id === 'steamer')!.dead = true;
    s = step(s, []);
    expect(ids(sim(s).bot!.plan).slice(0, 3)).toEqual(['espresso:take', 'steamer-2:insert', 'steamer-2:take']);
    expect(sim(s).bot!.claim).toBe(1600);
    s = serveAll(s, 60 * 60);
    expect(s.today.drinks!.latte).toBe(1);
    expect(s.pass).toEqual([]);
  });

  it('I2: a drink left on an out-of-reach edge twin is no orphan for bots: the bot keeps serving', () => {
    let s = gearShop(['espresso', 'grinder', 'steamer', 'trash'], ['e5', 'g2', 's3', 'b0'], { standIns: 1, tier: 'stand' });
    const outer = s.stations.find((x) => x.id === 'espresso-2')!;
    outer.output = 'espresso';
    outer.outputSince = s.tick - 10_000; // a person's shot, long abandoned
    s.players[0].pos = { x: 6, y: 4 };
    s.customers = [order(1610, 'latte'), order(1611, 'espresso'), order(1612, 'latte')];
    let touched = false;
    for (let i = 0; i < 60 * 60; i++) {
      s = step(s, []);
      if (sim(s).bot!.plan.some((x) => x.kind === 'use' && x.station === 'espresso-2')) touched = true;
    }
    expect(touched).toBe(false);
    expect(s.today.served).toBeGreaterThanOrEqual(2);
  });

  it('I3: an order the bar cannot make (americano on pods only) does not stop the bot mopping', () => {
    let s = gearShop(['espresso', 'trash', null, null, null, null], ['e1', 'b0', null, null, null, null], { drinks: ['americano'] });
    for (let i = 0; i < 6; i++) s.messes.push({ id: 700 + i, kind: 'spill', x: 2 + i, y: 4, amount: 1 });
    s.cleanliness = 0.1;
    s.customers = [order(1620, 'americano')];
    let mopped = 0;
    for (let i = 0; i < 60 * 30; i++) {
      s = step(s, []);
      if (sim(s).tool === 'mop') mopped++;
    }
    expect(mopped).toBeGreaterThan(0);
    expect(s.messes.length).toBe(0);
  });
});
