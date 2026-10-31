import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { applyGearInput, applyWandInput, gearPullMul, snobFamilies, wandCards } from './gear';
import { applyGrowInput } from './growth';
import { interact } from './stations';
import { ensureCounterSpots, reasonOff, stationsFromSlots, TWIN_OFFSET } from './slots';
import { availableDrinks } from './customers';
import { validateInput } from './validate';
import { LEVEL_UPS, levelUpGearOk } from './levelUp';
import { eligibleChallenges } from './challenges';
import { TICK_RATE } from './constants';
import { nearestStation } from './movement';
import { targetNodes } from './bots/path';
import { planNight, wandFirst } from './bots/planner';
import { addStandIns } from './bots/roster';
import { createSnapshotStore, SNAPSHOT_VERSION } from '../storage/snapshotStore';
import { memoryStorage } from '../storage/storageLike';
import { GEAR, GEAR_IDS, GEAR_TREES, WANDS, WAND_SECONDS, WAND_UPGRADE, treeTiers, type AddOnWand, type GearId } from '../data/gear';
import { FRIDGE_ID, LAYOUT, SINK_ID, SLOT_POSITIONS } from '../data/layout';
import { BASE_DRINKS } from '../data/drinks';
import type { GameState, PlayerId, Station, SupplyId, TierId } from './types';

const gearRun = (tier: TierId = 'stand', players = 1): GameState =>
  createRun({
    seed: 7,
    hostId: 'p1',
    players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: ['Kay', 'Mo', 'Ari'][i]! })),
    settings: { bots: 0 },
    tier,
    gear: true,
  });
const buy = (s: GameState, gear: GearId, wand?: AddOnWand, by: PlayerId = 'p1') =>
  applyGearInput(s, { kind: 'gear', playerId: by, action: 'buy', gear, ...(wand ? { wand } : {}) });
const addWand = (s: GameState, station: string, wand: AddOnWand, by: PlayerId = 'p1') => applyWandInput(s, { kind: 'wand', playerId: by, station, wand });
const st = (s: GameState, id: string): Station => s.stations.find((x) => x.id === id)!;
const wandOf = (s: GameState): Station | undefined => s.stations.find((x) => x.kind === 'steamer');
const logs = (s: GameState, kind: string) => s.log.filter((e) => e.kind === kind).map((e) => e.data);

/** A stand at night with a grinder in slot 0 and `gear` (with `wand`) in slot 1, and plenty of cash. */
function stand(gear: GearId, wand?: AddOnWand, cash = 1000): GameState {
  const s = gearRun('stand');
  s.cash = cash;
  buy(s, 'g2');
  buy(s, gear, wand);
  return s;
}

describe('FB2 C9: the espresso ladder and its wands (data)', () => {
  it('six tiers in order, prices as approved, about half back on a sale, each tier a clear step faster', () => {
    const rows = treeTiers('espresso').map((g) => [g.id, g.name, g.price, g.sell]);
    expect(rows).toEqual([
      ['e1', 'Pod-o-Matic 3000', 45, 8],
      ['e2', 'Brevelle "Barista Distress"', 80, 35],
      ['e3', 'Sylvia the Prosumer', 150, 75],
      ['e4', 'La Marzipana Due', 260, 130],
      ['e5', 'The Annihilator', 450, 225],
      ['e6', 'Double Trouble', 800, 400],
    ]);
    const secs = treeTiers('espresso').map((g) => Math.round((5 / g.speed) * 100) / 100);
    expect(secs).toEqual([6, 5.56, 5, 4.5, 3.5, 3]);
    // two groups from E4 up; +1★ cap and ×1.2 at the top two; E4 ×1.1
    expect(['e4', 'e5', 'e6'].map((id) => GEAR[id as GearId].twin?.includes('espresso'))).toEqual([true, true, true]);
    expect(['e3', 'e4', 'e5', 'e6'].map((id) => GEAR[id as GearId].priceMul ?? 1)).toEqual([1, 1.1, 1.2, 1.2]);
    expect([GEAR.e5.polish, GEAR.e6.polish]).toEqual([true, true]);
    expect(GEAR.e5.influencerOdds).toBe(1.5); // very loud
  });

  it('wands: none on E1/E2, an add-on on E3 (weak) and E4 (weak or strong), built in on E5/E6 (E6 the fastest)', () => {
    expect([GEAR.e1.wand, GEAR.e2.wand]).toEqual([undefined, undefined]);
    expect(GEAR.e3.wand).toEqual({ addOns: ['weak'] });
    expect(GEAR.e4.wand).toEqual({ addOns: ['weak', 'strong'] });
    expect(GEAR.e5.wand?.built?.seconds).toBe(WAND_SECONDS.built);
    expect(GEAR.e6.wand?.built?.seconds).toBe(WAND_SECONDS.dualBoiler);
    expect([WANDS.weak.seconds, WANDS.strong.seconds, WAND_SECONDS.built, WAND_SECONDS.dualBoiler]).toEqual([4.5, 3.5, 3.5, 3]);
    expect([WANDS.weak.withMachine, WANDS.weak.later, WANDS.strong.withMachine, WAND_UPGRADE]).toEqual([25, 30, 40, 15]);
    for (const w of Object.values(WANDS)) expect(w.sell).toBeLessThan(w.withMachine);
  });

  it('the steamer tree is gone: no shop line, no gear row makes a steamer station', () => {
    expect(GEAR_TREES.map((t) => t.id)).not.toContain('steamer');
    expect(GEAR_IDS.filter((id) => GEAR[id].station === 'steamer')).toEqual([]);
    expect(GEAR_IDS.some((id) => /^s\d$/.test(id))).toBe(false);
  });
});

