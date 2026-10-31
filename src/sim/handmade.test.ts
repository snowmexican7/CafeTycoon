import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { applyGearInput } from './gear';
import { interact, stepStations } from './stations';
import { stepPickup } from './pickup';
import { validateInput } from './validate';
import { nearestStation } from './movement';
import { stationsFromSlots, type SlotContent } from './slots';
import { addStandIns } from './bots/roster';
import { TICK_RATE } from './constants';
import { BASE_DRINKS } from '../data/drinks';
import { SYRUP_ID, SYRUP_SPOT } from '../data/layout';
import type { AddOnWand, GearId } from '../data/gear';
import {
  HANDMADE,
  JUG_LINES,
  addCustomerAsks,
  fillGrade,
  heldRecipe,
  judgeCup,
  steamGrade,
  steamPos,
  stepHandmade,
  wantsDouble,
} from './handmade';
import type { Customer, DrinkId, GameState, HandMade, PassItem, Player, SimEvent, Station, SupplyId } from './types';

/** A stand with a grinder and `gear` (with `wand`), stocked, fridge bought, open for the day, plenty of milk out, no walk-ins. */
function open(gear: GearId = 'e3', wand: AddOnWand | null = 'weak'): GameState {
  const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'Kay' }], settings: { bots: 0 }, tier: 'stand', gear: true });
  s.cash = 1000;
  applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'g2' });
  applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear, ...(wand ? { wand } : {}) });
  for (const k of Object.keys(s.supplies) as SupplyId[]) s.supplies[k] = 50;
  s.fridge = 'f1';
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  const d = startDay(s);
  d.eventSchedule = [];
  d.milkOut = 99;
  d.customers = [];
  return d;
}

const p1 = (s: GameState): Player => s.players.find((p) => p.id === 'p1')!;
const wandOf = (s: GameState): Station => s.stations.find((x) => x.kind === 'steamer')!;
const machine = (s: GameState): Station => s.stations.find((x) => x.kind === 'espresso')!;
const logs = (s: GameState, kind: string) => s.log.filter((e) => e.kind === kind).map((e) => e.data);
/** Advance the clock: stations work and the jug and the meter run (what stepDay does for them). */
function tick(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) {
    s.tick += 1;
    stepStations(s);
    stepHandmade(s);
  }
}
/** Stand p1 where only the wand is in reach. */
function atWand(s: GameState): void {
  const w = wandOf(s);
  p1(s).pos = { x: Math.round(w.pos.x + 0.45), y: w.pos.y + 1 };
  expect(nearestStation(s, p1(s).pos)?.id).toBe(w.id);
}
function atMachine(s: GameState): void {
  const m = machine(s);
  p1(s).pos = { x: m.pos.x, y: m.pos.y + 1 };
  expect(nearestStation(s, p1(s).pos)?.id).toBe(m.id);
}
function atRack(s: GameState): void {
  p1(s).pos = { x: SYRUP_SPOT.x, y: SYRUP_SPOT.y - 1 };
  expect(nearestStation(s, p1(s).pos)?.id).toBe(SYRUP_ID);
}
/** Shot in hand at the wand: start the jug, let it fill `fillTicks`, stop it, put the shot on the wand. */
function fillAndInsert(s: GameState, fillTicks: number): void {
  atWand(s);
  p1(s).holding = 'espresso';
  interact(s, 'p1');
  tick(s, fillTicks);
  interact(s, 'p1');
  interact(s, 'p1');
}
const pickupCustomer = (id: number, drink: DrinkId, extra: Partial<Customer> = {}): Customer => ({ id, drink, patienceLeft: 1e5, patienceMax: 1e5, stage: 'pickup', rungAt: 0, ...extra });
const cup = (made?: HandMade, slips?: number): PassItem => ({ item: 'latte', ticksLeft: 1e5, by: 'p1', madeAt: Infinity, ...(made ? { made } : {}), ...(slips ? { slips } : {}) });
const FILL = HANDMADE.fillSeconds * TICK_RATE;