describe('FB2 C9: buying a wand', () => {
  it('E3 with the little wand: $175, the machine carries `wand`, a steamer twin beside it is the wand', () => {
    const s = stand('e3', 'weak');
    expect(s.cash).toBe(1000 - 30 - 175);
    expect(s.slotWand).toEqual([null, 'weak', null, null]);
    const esp = st(s, 'espresso');
    expect(esp.wand).toBe('weak');
    const wand = wandOf(s)!;
    expect(wand).toMatchObject({ id: 'steamer', kind: 'steamer', twin: true, wand: 'weak', wandOf: 'e3' });
    expect(wand.gear).toBeUndefined();
    expect(wand.pos).toEqual({ x: esp.pos.x + TWIN_OFFSET, y: esp.pos.y });
    expect(logs(s, 'wand.add')).toEqual([{ station: 'espresso', wand: 'weak', by: 'p1' }]);
    expect(s.gearLog!.at(-1)).toMatchObject({ gear: 'e3', action: 'buy', cash: -175, wand: 'weak' });
  });

  it('E3 without one: $150, no wand, no steamer anywhere; the add-on is offered for $30', () => {
    const s = stand('e3');
    expect(s.cash).toBe(1000 - 30 - 150);
    expect(st(s, 'espresso').wand).toBeUndefined();
    expect(wandOf(s)).toBeUndefined();
    expect(wandCards(s)).toEqual([{ station: 'espresso', index: 1, gear: 'e3', wand: 'weak', price: 30, upgrade: false }]);
  });

  it('adding one later: $30, logged as wand.add and a gearLog "wand" row; the card goes away', () => {
    let s = stand('e3');
    const cash = s.cash;
    s = step(s, [{ kind: 'wand', playerId: 'p1', station: 'espresso', wand: 'weak' }]);
    expect(s.cash).toBe(cash - 30);
    expect(st(s, 'espresso').wand).toBe('weak');
    expect(wandOf(s)?.wand).toBe('weak');
    expect(logs(s, 'wand.add')).toEqual([{ station: 'espresso', wand: 'weak', by: 'p1' }]);
    expect(s.gearLog!.at(-1)).toMatchObject({ gear: 'e3', action: 'wand', cash: -30, wand: 'weak' });
    expect(wandCards(s)).toEqual([]);
  });

  it('refused: a strong wand on E3, any wand on E1/E2, built-in E5/E6 (nothing offered), by day, by a bot, short of cash', () => {
    const e3 = stand('e3');
    const cash = e3.cash;
    addWand(e3, 'espresso', 'strong');
    expect([e3.cash, st(e3, 'espresso').wand]).toEqual([cash, undefined]);
    // buying E3 "with" a strong wand is refused outright
    const e3s = stand('e3', 'strong');
    expect(e3s.slotGear).not.toContain('e3');
    for (const id of ['e1', 'e2'] as const) {
      const s = stand(id);
      expect(wandCards(s)).toEqual([]);
      addWand(s, 'espresso', 'weak');
      expect(wandOf(s)).toBeUndefined();
      const w = stand(id, 'weak');
      expect(w.slotGear).not.toContain(id);
    }
    for (const id of ['e5', 'e6'] as const) {
      const s = stand(id);
      expect(st(s, 'espresso').wand).toBe('built');
      expect(wandCards(s)).toEqual([]);
      const c = s.cash;
      addWand(s, 'espresso', 'strong');
      expect(s.cash).toBe(c);
    }
    const day = startDay(stand('e3'));
    addWand(day, 'espresso', 'weak');
    expect(st(day, 'espresso').wand).toBeUndefined();
    const bot = stand('e3');
    bot.players[0]!.bot = { personality: 'human' } as never;
    addWand(bot, 'espresso', 'weak');
    expect(st(bot, 'espresso').wand).toBeUndefined();
    const poor = stand('e3', undefined, 30 + 150 + 29);
    addWand(poor, 'espresso', 'weak');
    expect([poor.cash, st(poor, 'espresso').wand]).toEqual([29, undefined]);
  });

  it('E4: the little wand or the proper one, with the machine or later; little → proper costs the difference', () => {
    const strong = stand('e4', 'strong');
    expect(strong.cash).toBe(1000 - 30 - 300);
    expect(wandOf(strong)?.wand).toBe('strong');
    const s = stand('e4');
    expect(wandCards(s).map((c) => [c.wand, c.price])).toEqual([['weak', 30], ['strong', 40]]);
    addWand(s, 'espresso', 'weak');
    expect(wandCards(s)).toEqual([{ station: 'espresso', index: 1, gear: 'e4', wand: 'strong', price: WAND_UPGRADE, upgrade: true }]);
    const cash = s.cash;
    addWand(s, 'espresso', 'strong');
    expect(s.cash).toBe(cash - 15);
    expect([st(s, 'espresso').wand, wandOf(s)?.wand, s.slotWand?.[1]]).toEqual(['strong', 'strong', 'strong']);
    expect(wandCards(s)).toEqual([]);
    // E4 with a wand: the wand right, the second group left
    const esp = st(s, 'espresso');
    expect(wandOf(s)!.pos.x).toBeCloseTo(esp.pos.x + TWIN_OFFSET);
    expect(st(s, 'espresso-2').pos.x).toBeCloseTo(esp.pos.x - TWIN_OFFSET);
  });

  it('replacing or selling a machine drops its wand, with the wand\'s sell value back', () => {
    const s = stand('e3', 'weak');
    const cash = s.cash;
    buy(s, 'e4'); // E3 ($75) + its little wand ($10) traded in
    expect(s.cash).toBe(cash + 75 + 10 - 260);
    expect(s.slotWand?.[1]).toBeNull();
    expect(wandOf(s)).toBeUndefined();
    expect(s.gearLog!.at(-2)).toMatchObject({ gear: 'e3', action: 'sell', cash: 85, wand: 'weak' });
    addWand(s, 'espresso', 'strong');
    const c2 = s.cash;
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'sell', index: 1 });
    expect(s.cash).toBe(c2 + 130 + 20);
    expect([s.slotGear?.[1], s.slotWand?.[1], wandOf(s)]).toEqual([null, null, undefined]);
  });

  it('growing keeps a wand on its machine', () => {
    const s = stand('e3', 'weak');
    applyGrowInput(s, { kind: 'grow', playerId: 'p1', tier: 'cart' });
    expect(s.slotWand).toEqual([null, 'weak', null, null, null]);
    expect(wandOf(s)?.wand).toBe('weak');
  });

  it('co-op: E3 with a wand is one $175 proposal, and passing it buys both', () => {
    const s = gearRun('stand', 2);
    s.cash = 1000;
    buy(s, 'g2');
    buy(s, 'e3', 'weak');
    expect(s.gearVote).toMatchObject({ gear: 'e3', amount: 175, wand: 'weak' });
    applyGearInput(s, { kind: 'gear', playerId: 'p2', action: 'vote', yes: true });
    expect(s.gearVote).toBeUndefined();
    expect(s.cash).toBe(1000 - 30 - 175);
    expect(wandOf(s)?.wand).toBe('weak');
    // a wand later is under $50: no vote
    const t = gearRun('stand', 2);
    t.cash = 1000;
    t.slots = ['grinder', 'espresso', null, 'trash'];
    t.slotGear = ['g2', 'e3', null, 'b0'];
    t.slotWand = [null, null, null, null];
    t.stations = stationsFromSlots(t.tier, t.slots, t.slotGear, t.slotWand);
    addWand(t, 'espresso', 'weak', 'p2');
    expect([t.gearVote, wandOf(t)?.wand]).toEqual([undefined, 'weak']);
  });

  it('review M1: co-op refuses a wand the machine can\'t take, as solo does (no bare-machine proposal)', () => {
    for (const [gear, wand] of [['e2', 'weak'], ['e3', 'strong']] as const) {
      const s = gearRun('stand', 2);
      s.cash = 1000;
      buy(s, 'g2');
      buy(s, gear, wand);
      expect(s.gearVote, `${gear}+${wand}`).toBeUndefined();
      expect(s.slotGear).not.toContain(gear);
    }
  });

  it('validateInput: the wand rides on the gear buy; the wand input needs a station id and a known add-on', () => {
    expect(validateInput({ kind: 'gear', playerId: 'p1', action: 'buy', gear: 'e3', wand: 'weak' })).toEqual({ kind: 'gear', playerId: 'p1', action: 'buy', gear: 'e3', wand: 'weak' });
    expect(validateInput({ kind: 'gear', playerId: 'p1', action: 'buy', gear: 'e3' })).toEqual({ kind: 'gear', playerId: 'p1', action: 'buy', gear: 'e3' });
    expect(validateInput({ kind: 'gear', playerId: 'p1', action: 'buy', gear: 'e3', wand: 'built' } as never)).toBeNull();
    expect(validateInput({ kind: 'wand', playerId: 'p1', station: 'espresso', wand: 'strong' })).toEqual({ kind: 'wand', playerId: 'p1', station: 'espresso', wand: 'strong' });
    expect(validateInput({ kind: 'wand', playerId: 'p1', station: 'espresso', wand: 'built' } as never)).toBeNull();
    expect(validateInput({ kind: 'wand', playerId: 'p1', station: 7, wand: 'weak' } as never)).toBeNull();
    expect(validateInput({ kind: 'wand', playerId: 'p1', station: '', wand: 'weak' } as never)).toBeNull();
    expect(validateInput({ kind: 'wand', playerId: 'p1', station: 'x'.repeat(40), wand: 'weak' } as never)).toBeNull();
  });
});

/** A stand open for the day with `gear` (and `wand`) in slot 1, milk out at the bar and the classics on the menu. */
function open(gear: GearId, wand?: AddOnWand): GameState {
  const s = stand(gear, wand);
  for (const k of Object.keys(s.supplies) as SupplyId[]) s.supplies[k] = 50;
  s.fridge = 'f1';
  const d = startDay(s);
  d.milkOut = 999;
  return d;
}
/** Stand p1 where only the wand is in reach (a tile right of the machine, one row down). */
const atWand = (s: GameState) => {
  const w = wandOf(s)!;
  s.players[0]!.pos = { x: Math.round(w.pos.x + 0.45), y: w.pos.y + 1 };
  expect(nearestStation(s, s.players[0]!.pos)?.id).toBe(w.id);
};

describe('FB2 C9: steaming at the wand', () => {
  it('no wand, no milk drinks on the board; with one, they are back', () => {
    const s = open('e3');
    expect(reasonOff(s, 'latte')).toBe('noStation');
    expect(availableDrinks(s)).not.toContain('latte');
    const w = open('e3', 'weak');
    expect(reasonOff(w, 'latte')).toBeNull();
    expect(availableDrinks(w)).toContain('latte');
    expect(BASE_DRINKS).toContain('latte');
  });

  it('a shot at the wand makes a latte, at the wand\'s speed (little 4.5 s, proper 3.5 s, E5 3.5 s, E6 3 s)', () => {
    const cases: [GearId, AddOnWand | undefined, number][] = [['e3', 'weak', 4.5], ['e4', 'strong', 3.5], ['e5', undefined, 3.5], ['e6', undefined, 3]];
    for (const [gear, wand, secs] of cases) {
      const s = open(gear, wand);
      atWand(s);
      s.players[0]!.holding = 'espresso';
      s.players[0]!.jug = { fill: 0.6, startedAt: 0, line: 0.6, done: true }; // FB2 B8: a person fills the milk jug first
      interact(s, 'p1');
      const w = wandOf(s)!;
      expect([gear, w.making, w.busyTicksLeft]).toEqual([gear, 'latte', Math.round(secs * TICK_RATE)]);
      expect(s.milkOut).toBe(998);
    }
  });

  it('the little wand clogs now and then: shots can\'t go in until empty hands whack it (no matcha from the whack)', () => {
    const s = open('e3', 'weak');
    s.unlocked = [...(s.unlocked ?? BASE_DRINKS), 'matcha'];
    s.menu.matcha = true;
    atWand(s);
    const w = wandOf(s)!;
    let uses = 0;
    while (!w.jammed && uses < 500) {
      w.busyTicksLeft = 0;
      w.output = null;
      w.making = null;
      s.players[0]!.holding = 'espresso';
      s.players[0]!.jug = { fill: 0.6, startedAt: 0, line: 0.6, done: true }; // FB2 B8: a person fills the milk jug first
      interact(s, 'p1');
      uses++;
    }
    expect(w.jammed).toBe(true);
    expect(logs(s, 'wand.clog')).toEqual([{ station: 'steamer', by: 'p1' }]);
    w.busyTicksLeft = 0;
    w.output = null;
    w.making = null;
    s.players[0]!.holding = 'espresso';
    s.players[0]!.jug = { fill: 0.6, startedAt: 0, line: 0.6, done: true }; // FB2 B8: a person fills the milk jug first
    interact(s, 'p1');
    expect([w.busyTicksLeft, s.players[0]!.holding]).toEqual([0, 'espresso']); // blocked
    s.players[0]!.holding = null;
    interact(s, 'p1');
    expect(w.jammed).toBeUndefined();
    expect([w.busyTicksLeft, w.making ?? null]).toEqual([0, null]); // the whack makes nothing
    expect(logs(s, 'wand.unclog')).toEqual([{ station: 'steamer', by: 'p1' }]);
    s.players[0]!.holding = 'espresso';
    s.players[0]!.jug = { fill: 0.6, startedAt: 0, line: 0.6, done: true }; // FB2 B8: a person fills the milk jug first
    interact(s, 'p1');
    expect(w.making).toBe('latte');
  });

  it('a carton goes out at the wand (milk.out), and the wand steams from it', () => {
    const s = open('e3', 'weak');
    s.milkOut = 0;
    atWand(s);
    s.players[0]!.tool = 'milk';
    s.players[0]!.carry = 8;
    interact(s, 'p1');
    expect([s.players[0]!.tool, s.milkOut]).toEqual([null, 8]);
    expect(logs(s, 'milk.out').at(-1)).toEqual({ by: 'p1', n: 8, station: 'steamer' });
    s.players[0]!.holding = 'espresso';
    s.players[0]!.jug = { fill: 0.6, startedAt: 0, line: 0.6, done: true }; // FB2 B8: a person fills the milk jug first
    interact(s, 'p1');
    expect([wandOf(s)!.making, s.milkOut]).toEqual(['latte', 7]);
  });

  it('proper and built-in wands never clog', () => {
    for (const [gear, wand] of [['e4', 'strong'], ['e5', undefined], ['e6', undefined]] as const) {
      const s = open(gear, wand);
      atWand(s);
      const w = wandOf(s)!;
      for (let i = 0; i < 200; i++) {
        w.busyTicksLeft = 0;
        w.output = null;
        s.players[0]!.holding = 'espresso';
        s.players[0]!.jug = { fill: 0.6, startedAt: 0, line: 0.6, done: true }; // FB2 B8: a person fills the milk jug first
        interact(s, 'p1');
      }
      expect(logs(s, 'wand.clog')).toEqual([]);
    }
  });

  it('milk orders follow the best wand (G7 pull), and a proper wand draws the milk snob', () => {
    expect(gearPullMul(open('e3'), 'latte')).toBe(1);
    expect(gearPullMul(open('e3', 'weak'), 'latte')).toBeCloseTo(1.05);
    expect(gearPullMul(open('e4', 'strong'), 'latte')).toBeCloseTo(1.1);
    expect(gearPullMul(open('e6'), 'latte')).toBeCloseTo(1.15);
    expect(snobFamilies(open('e3', 'weak'))).not.toContain('milky');
    expect(snobFamilies(open('e4', 'strong'))).toContain('milky');
  });

  it('a Gear run deals no challenge for a milk drink it has no wand for', () => {
    const ids = (s: GameState) => eligibleChallenges(s).map((c) => c.id);
    for (const [wand, on] of [[undefined, false], ['weak', true]] as const) {
      const s = stand('e3', wand);
      s.day = 6;
      s.unlocked = [...(s.unlocked ?? BASE_DRINKS), 'matcha', 'mocha'];
      expect(ids(s).includes('sellMatcha5'), `wand ${wand}`).toBe(on);
      expect(ids(s).includes('sellMocha4'), `wand ${wand}`).toBe(on);
    }
  });

  it('café au lait levels up only with a steam wand', () => {
    const l = LEVEL_UPS.find((x) => x.unlocks === 'cafeAuLait')!;
    expect(l.needs).toEqual({ wand: true, label: 'a steam wand' });
    expect(levelUpGearOk(stand('e3'), l)).toBe(false);
    expect(levelUpGearOk(stand('e3', 'weak'), l)).toBe(true);
    expect(levelUpGearOk(stand('e5'), l)).toBe(true);
  });
});