describe('FB2 B8: the milk jug', () => {
  it('E with a shot at the wand starts the jug at the latte line; it fills 0→1 over 2 s', () => {
    const s = open();
    atWand(s);
    p1(s).holding = 'espresso';
    interact(s, 'p1');
    expect(p1(s).jug).toEqual({ fill: 0, startedAt: s.tick, line: JUG_LINES.latte });
    expect(p1(s).holding).toBe('espresso');
    expect(wandOf(s).making ?? null).toBeNull();
    expect(s.milkOut).toBe(99); // no milk used yet
    tick(s, FILL / 2);
    expect(p1(s).jug!.fill).toBeCloseTo(0.5);
    expect(JUG_LINES).toEqual({ cappuccino: 0.35, latte: 0.6, large: 0.85 });
  });

  it('the line follows the ticket: an older cappuccino ticket marks the cappuccino line', () => {
    const s = open();
    s.unlocked = [...(s.unlocked ?? BASE_DRINKS), 'cappuccino'];
    s.menu.cappuccino = true;
    s.customers = [pickupCustomer(1, 'cappuccino'), pickupCustomer(2, 'latte')];
    atWand(s);
    p1(s).holding = 'espresso';
    interact(s, 'p1');
    expect(p1(s).jug!.line).toBe(JUG_LINES.cappuccino);
  });

  for (const [ticks, grade, milk] of [[0.6 * FILL, 'right', 1], [0.3 * FILL, 'under', 1], [0.9 * FILL, 'over', 2]] as const) {
    it(`stopped at ${ticks / FILL}: ${grade}; the shot goes on with ${milk} milk out of milkOut`, () => {
      const s = open();
      atWand(s);
      p1(s).holding = 'espresso';
      interact(s, 'p1');
      tick(s, ticks);
      interact(s, 'p1');
      expect(p1(s).jug).toMatchObject({ done: true, line: JUG_LINES.latte });
      expect(p1(s).jug!.fill).toBeCloseTo(ticks / FILL);
      expect(logs(s, 'milk.fill')).toEqual([{ by: 'p1', level: p1(s).jug!.fill, line: JUG_LINES.latte, grade }]);
      expect(s.milkOut).toBe(99);
      interact(s, 'p1');
      expect(wandOf(s).making).toBe('latte');
      expect(wandOf(s).made).toEqual({ milk: grade });
      expect(p1(s).holding).toBeNull();
      expect(p1(s).jug).toBeUndefined();
      expect(s.milkOut).toBe(99 - milk);
    });
  }

  it('fill windows: ±0.08 of the line is right', () => {
    expect(fillGrade(0.6, 0.6)).toBe('right');
    expect(fillGrade(0.52, 0.6)).toBe('right');
    expect(fillGrade(0.68, 0.6)).toBe('right');
    expect(fillGrade(0.5, 0.6)).toBe('under');
    expect(fillGrade(0.7, 0.6)).toBe('over');
  });

  it('left running, the jug stops itself full (over); put the shot down and the jug is gone', () => {
    const s = open();
    atWand(s);
    p1(s).holding = 'espresso';
    interact(s, 'p1');
    tick(s, FILL + 10);
    expect(p1(s).jug).toMatchObject({ fill: 1, done: true });
    expect(logs(s, 'milk.fill')).toEqual([{ by: 'p1', level: 1, line: JUG_LINES.latte, grade: 'over' }]);
    p1(s).holding = null;
    tick(s, 1);
    expect(p1(s).jug).toBeUndefined();
  });

  it('no milk out: no jug (nothing happens)', () => {
    const s = open();
    s.milkOut = 0;
    atWand(s);
    p1(s).holding = 'espresso';
    interact(s, 'p1');
    expect(p1(s).jug).toBeUndefined();
  });
});