describe('FB2 C9: bots at a wand', () => {
  /** `open` with one stand-in bot, p1 parked out of the way, and `n` latte orders already rung up. */
  function withBot(gear: GearId, wand: AddOnWand | undefined, n: number): GameState {
    const s = stand(gear, wand);
    for (const k of Object.keys(s.supplies) as SupplyId[]) s.supplies[k] = 50;
    s.fridge = 'f1';
    s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
    addStandIns(s, 1);
    const d = startDay(s);
    d.eventSchedule = [];
    d.milkOut = 99;
    d.players[0]!.pos = { x: 6, y: 5 };
    for (let i = 0; i < n; i++) d.customers.push({ id: 100 + i, drink: 'latte', patienceLeft: 100_000, patienceMax: 100_000, stage: 'pickup', rungAt: 0 });
    return d;
  }
  const served = (s: GameState) => s.today.served;
  function run(s: GameState, until: (s: GameState) => boolean, ticks: number, each?: (s: GameState) => void): GameState {
    for (let i = 0; i < ticks && !until(s); i++) {
      s = step(s, []);
      each?.(s);
    }
    return s;
  }

  it('make lattes at an E3 with the little wand and at an E5', () => {
    for (const [gear, wand] of [['e3', 'weak'], ['e5', undefined]] as const) {
      let s = withBot(gear, wand, 3);
      s = run(s, (x) => served(x) >= 3, 60 * 120);
      expect([gear, served(s)]).toEqual([gear, 3]);
    }
  });

  it('a clogged wand gets whacked and the latte is still made; no stall', () => {
    let s = withBot('e3', 'weak', 2);
    wandOf(s)!.jammed = true;
    let by: unknown = null;
    s = run(s, (x) => served(x) >= 2, 60 * 120, (x) => (by ??= logs(x, 'wand.unclog')[0]?.by ?? null));
    expect(served(s)).toBe(2);
    expect(by).toBe('sim-1'); // the stand-in whacked it (p1 is parked away)
  });

  it('a bot holding a shot at a clogged wand gives up past the wait cap rather than stalling', () => {
    let s = withBot('e3', 'weak', 1);
    let clogged = false;
    // clog it the moment the bot has its shot, and keep it clogged for a while (nobody else can whack it)
    s = run(s, () => clogged, 60 * 60, (x) => {
      const bot = x.players.find((p) => p.bot)!;
      if (bot.holding === 'espresso') {
        wandOf(x)!.jammed = true;
        clogged = true;
      }
    });
    expect(clogged).toBe(true);
    s = run(s, (x) => served(x) >= 1, 60 * 120);
    expect(served(s)).toBe(1);
  });

  it('never plan a milk drink without a wand: an E3 bar with no wand leaves latte orders alone', () => {
    let s = withBot('e3', undefined, 2);
    s = run(s, () => false, 60 * 20);
    expect(served(s)).toBe(0);
    expect(s.players.find((p) => p.bot)!.holding).not.toBe('latte');
  });
});