describe('FB2 B8: the steam meter', () => {
  it('starts as the shot goes on the wand; a triangle wave 0→1→0 every 1.2 s', () => {
    const s = open();
    fillAndInsert(s, 0.6 * FILL);
    expect(p1(s).steam).toEqual({ startedAt: s.tick, speed: 1, station: wandOf(s).id });
    const period = HANDMADE.steamSeconds * TICK_RATE;
    const at = (k: number) => {
      const t = open();
      fillAndInsert(t, 0.6 * FILL);
      tick(t, k);
      return steamPos(t, p1(t));
    };
    expect(at(0)).toBe(0);
    expect(at(period / 4)).toBeCloseTo(0.5);
    expect(at(period / 2)).toBeCloseTo(1);
    expect(at((3 * period) / 4)).toBeCloseTo(0.5);
    expect(steamPos(s, { ...p1(s), steam: undefined })).toBeNull();
  });

  it('grades: within 0.08 of the middle perfect, within 0.25 ok, else miss', () => {
    expect(steamGrade(0.5)).toBe('perfect');
    expect(steamGrade(0.42)).toBe('perfect');
    expect(steamGrade(0.58)).toBe('perfect');
    expect(steamGrade(0.3)).toBe('ok');
    expect(steamGrade(0.75)).toBe('ok');
    expect(steamGrade(0.2)).toBe('miss');
    expect(steamGrade(0.95)).toBe('miss');
  });

  for (const [k, grade] of [[18, 'perfect'], [10, 'ok'], [1, 'miss']] as const) {
    it(`stopped after ${k} ticks: ${grade}; the drink is made either way`, () => {
      const s = open();
      fillAndInsert(s, 0.6 * FILL);
      tick(s, k);
      interact(s, 'p1');
      expect(p1(s).steam).toBeUndefined();
      expect(logs(s, 'steam.result')).toEqual([{ by: 'p1', grade }]);
      expect(wandOf(s).made).toEqual({ milk: 'right', foam: grade });
      tick(s, 4.5 * TICK_RATE);
      expect(wandOf(s).output).toBe('latte');
      // Taking it carries the marks into the hands.
      interact(s, 'p1');
      expect(p1(s).holding).toBe('latte');
      expect(p1(s).made).toEqual({ milk: 'right', foam: grade });
    });
  }

  it('never stopped: the wand finishes and the milk is scalded (miss)', () => {
    const s = open();
    fillAndInsert(s, 0.6 * FILL);
    tick(s, 4.5 * TICK_RATE);
    expect(wandOf(s).output).toBe('latte');
    expect(p1(s).steam).toBeUndefined();
    expect(logs(s, 'steam.result')).toEqual([{ by: 'p1', grade: 'miss' }]);
    expect(wandOf(s).made).toEqual({ milk: 'right', foam: 'miss' });
  });

  it('a press out of the wand\'s reach does what it always does and leaves the meter running', () => {
    const s = open();
    fillAndInsert(s, 0.6 * FILL);
    p1(s).pos = { x: 6, y: 4 };
    interact(s, 'p1');
    expect(p1(s).steam).toBeDefined();
    expect(logs(s, 'steam.result')).toEqual([]);
  });
});