describe('FB2 C9: the floor', () => {
  it('a Gear shop has no steamer but a wand twin, on every tier', () => {
    for (const tier of ['stand', 'cart', 'cafe'] as const) {
      const s = gearRun(tier);
      expect(s.slots).not.toContain('steamer');
      expect(s.stations.some((x) => x.kind === 'steamer')).toBe(false);
    }
  });

  it('a wand machine in any slot: the fridge and the sink keep their reach, and no tile that works the wand is theirs', () => {
    /** A Gear shop with `gear` (and `wand`) alone in slot `i`, its fridge and fixed spots in place. */
    const shop = (tier: TierId, i: number, gear: GearId, wand: AddOnWand | null, withWand: boolean): GameState => {
      const s = gearRun(tier);
      s.fridge = 'f1';
      const n = SLOT_POSITIONS[tier].length;
      s.slots = Array.from({ length: n }, (_, j) => (j === i ? 'espresso' : null));
      s.slotGear = Array.from({ length: n }, (_, j) => (j === i ? gear : null));
      s.slotWand = Array.from({ length: n }, (_, j) => (j === i && withWand ? wand : null));
      s.stations = stationsFromSlots(tier, s.slots, s.slotGear, s.slotWand);
      ensureCounterSpots(s);
      if (!withWand) s.stations = s.stations.filter((x) => x.kind !== 'steamer'); // the same machine, wandless (E6 included)
      return s;
    };
    for (const tier of ['stand', 'cart', 'cafe'] as const) {
      for (let i = 0; i < SLOT_POSITIONS[tier].length; i++) {
        for (const [gear, wand] of [['e3', 'weak'], ['e4', 'strong'], ['e6', null]] as const) {
          const s = shop(tier, i, gear, wand, true);
          const plain = shop(tier, i, gear, wand, false);
          const w = s.stations.find((x) => x.kind === 'steamer');
          expect(w, `${tier} slot ${i} ${gear}`).toBeDefined();
          for (const id of [FRIDGE_ID, SINK_ID]) {
            const nodes = targetNodes(s, st(s, id), LAYOUT.door);
            expect(nodes.length, `${tier} slot ${i} ${gear} ${id}`).toBeGreaterThan(0);
            expect(nodes, `${tier} slot ${i} ${gear} ${id}`).toEqual(targetNodes(plain, st(plain, id), LAYOUT.door));
          }
        }
      }
    }
  });
});