describe('FB2 B8: stars and tips', () => {
  it('judgeCup: under −1★ ×0.8, perfect +1★ ×1.2, miss −1★ ×0.8, over fine; a wrong or missing syrup ×0.5', () => {
    expect(judgeCup({}, undefined)).toEqual({ stars: 0, tip: 1, syrupMiss: false });
    expect(judgeCup({}, { milk: 'under' })).toEqual({ stars: -1, tip: 0.8, syrupMiss: false });
    expect(judgeCup({}, { milk: 'over' })).toEqual({ stars: 0, tip: 1, syrupMiss: false });
    expect(judgeCup({}, { foam: 'perfect' })).toEqual({ stars: 1, tip: 1.2, syrupMiss: false });
    expect(judgeCup({}, { foam: 'ok' })).toEqual({ stars: 0, tip: 1, syrupMiss: false });
    expect(judgeCup({}, { foam: 'miss' })).toEqual({ stars: -1, tip: 0.8, syrupMiss: false });
    expect(judgeCup({ syrup: 'vanilla' }, { syrup: 'vanilla' })).toEqual({ stars: 0, tip: 1, syrupMiss: false });
    expect(judgeCup({ syrup: 'vanilla' }, { syrup: 'caramel' })).toEqual({ stars: 0, tip: 0.5, syrupMiss: true });
    expect(judgeCup({ syrup: 'vanilla' }, undefined)).toEqual({ stars: 0, tip: 0.5, syrupMiss: true });
    expect(judgeCup({}, { syrup: 'caramel' })).toEqual({ stars: 0, tip: 1, syrupMiss: false });
    const both = judgeCup({}, { milk: 'under', foam: 'miss' });
    expect([both.stars, both.tip]).toEqual([-2, 0.8 * 0.8]);
  });

  /** One latte customer at pickup takes `item`; returns the served event and the day's tips. */
  function serve(item: PassItem, want: Partial<Customer> = {}): { served: SimEvent['data']; tips: number; s: GameState } {
    const s = open();
    // Not rung at the till (no fast-hand-off bonus on top), so the tips compare as plain multiples.
    s.customers = [{ ...pickupCustomer(1, 'latte', want), rungAt: undefined }];
    s.pass = [item];
    stepPickup(s);
    return { served: logs(s, 'served')[0]!, tips: s.today.tips, s };
  }

  it('a perfect foam earns +1★ (a sloppy mark wiped) and ×1.2 tip; a miss −1★ and less', () => {
    const ok = serve(cup({ milk: 'right', foam: 'ok' }));
    const perfect = serve(cup({ milk: 'right', foam: 'perfect' }));
    const miss = serve(cup({ milk: 'right', foam: 'miss' }));
    expect([ok.served.stars, perfect.served.stars, miss.served.stars]).toEqual([3, 3, 2]);
    expect(perfect.tips / ok.tips).toBeCloseTo(1.2, 1);
    expect(miss.tips).toBeLessThan(ok.tips * 0.8);
    expect(serve(cup({ foam: 'perfect' }, 1)).served.stars).toBe(3);
    expect(serve(cup({ milk: 'under' })).served.stars).toBe(2);
  });

  it('syrup: the right one is fine; wrong or missing grumbles (syrup.miss) and halves the tip', () => {
    const right = serve(cup({ syrup: 'vanilla' }), { syrup: 'vanilla' });
    const wrong = serve(cup({ syrup: 'caramel' }), { syrup: 'vanilla' });
    const missing = serve(cup(), { syrup: 'vanilla' });
    expect(logs(right.s, 'syrup.miss')).toEqual([]);
    expect(logs(wrong.s, 'syrup.miss')).toEqual([{ customer: 1 }]);
    expect(logs(missing.s, 'syrup.miss')).toEqual([{ customer: 1 }]);
    expect(wrong.tips / right.tips).toBeCloseTo(0.5, 1);
    expect(missing.tips).toBeCloseTo(wrong.tips, 2);
  });

  it('pickup: a cup goes to the ticket that asked for its syrup first', () => {
    const s = open();
    s.customers = [pickupCustomer(1, 'latte'), pickupCustomer(2, 'latte', { syrup: 'vanilla' })];
    s.pass = [cup({ syrup: 'vanilla' })];
    stepPickup(s);
    expect(logs(s, 'pickup.take')).toEqual([{ drink: 'latte', customer: 2, by: 'p1' }]);
    expect(logs(s, 'syrup.miss')).toEqual([]);
  });

  it('a multi-drink ticket marks the matching item, and pays the hand-made tip with the ticket', () => {
    const s = open();
    const c = pickupCustomer(1, 'latte', { order: 'combo', items: [{ drink: 'latte', done: false, syrup: 'caramel' }, { drink: 'latte', done: false }] });
    s.customers = [c];
    s.pass = [cup({ foam: 'perfect' })];
    stepPickup(s);
    expect(c.items![1]).toMatchObject({ done: true, tipMul: 1.2 });
    expect(c.items![0]!.done).toBe(false);
    s.pass = [cup()];
    stepPickup(s);
    expect(c.items![0]).toMatchObject({ done: true, tipMul: 0.5 });
    expect(logs(s, 'syrup.miss')).toEqual([{ customer: 1 }]);
    expect(logs(s, 'order.done')).toHaveLength(1);
  });
});

describe('FB2 B8: double shots', () => {
  it('a ticket asking for a double: the next pull takes ×1.5 and a second bean; once one is in flight, singles again', () => {
    const s = open();
    s.customers = [pickupCustomer(1, 'latte', { shots: 2 })];
    expect(wantsDouble(s)).toBe(true);
    atMachine(s);
    p1(s).holding = 'grounds';
    interact(s, 'p1');
    const m = machine(s);
    expect(m.making).toBe('espresso');
    expect(m.busyTicksLeft).toBe(Math.round(5 * TICK_RATE * 1.5));
    expect(m.made).toEqual({ shots: 2 });
    expect(s.supplies.beans).toBe(49);
    expect(wantsDouble(s)).toBe(false);
    tick(s, m.busyTicksLeft);
    interact(s, 'p1');
    expect([p1(s).holding, p1(s).made]).toEqual(['espresso', { shots: 2 }]);
    // The double is in hand: the next pull is a single.
    const t = open();
    t.customers = [pickupCustomer(1, 'latte', { shots: 2 })];
    t.pass = [{ item: 'latte', ticksLeft: 1e5, made: { shots: 2 } }];
    atMachine(t);
    p1(t).holding = 'grounds';
    interact(t, 'p1');
    expect([machine(t).busyTicksLeft, machine(t).made, t.supplies.beans]).toEqual([5 * TICK_RATE, undefined, 50]);
  });

  it('no double without a bean to spare; nobody asking, no double', () => {
    const s = open();
    s.customers = [pickupCustomer(1, 'latte', { shots: 2 })];
    s.supplies.beans = 0;
    atMachine(s);
    p1(s).holding = 'grounds';
    interact(s, 'p1');
    expect([machine(s).busyTicksLeft, machine(s).made]).toEqual([5 * TICK_RATE, undefined]);
    const t = open();
    t.customers = [pickupCustomer(1, 'latte')];
    expect(wantsDouble(t)).toBe(false);
  });
});

describe('FB2 B8: the syrup rack', () => {
  it('a fixed spot on the front counter in a shop with a wand; none without one', () => {
    const s = open();
    const rack = s.stations.find((x) => x.id === SYRUP_ID)!;
    expect(rack).toMatchObject({ kind: 'counter', pos: SYRUP_SPOT });
    expect(open('e3', null).stations.some((x) => x.id === SYRUP_ID)).toBe(false);
  });

  it('syrup input at the rack with a latte in hand: one flavour supply, syrup.add, on the cup', () => {
    let s = open();
    atRack(s);
    p1(s).holding = 'latte';
    s = step(s, [{ kind: 'syrup', playerId: 'p1', flavour: 'vanilla' }]);
    expect(p1(s).made).toEqual({ syrup: 'vanilla' });
    expect(s.supplies.flavour).toBe(49);
    expect(logs(s, 'syrup.add')).toEqual([{ by: 'p1', flavour: 'vanilla' }]);
    // One syrup per cup.
    s = step(s, [{ kind: 'syrup', playerId: 'p1', flavour: 'caramel' }]);
    expect(p1(s).made).toEqual({ syrup: 'vanilla' });
    expect(s.supplies.flavour).toBe(49);
  });

  it('refused away from the rack, with empty hands, with no flavour left, or at night', () => {
    const tries: [string, (s: GameState) => void][] = [
      ['away', (s) => { p1(s).pos = { x: 6, y: 4 }; }],
      ['empty', (s) => { p1(s).holding = null; }],
      ['no stock', (s) => { s.supplies.flavour = 0; }],
      ['night', (s) => { s.phase = 'night'; }],
    ];
    for (const [why, setup] of tries) {
      let s = open();
      atRack(s);
      p1(s).holding = 'latte';
      setup(s);
      const flavour = s.supplies.flavour;
      s = step(s, [{ kind: 'syrup', playerId: 'p1', flavour: 'caramel' }]);
      expect(p1(s).made?.syrup, why).toBeUndefined();
      expect(s.supplies.flavour, why).toBe(flavour);
    }
  });

  it('E at the rack with a cup does nothing (it is not the pickup counter)', () => {
    const s = open();
    atRack(s);
    p1(s).holding = 'latte';
    interact(s, 'p1');
    expect([p1(s).holding, s.pass.length]).toEqual(['latte', 0]);
  });

  it('validateInput: flavour must be vanilla or caramel', () => {
    expect(validateInput({ kind: 'syrup', playerId: 'p1', flavour: 'vanilla' })).toEqual({ kind: 'syrup', playerId: 'p1', flavour: 'vanilla' });
    expect(validateInput({ kind: 'syrup', playerId: 'p1', flavour: 'hazelnut' } as never)).toBeNull();
    expect(validateInput({ kind: 'syrup', playerId: 'p1' } as never)).toBeNull();
  });
});