describe('FB2 C9: the planner and saves', () => {
  it('advises the Sylvia with the little wand, and a wand for a Sylvia that has none', () => {
    const s = gearRun('cart');
    s.cash = 1000;
    s.slots = ['grinder', 'espresso', null, null, 'trash'];
    s.slotGear = ['g2', 'e1', null, null, 'b0'];
    s.slotWand = [null, null, null, null, null];
    s.stations = stationsFromSlots(s.tier, s.slots, s.slotGear, s.slotWand);
    s.gearLog = [{ gear: 'c1', action: 'buy', day: 1, by: 'K', cash: -5 }];
    const gear = planNight(s).filter((a) => a.id.startsWith('gear:'));
    // c1 / c2 come first on the path; skip them to look at the espresso step
    s.slots = ['grinder', 'espresso', 'coldBrewTap', null, 'trash'];
    s.slotGear = ['g2', 'e1', 'c3', null, 'b0'];
    s.stations = stationsFromSlots(s.tier, s.slots, s.slotGear, s.slotWand);
    const e3 = planNight(s).find((a) => a.id === 'gear:e3');
    expect(gear.length).toBeGreaterThan(0);
    expect(e3?.input).toEqual({ kind: 'gear', action: 'buy', gear: 'e3', wand: 'weak' });
    expect(e3?.text).toContain('little steam wand');
    s.slotGear = ['g2', 'e3', 'c3', null, 'b0'];
    s.stations = stationsFromSlots(s.tier, s.slots, s.slotGear, s.slotWand);
    const w = planNight(s).find((a) => a.id.startsWith('gear:wand:'));
    expect(w?.input).toEqual({ kind: 'wand', station: 'espresso', wand: 'weak' });
  });

  it('at the cart, the Sylvia and its wand come before growing into the café; a stand still grows to the cart', () => {
    const s = gearRun('cart');
    s.cash = 1000;
    s.days.push({ day: 1, served: 20, lost: 0, turnedAway: 0, sales: 60, tips: 5, rent: 17 });
    s.slots = ['grinder', 'espresso', null, null, 'trash'];
    s.slotGear = ['g1', 'e1', null, null, 'b0'];
    s.slotWand = [null, null, null, null, null];
    s.stations = stationsFromSlots(s.tier, s.slots, s.slotGear, s.slotWand);
    expect(wandFirst(s, 'cafe')).toBe(true);
    expect(planNight(s).some((a) => a.id === 'grow:cafe')).toBe(false);
    s.slots = ['grinder', 'espresso', null, null, 'trash'];
    s.slotGear = ['g2', 'e3', null, null, 'b0'];
    s.slotWand = [null, 'weak', null, null, null];
    s.stations = stationsFromSlots(s.tier, s.slots, s.slotGear, s.slotWand);
    expect(wandFirst(s, 'cafe')).toBe(false);
    expect(planNight(s).some((a) => a.id === 'grow:cafe')).toBe(true);
    const st = gearRun('stand');
    expect(wandFirst(st, 'cart')).toBe(false);
  });

  it('review M3: the café hold needs a grinder and an espresso machine to put a wand on', () => {
    const s = gearRun('cart');
    s.cash = 1000;
    s.days.push({ day: 1, served: 20, lost: 0, turnedAway: 0, sales: 60, tips: 5, rent: 17 });
    const floor = (slots: (Station['kind'] | null)[], gear: (GearId | null)[]) => {
      s.slots = slots;
      s.slotGear = gear;
      s.slotWand = slots.map(() => null);
      s.stations = stationsFromSlots(s.tier, s.slots, s.slotGear, s.slotWand);
    };
    floor(['grinder', 'espresso', null, null, 'trash'], ['g1', 'e1', null, null, 'b0']);
    expect(wandFirst(s, 'cafe')).toBe(true);
    floor(['coldBrewTap', 'drip', 'drip', null, 'trash'], ['c3', 'd3', 'd4b', null, 'b0']); // the cold brew and drip way
    expect(wandFirst(s, 'cafe')).toBe(false);
    expect(planNight(s).some((a) => a.id === 'grow:cafe')).toBe(true);
    floor(['coldBrewTap', 'espresso', 'drip', 'drip', 'trash'], ['c3', 'e1', 'd3', 'd4b', 'b0']); // pods, no grinder slot
    expect(wandFirst(s, 'cafe')).toBe(false);
  });

  it('review M2/M4: an E4 with no wand is advised the proper wand; a second wandless machine waits once a wand is on', () => {
    const s = gearRun('cart');
    s.cash = 1000;
    s.slots = ['grinder', 'espresso', 'coldBrewTap', null, 'trash'];
    s.slotGear = ['g2', 'e4', 'c3', null, 'b0'];
    s.slotWand = [null, null, null, null, null];
    s.stations = stationsFromSlots(s.tier, s.slots, s.slotGear, s.slotWand);
    expect(planNight(s).find((a) => a.id.startsWith('gear:wand:'))?.input).toEqual({ kind: 'wand', station: 'espresso', wand: 'strong' });
    // a second copy of the Sylvia beside an E4 that already steams: no wand advice for it, the path goes on
    s.slots = ['grinder', 'espresso', 'espresso', null, 'trash'];
    s.slotGear = ['g2', 'e4', 'e3', null, 'b0'];
    s.slotWand = [null, 'strong', null, null, null];
    s.stations = stationsFromSlots(s.tier, s.slots, s.slotGear, s.slotWand);
    expect(planNight(s).some((a) => a.id.startsWith('gear:wand:'))).toBe(false);
    expect(planNight(s).some((a) => a.id.startsWith('gear:'))).toBe(true);
  });

  it(`saves from before snapshot ${SNAPSHOT_VERSION} are turned away; a current one loads`, () => {
    const storage = memoryStorage();
    const s = gearRun('stand');
    for (const version of [28, 29]) {
      storage.setItem('cafetycoon.run', JSON.stringify({ version, state: s }));
      expect(createSnapshotStore(storage).load()).toBeNull();
    }
    createSnapshotStore(storage).save(s);
    expect(createSnapshotStore(storage).load()?.gear).toBe(true);
    expect(SNAPSHOT_VERSION).toBe(31); // R4 night: roles/rerolls/equipment gone
  });
});