describe('FB2 B8: tickets ask for doubles and syrups', () => {
  it('about 30% of latte/cappuccino asks are doubles, about 25% of lattes a syrup (vanilla or caramel); others never', () => {
    const s = open();
    const n = 4000;
    let doubles = 0;
    let syrups = 0;
    const flavours = new Set<string>();
    for (let i = 0; i < n; i++) {
      const c = pickupCustomer(i, 'latte');
      addCustomerAsks(s, c);
      if (c.shots === 2) doubles++;
      if (c.syrup) {
        syrups++;
        flavours.add(c.syrup);
      }
      const e = pickupCustomer(i, 'espresso');
      addCustomerAsks(s, e);
      expect([e.shots, e.syrup]).toEqual([undefined, undefined]);
      const k = pickupCustomer(i, 'cappuccino');
      addCustomerAsks(s, k);
      expect(k.syrup).toBeUndefined();
    }
    expect(doubles / n).toBeGreaterThan(0.27);
    expect(doubles / n).toBeLessThan(0.33);
    expect(syrups / n).toBeGreaterThan(0.22);
    expect(syrups / n).toBeLessThan(0.28);
    expect([...flavours].sort()).toEqual(['caramel', 'vanilla']);
  });

  it('no flavour in stock, no syrup asks; ticket items get their own asks', () => {
    const s = open();
    s.supplies.flavour = 0;
    for (let i = 0; i < 200; i++) {
      const c = pickupCustomer(i, 'latte');
      addCustomerAsks(s, c);
      expect(c.syrup).toBeUndefined();
    }
    s.supplies.flavour = 5;
    const items = Array.from({ length: 200 }, () => ({ drink: 'latte' as DrinkId, done: false }));
    const t = pickupCustomer(1, 'latte', { items });
    addCustomerAsks(s, t);
    expect(items.some((x) => (x as { syrup?: string }).syrup)).toBe(true);
    expect(t.syrup).toBeUndefined();
  });
});

describe('FB2 B8: the recipe on the held cup', () => {
  it('steps for the ticket the cup is heading to, done or still to do', () => {
    const s = open();
    s.customers = [pickupCustomer(1, 'latte', { shots: 2, syrup: 'caramel' })];
    const p = p1(s);
    expect(heldRecipe(s, p)).toBeNull();
    p.holding = 'espresso';
    p.made = { shots: 2 };
    expect(heldRecipe(s, p)).toEqual({
      drink: 'latte',
      shots: 2,
      syrup: 'caramel',
      steps: [
        { step: 'double', done: true },
        { step: 'caramel', done: false },
        { step: 'milk', done: false },
        { step: 'steam', done: false },
      ],
    });
    p.holding = 'latte';
    p.made = { shots: 2, syrup: 'caramel', milk: 'right', foam: 'ok' };
    expect(heldRecipe(s, p)!.steps.every((x) => x.done)).toBe(true);
    s.customers = [pickupCustomer(2, 'cappuccino')];
    s.unlocked = [...(s.unlocked ?? BASE_DRINKS), 'cappuccino'];
    p.made = undefined;
    expect(heldRecipe(s, p)).toEqual({
      drink: 'cappuccino',
      shots: 1,
      steps: [
        { step: 'shot', done: true },
        { step: 'milk', done: true },
        { step: 'steam', done: true },
        { step: 'foam', done: false },
      ],
    });
    p.holding = 'coldBrew';
    expect(heldRecipe(s, p)).toBeNull();
  });
});

describe('FB2 B8: bots', () => {
  /** A Gear café with a grinder, E3 + a plain steamer (a wand), a tap and a bin; one stand-in bot, no walk-ins. */
  function shop(): GameState {
    const slots: SlotContent[] = ['grinder', 'espresso', 'steamer', 'coldBrewTap', 'trash', null];
    let s = createRun({ seed: 2, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 600 }, gear: true });
    s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
    s.slots = [...slots];
    s.slotGear = ['g2', 'e3', null, 'c2', 'b0', null];
    s.stations = stationsFromSlots(undefined, s.slots, s.slotGear);
    s.unlocked = [...BASE_DRINKS];
    for (const d of s.unlocked) s.menu[d] = true;
    for (const k of Object.keys(s.supplies) as SupplyId[]) s.supplies[k] = 20;
    addStandIns(s, 1);
    s = startDay(s);
    s.eventSchedule = [];
    s.condiments = { servings: 0 };
    s.milkOut = 10;
    s.players[0]!.pos = { x: 10, y: 5 };
    return s;
  }

  it('a bot makes a double vanilla latte: no meters, ok foam, the right syrup, a double pull', () => {
    let s = shop();
    s.customers = [pickupCustomer(1, 'latte', { shots: 2, syrup: 'vanilla' })];
    const seen = new Map<number, SimEvent>();
    let double = false;
    for (let i = 0; i < 90 * 60 && s.today.served < 1; i++) {
      s = step(s, []);
      for (const e of s.log) seen.set(e.seq, e);
      if (s.stations.some((x) => x.kind === 'espresso' && x.made?.shots === 2)) double = true;
      for (const p of s.players) if (p.bot) expect([p.jug, p.steam]).toEqual([undefined, undefined]);
    }
    const events = [...seen.values()];
    expect(s.today.served).toBe(1);
    expect(double).toBe(true);
    expect(events.filter((e) => e.kind === 'syrup.add').map((e) => e.data)).toEqual([{ by: 'sim-1', flavour: 'vanilla' }]);
    expect(events.some((e) => e.kind === 'syrup.miss')).toBe(false);
    expect(events.some((e) => e.kind === 'milk.fill' || e.kind === 'steam.result')).toBe(false);
    expect(events.find((e) => e.kind === 'served')!.data.stars).toBe(3);
  });
});

describe('FB2 B8: determinism and milk', () => {
  /** Through `step`: shot in hand at the wand, presses at fixed ticks. */
  function play(): GameState {
    let s = open();
    atWand(s);
    p1(s).holding = 'espresso';
    const press = { kind: 'move' as const, playerId: 'p1', x: 0, y: 0, interact: true };
    const plan = new Map([[0, press], [70, press], [71, press], [88, press]]);
    for (let i = 0; i < 400; i++) s = step(s, plan.has(i) ? [plan.get(i)!] : []);
    return s;
  }

  it('the same presses give the same results', () => {
    const a = play();
    const b = play();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.players[0]!.made ?? wandOf(a).made).toBeDefined();
  });

  it('one latte, one milk: the jug draws from milkOut once (no double count)', () => {
    const s = play();
    expect(s.milkOut).toBe(98);
    expect(wandOf(s).output === 'latte' || p1(s).holding === 'latte').toBe(true);
  });
});
