import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../../data/economy';
import { LAYOUT } from '../../data/layout';
import { createRun, startDay } from '../run';
import { nearestStation } from '../movement';
import { step } from '../step';
import type { GameState, Personality, Player, Vec2 } from '../types';
import { chainFor, dropPlan, reactionDelay, think, uncoveredOrder } from './brain';
import { findPath, floorDropNode, isWalkable, targetNodes } from './path';
import { addStandIns, botSpeed, makeBotState } from './roster';
import { floorFields } from '../tiles';
import { stationsFromSlots, type SlotContent } from '../slots';
import { tierOf } from '../growth';
import { spillTiles } from '../floor';

/** One human p1 who never moves, `bots` bot baristas, no arrivals, and a long day. */
function cafe(bots: number): GameState {
  const s = createRun({ seed: 2, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots, dayLengthSec: 600 } });
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  return startDay(s);
}

function runUntil(state: GameState, done: (s: GameState) => boolean, maxTicks: number): GameState {
  let s = state;
  for (let i = 0; i < maxTicks; i++) {
    if (done(s)) return s;
    s = step(s, []);
  }
  if (done(s)) return s;
  throw new Error(`condition not met within ${maxTicks} ticks`);
}

const bot = (s: GameState, id = 'bot-1'): Player => s.players.find((p) => p.id === id)!;
const huge = { patienceLeft: 10_000, patienceMax: 10_000 };

describe('bot brain', () => {
  it('chains each drink through its stations, finishing at the counter', () => {
    const st = cafe(1);
    const ids = (d: Parameters<typeof chainFor>[2], f: 'serve' | 'put') =>
      chainFor(st, bot(st), d, f).map((x) => (x.kind === 'use' ? `${x.station}:${x.action}` : 'idle'));
    expect(ids('espresso', 'serve')).toEqual(['grinder:insert', 'grinder:take', 'espresso:insert', 'espresso:take', 'counter:serve']);
    expect(ids('latte', 'serve')).toEqual([
      'grinder:insert', 'grinder:take', 'espresso:insert', 'espresso:take', 'steamer:insert', 'steamer:take', 'counter:serve',
    ]);
    expect(ids('coldBrew', 'put')).toEqual(['coldBrewTap:insert', 'coldBrewTap:take', 'counter:put']);
  });

  it('a bot makes and serves an espresso on its own', () => {
    let s = cafe(1);
    s.customers = [{ id: 900, drink: 'espresso', ...huge }];
    const served = s.today.served;
    s = runUntil(s, (x) => !x.customers.some((c) => c.id === 900), 60 * 30);
    expect(s.today.served).toBe(served + 1);
    expect(s.today.drinks!.espresso).toBeGreaterThan(0);
  });

  it('an occupied station does not cover an order', () => {
    const s = cafe(1);
    s.customers = [{ id: 900, drink: 'espresso', ...huge }];
    const esp = s.stations.find((st) => st.id === 'espresso')!;
    esp.busyTicksLeft = 600;
    esp.occupiedBy = 99;
    expect(uncoveredOrder(s, bot(s))?.drink).toBe('espresso');
  });

  it('a latte goes through the steamer; a cold brew through the tap', () => {
    let s = cafe(1);
    s.customers = [{ id: 901, drink: 'latte', ...huge }, { id: 902, drink: 'coldBrew', ...huge }];
    const served = s.today.served;
    const milk = s.supplies.milk;
    s = runUntil(s, (x) => x.customers.length === 0, 60 * 60);
    expect(s.today.served).toBe(served + 2);
    expect(s.today.drinks!.latte).toBe(1);
    expect(s.today.drinks!.coldBrew).toBe(1);
    expect(s.supplies.milk).toBe(milk - 1);
  });

  it('two bots claim different customers', () => {
    let s = cafe(2);
    s.customers = [{ id: 910, drink: 'latte', ...huge }, { id: 911, drink: 'latte', ...huge }];
    for (let i = 0; i < 12; i++) s = step(s, []);
    const claims = [bot(s, 'bot-1').bot!.claim, bot(s, 'bot-2').bot!.claim];
    expect([...claims].sort()).toEqual([910, 911]);
    expect(claims[0]).not.toBe(claims[1]);
  });

  it("a claiming bot's drink still in a machine does not hide the next customer who ordered it", () => {
    let s = cafe(2);
    s.customers = [{ id: 920, drink: 'latte', ...huge }, { id: 921, drink: 'latte', ...huge }];
    const steamer = (x: GameState) => x.stations.find((st) => st.id === 'steamer')!;
    s = runUntil(s, (x) => {
      const first = bot(x, 'bot-1').bot!.plan[0];
      return steamer(x).busyTicksLeft > 0 && first?.kind === 'use' && first.station === 'steamer' && first.action === 'take';
    }, 60 * 30);
    const bot1 = bot(s, 'bot-1').bot!.claim;
    const other = bot1 === 920 ? 921 : 920;
    expect(uncoveredOrder(s, bot(s, 'bot-2'))?.id).toBe(other);
    const served = s.today.served;
    s = runUntil(s, (x) => x.customers.length === 0, 60 * 60);
    expect(s.today.served).toBe(served + 2);
  });

  it('Review Focus 1: when the claimed customer is served by someone else the bot puts its drink on the pass', () => {
    let s = cafe(1);
    s.customers = [{ id: 900, drink: 'espresso', ...huge }];
    s = runUntil(s, (x) => bot(x).holding === 'espresso', 60 * 30);
    expect(bot(s).bot!.claim).toBe(900);
    s.customers = [];
    const wasted = s.today.wasted ?? 0;
    s = runUntil(
      s,
      (x) => bot(x).holding === null && bot(x).bot!.claim === null && (x.pass.some((i) => i.item === 'espresso') || (x.today.wasted ?? 0) > wasted),
      600,
    );
    expect(s.pass.some((i) => i.item === 'espresso')).toBe(true);
  });

  it('a drink orphaned in a machine by a departed customer is collected, not left blocking it', () => {
    let s = cafe(1);
    s.menu.coldBrew = false; // no pass prep, so the bot's next think goes straight to the orphaned drink
    s.customers = [{ id: 900, drink: 'espresso', ...huge }];
    const machine = (x: GameState) => x.stations.find((st) => st.id === 'espresso')!;
    s = runUntil(s, (x) => machine(x).busyTicksLeft > 0 || machine(x).output === 'espresso', 60 * 30);
    expect(bot(s).bot!.claim).toBe(900);
    s.customers = [];
    s = runUntil(s, (x) => machine(x).output === null && machine(x).busyTicksLeft === 0 && bot(x).holding === null && x.pass.some((i) => i.item === 'espresso'), 60 * 15); // brew, plus a reaction delay per adopted job
    expect(bot(s).bot!.claim).toBeNull();
  });

  it('grounds parked on the espresso machine do not cover an order and get cleared', () => {
    let s = cafe(1);
    s.players.find((p) => p.id === 'p1')!.pos = { x: 11, y: 5 }; // out of the way
    const machine = (x: GameState) => x.stations.find((st) => st.id === 'espresso')!;
    machine(s).output = 'grounds'; // e.g. dropped there with R
    s.customers = [{ id: 900, drink: 'espresso', ...huge }];
    expect(uncoveredOrder(s, bot(s))?.id).toBe(900);
    const wasted = s.today.wasted ?? 0;
    const served = s.today.served;
    s = runUntil(s, (x) => machine(x).output === null, 1200);
    expect(s.today.wasted ?? 0).toBe(wasted); // grounds are not waste
    s = runUntil(s, (x) => x.today.served === served + 1, 1200);
    expect(s.customers.some((c) => c.id === 900)).toBe(false);
  });

  it('grounds parked on the steamer do not stall a latte', () => {
    let s = cafe(1);
    s.players.find((p) => p.id === 'p1')!.pos = { x: 11, y: 5 };
    const steamer = (x: GameState) => x.stations.find((st) => st.id === 'steamer')!;
    steamer(s).output = 'grounds';
    s.customers = [{ id: 900, drink: 'latte', ...huge }];
    const served = s.today.served;
    s = runUntil(s, (x) => x.today.served === served + 1, 2400);
    expect(steamer(s).output).toBeNull();
  });

  it('Review Focus 2: a bot does not wait forever at a blocked machine', () => {
    let s = cafe(1);
    s.customers = [{ id: 900, drink: 'espresso', ...huge }];
    s = runUntil(s, (x) => bot(x).holding === 'grounds', 60 * 30);
    // A leftover the bot cannot use while holding grounds; placed now, mid-chain, so the orphan rule does not collect it first.
    s.stations.find((x) => x.id === 'espresso')!.output = 'latte';
    s = runUntil(s, (x) => bot(x).bot!.waitTicks > 0, 60 * 5); // stuck at the machine with grounds in hand
    s = runUntil(
      s,
      (x) => {
        const b = bot(x);
        const first = b.bot!.plan[0];
        const atEspresso = first?.kind === 'use' && first.station === 'espresso' && first.action === 'insert';
        return b.holding === null && b.bot!.plan.length > 0 && !atEspresso && b.bot!.waitTicks === 0;
      },
      ECONOMY.bots.maxWaitTicks + 60 * 5, // the wait cap, then the walk to the trash
    );
    expect(bot(s).holding).toBeNull();
    expect(bot(s).bot!.plan[0]).toEqual({ kind: 'use', station: 'espresso', action: 'take' }); // now collects the leftover
  });

  it('bots prep cold brew for the pass when nothing is waiting, up to two', () => {
    let s = cafe(1);
    expect(bot(s).bot!.personality).toBe('steady');
    expect(ECONOMY.bots.personalities.steady.preps).toBe(true);
    const coldOnPass = (x: GameState) => x.pass.filter((i) => i.item === 'coldBrew').length;
    let reached = false;
    for (let i = 0; i < 60 * 30; i++) {
      s = step(s, []);
      expect(coldOnPass(s)).toBeLessThanOrEqual(2);
      if (coldOnPass(s) === 2) reached = true;
    }
    expect(reached).toBe(true);
    expect(coldOnPass(s)).toBe(2);
    expect(s.pass.length).toBe(2);
  });

  it('bots never make a drink that is off the menu', () => {
    let s = cafe(1);
    s.menu.espresso = false;
    s.customers = [{ id: 900, drink: 'espresso', ...huge }];
    const beans = s.supplies.beans;
    for (let i = 0; i < 600; i++) {
      s = step(s, []);
      expect(s.supplies.beans).toBe(beans);
    }
    expect(s.stations.find((x) => x.id === 'grinder')!.busyTicksLeft).toBe(0);
  });

  it('a day with bots is deterministic and JSON-safe', () => {
    const script = () => {
      let s = startDay(createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 2 } }));
      for (let i = 0; i < 1200; i++) s = step(s, []);
      return s;
    };
    const a = script();
    expect(a.today.served + a.customers.length).toBeGreaterThan(0);
    expect(script()).toEqual(a);
    const round = JSON.parse(JSON.stringify(a)) as GameState;
    let x = a;
    let y = round;
    for (let i = 0; i < 300; i++) {
      x = step(x, []);
      y = step(y, []);
    }
    expect(y).toEqual(x);
  });
});

describe('bot feel: reaction delay, personalities, pressure and the skill dial', () => {
  /** 200 adoptions' worth of delays for a personality at a skill level, drawn from the seeded rng. */
  function delays(personality: Personality, skill: GameState['settings']['botSkill'], queued: number): number[] {
    const s = cafe(0);
    s.settings.botSkill = skill;
    s.customers = Array.from({ length: queued }, (_, i) => ({ id: 800 + i, drink: 'espresso' as const, ...huge }));
    const b = makeBotState(personality);
    return Array.from({ length: 200 }, () => reactionDelay(s, b));
  }
  const range = (xs: number[]) => [Math.min(...xs), Math.max(...xs)];
  const [lo, hi] = ECONOMY.bots.reactionTicks;

  it('waits 0.5–2 s scaled by personality, skill and pressure before acting', () => {
    const steady = delays('steady', 3, 0);
    expect(steady.every((d) => Number.isInteger(d) && d >= lo && d <= hi)).toBe(true);
    expect(range(steady)[0]).toBeLessThan(lo + 10);
    expect(range(steady)[1]).toBeGreaterThan(hi - 10);

    const veteran = delays('veteran', 1, 0);
    expect(veteran.every((d) => d >= Math.round(lo * 1.3 * 1.6) && d <= Math.round(hi * 1.3 * 1.6))).toBe(true);
    expect(range(veteran)[1]).toBeGreaterThan(Math.round(hi * 1.3 * 1.6) - 25);

    const rookie = delays('rookie', 5, ECONOMY.bots.pressureQueue);
    expect(rookie.every((d) => d >= Math.round(lo * 0.8 * 0.6 * 0.8) && d <= Math.round(hi * 0.8 * 0.6 * 0.8))).toBe(true);
    expect(range(rookie)[1]).toBeGreaterThan(Math.round(hi * 0.8 * 0.6 * 0.8) - 6);
  });

  it('a bot stands still while it reacts to a new job, then gets going', () => {
    let s = cafe(1);
    s.customers = [{ id: 900, drink: 'espresso', ...huge }];
    s = runUntil(s, (x) => bot(x).bot!.claim === 900, 60);
    const waiting = bot(s).bot!.reactionTicksLeft;
    expect(waiting).toBeGreaterThanOrEqual(lo);
    const pos = { ...bot(s).pos };
    for (let i = 0; i < waiting; i++) {
      s = step(s, []);
      expect(bot(s).pos).toEqual(pos);
      expect(bot(s).moveDir).toEqual({ x: 0, y: 0 });
    }
    expect(bot(s).bot!.reactionTicksLeft).toBe(0);
    s = step(s, []);
    expect(bot(s).pos).not.toEqual(pos);
  });

  it('stand-ins react instantly and move at speed 1 whatever the skill', () => {
    const s = addStandIns(cafe(0), 1);
    s.settings.botSkill = 1;
    const standIn = s.players.find((p) => p.id === 'sim-1')!.bot!;
    const rng = s.rng;
    expect(reactionDelay(s, standIn)).toBe(0);
    expect(s.rng).not.toBe(rng); // the draw still happens, so the stream does not depend on the crew
    expect(botSpeed(s, standIn)).toBe(1);
  });

  it('the skill dial scales speed', () => {
    const s = cafe(0);
    s.settings.botSkill = 1;
    expect(botSpeed(s, makeBotState('steady'))).toBeCloseTo(0.85);
    s.settings.botSkill = 5;
    expect(botSpeed(s, makeBotState('rookie'))).toBeCloseTo(1.1 * 1.1);
  });
});

describe('bot feel: mistakes, noticing and remaking', () => {
  /** Run `ticks` ticks with a queue long enough to put the crew under pressure; collect every 'bot.mistake' log entry. */
  function busyEspressoDay(s: GameState, ticks: number): { s: GameState; mistakeLogs: number } {
    let nextId = 1000;
    const seen = new Set<number>();
    for (let i = 0; i < ticks; i++) {
      while (s.customers.length < ECONOMY.bots.pressureQueue) s.customers.push({ id: nextId++, drink: 'espresso', ...huge });
      s = step(s, []);
      for (const e of s.log) if (e.kind === 'bot.mistake') seen.add(e.seq);
    }
    return { s, mistakeLogs: seen.size };
  }

  it('a botched drink is noticed, binned, counted and remade', () => {
    let s = cafe(1);
    bot(s).bot!.personality = 'rookie';
    s.settings.botSkill = 1;
    const served = s.today.served;
    const run = busyEspressoDay(s, 60 * 120);
    // let any botch still in hand be noticed and binned (a spilled botch leaves no trash step)
    s = runUntil(run.s, (x) => {
      const b = bot(x).bot!;
      const first = b.plan[0];
      return b.noticeTicksLeft === 0 && !(first?.kind === 'use' && first.action === 'trash');
    }, 60 * 5);
    const mistakes = s.today.botMistakes ?? 0;
    expect(mistakes).toBeGreaterThan(0);
    expect(bot(s).bot!.mistakes).toBe(mistakes);
    expect(s.today.wasted ?? 0).toBeGreaterThanOrEqual(mistakes);
    expect(run.mistakeLogs).toBeGreaterThan(0);
    expect(s.today.served).toBeGreaterThan(served);
  });

  it('a botched drink is never handed over before it is noticed', () => {
    let s = cafe(1);
    s.customers = [{ id: 900, drink: 'espresso', ...huge }];
    s = runUntil(s, (x) => bot(x).holding === 'espresso', 60 * 30);
    bot(s).bot!.noticeTicksLeft = 10_000; // hold the drink unchecked until the bot is waiting at the counter
    s = runUntil(s, (x) => bot(x).bot!.waitTicks > 0, 60 * 30);
    bot(s).bot!.noticeTicksLeft = 100;
    const served = s.today.served;
    const wasted = s.today.wasted ?? 0;
    for (let i = 0; i < 99; i++) s = step(s, []);
    expect(s.today.served).toBe(served);
    expect(bot(s).holding).toBe('espresso');
    expect(nearestStation(s, bot(s).pos)?.kind).toBe('counter'); // waiting at the counter, drink in hand
    s = runUntil(s, (x) => bot(x).bot!.noticeTicksLeft === 0, 60 * 10); // noticed
    // Binned (a trash step first) or spilled where it stands (a drop log on the bot's tile); the remake follows either way.
    const first = bot(s).bot!.plan[0];
    const tile = bot(s).tile;
    const spilled = s.log.some((e) => e.kind === 'drop' && e.data.item === 'espresso' && e.data.x === tile.x && e.data.y === tile.y);
    expect(spilled || (first?.kind === 'use' && first.action === 'trash')).toBe(true);
    s = runUntil(s, (x) => (x.today.wasted ?? 0) > wasted, 60 * 10); // binned or spilled: wasted either way
    expect(s.today.served).toBe(served);
    expect(bot(s).bot!.claim).toBe(900); // still on the order
    s = runUntil(s, (x) => x.today.served > served, 60 * 60); // and remade
    expect(s.customers).toEqual([]);
  });

  it('a drink not yet checked is not carried on into the next machine', () => {
    let s = cafe(1);
    s.customers = [{ id: 900, drink: 'latte', ...huge }];
    s = runUntil(s, (x) => bot(x).holding === 'espresso', 60 * 30);
    bot(s).bot!.noticeTicksLeft = 100;
    const steamer = (x: GameState) => x.stations.find((st) => st.id === 'steamer')!;
    for (let i = 0; i < 99; i++) {
      s = step(s, []);
      expect(steamer(s).busyTicksLeft).toBe(0);
    }
    expect(bot(s).holding).toBe('espresso');
    const served = s.today.served;
    s = runUntil(s, (x) => x.today.served > served, 60 * 60); // binned, remade from scratch, served
    expect(s.today.drinks!.latte).toBe(1);
  });

  it('stand-ins never botch', () => {
    let s = addStandIns(cafe(0), 1);
    s.settings.botSkill = 1;
    s = busyEspressoDay(s, 60 * 120).s;
    expect(s.today.served).toBeGreaterThan(0);
    expect(s.today.botMistakes ?? 0).toBe(0);
  });
});

describe('bot feel: yielding', () => {
  /** bot-1 standing exactly on (6,4) with a fresh plan to grind, p1 parked out of the way. */
  function headingToGrinder(): GameState {
    const s = cafe(1);
    s.menu.coldBrew = false;
    s.players.find((p) => p.id === 'p1')!.pos = { x: 11, y: 5 };
    const b = bot(s);
    b.pos = { x: 6, y: 4 };
    b.bot!.plan = [{ kind: 'use', station: 'grinder', action: 'insert' }];
    b.bot!.path = [];
    return s;
  }
  /** Where the bot will step next on its way to the grinder node of its current rank. */
  function nextWaypoint(s: GameState): { x: number; y: number } {
    const b = bot(s);
    const grinder = s.stations.find((st) => st.id === 'grinder')!;
    const nodes = targetNodes(s, grinder, b.pos);
    return findPath(s, b.pos, nodes[Math.min(b.bot!.nodeRank, nodes.length - 1)])![0];
  }
  const [lo, hi] = ECONOMY.bots.yieldTicks;

  it('yields 0.3–1 s to a player on its next waypoint, then re-plans', () => {
    let s = headingToGrinder();
    s.players.find((p) => p.id === 'p1')!.pos = nextWaypoint(s);
    const pos = { ...bot(s).pos };
    s = step(s, []);
    const b = bot(s);
    expect(b.bot!.yieldTicksLeft).toBeGreaterThanOrEqual(lo);
    expect(b.bot!.yieldTicksLeft).toBeLessThanOrEqual(hi);
    expect(b.bot!.yields).toBe(1);
    expect(b.bot!.path).toEqual([]);
    expect(b.moveDir).toEqual({ x: 0, y: 0 });
    expect(b.pos).toEqual(pos);
    const waiting = b.bot!.yieldTicksLeft;
    s.players.find((p) => p.id === 'p1')!.pos = { x: 11, y: 5 }; // p1 steps aside
    for (let i = 0; i < waiting; i++) s = step(s, []);
    expect(bot(s).pos).toEqual(pos);
    expect(bot(s).bot!.yieldTicksLeft).toBe(0);
    s = step(s, []);
    expect(bot(s).pos).not.toEqual(pos); // on its way again
  });

  /** People standing still on all four neighbours of the bot at (6,4): there is no way around them. */
  function boxedIn(): GameState {
    const s = headingToGrinder();
    const spots = [{ x: 5, y: 4 }, { x: 7, y: 4 }, { x: 6, y: 3 }, { x: 6, y: 5 }];
    s.players.find((p) => p.id === 'p1')!.pos = spots[0];
    for (let i = 1; i < spots.length; i++) {
      s.players.unshift({ id: `p${i + 1}`, name: `P${i + 1}`, pos: spots[i], moveDir: { x: 0, y: 0 }, interactQueued: false, holding: null, connected: true, idleTicks: 0, ...floorFields(spots[i]) });
    }
    return s;
  }
  const grinderNodes = (s: GameState) => targetNodes(s, s.stations.find((st) => st.id === 'grinder')!, bot(s).pos).length;
  const grinding = (x: GameState) => x.stations.find((st) => st.id === 'grinder')!.busyTicksLeft > 0;

  it('after three yields it picks the next-nearest target node', () => {
    let s = boxedIn();
    let yields = 0;
    for (let i = 0; i < 4 * hi && bot(s).bot!.nodeRank === 0; i++) {
      const before = bot(s).bot!.yieldTicksLeft;
      s = step(s, []);
      if (bot(s).bot!.yieldTicksLeft > before) yields += 1;
      expect(bot(s).pos).toEqual({ x: 6, y: 4 });
    }
    expect(yields).toBe(ECONOMY.bots.yieldsBeforeRerank);
    expect(bot(s).bot!.nodeRank).toBe(1);
    expect(bot(s).bot!.yields).toBe(0);
    s.players = s.players.filter((p) => p.bot || p.id === 'p1');
    s.players.find((p) => p.id === 'p1')!.pos = { x: 11, y: 5 };
    s = runUntil(s, grinding, 60 * 10);
    expect(bot(s).bot!.nodeRank).toBe(0); // the step popped
  });

  it('never ranks past the last target node, and in the end walks through', () => {
    let s = boxedIn();
    const max = grinderNodes(s) - 1;
    for (let i = 0; i < 60 * 60 && !grinding(s); i++) {
      s = step(s, []);
      expect(bot(s).bot!.nodeRank).toBeLessThanOrEqual(max);
    }
    expect(grinding(s)).toBe(true);
  });

  it('gets round a person parked on its first waypoint', () => {
    let s = headingToGrinder();
    s.players.find((p) => p.id === 'p1')!.pos = nextWaypoint(s);
    s = runUntil(s, grinding, 900);
    expect(s.players.find((p) => p.id === 'p1')!.pos).toEqual(nextWaypoint(headingToGrinder()));
  });

  it('humans never collide with bots', () => {
    const walk = (withBot: boolean) => {
      let s = cafe(1);
      const p1 = s.players.find((p) => p.id === 'p1')!;
      p1.pos = { x: 4, y: 4 };
      if (withBot) {
        bot(s).pos = { x: 6, y: 4 };
        bot(s).bot!.reactionTicksLeft = 10_000; // stands still
      } else s.players = s.players.filter((p) => !p.bot);
      const trail: { x: number; y: number }[] = [];
      for (let i = 0; i < 60; i++) {
        s = step(s, [{ kind: 'move', playerId: 'p1', x: 1, y: 0, interact: false }]);
        trail.push({ ...s.players.find((p) => p.id === 'p1')!.pos });
      }
      return trail;
    };
    const trail = walk(true);
    expect(trail.some((q) => Math.abs(q.x - 6) < 0.1)).toBe(true); // passed through the bot's tile
    expect(trail).toEqual(walk(false));
  });

  it('a bot leaves a finished drink alone while a person is working that machine', () => {
    const s = cafe(1);
    s.menu.coldBrew = false;
    s.stations.find((st) => st.id === 'espresso')!.output = 'espresso';
    const p1 = s.players.find((p) => p.id === 'p1')!;
    p1.pos = { x: 3, y: 2 };
    expect(think(s, bot(s))[0].kind).toBe('idle');
    p1.pos = { x: 11, y: 5 };
    expect(think(s, bot(s))).toEqual([{ kind: 'use', station: 'espresso', action: 'take' }]);
  });
});

describe("coverage counts a person's chain in progress", () => {
  const human = (s: GameState): Player => s.players.find((p) => p.id === 'p1')!;
  const station = (s: GameState, id: string) => s.stations.find((st) => st.id === id)!;

  it('one latte customer and a person holding grounds: nothing is uncovered', () => {
    const s = cafe(1);
    s.customers = [{ id: 950, drink: 'latte', ...huge }];
    human(s).holding = 'grounds';
    expect(uncoveredOrder(s, bot(s))).toBeNull();
  });

  it("one latte customer and the person's shot brewing in the espresso machine: nothing is uncovered", () => {
    const s = cafe(1);
    s.customers = [{ id: 951, drink: 'latte', ...huge }];
    station(s, 'espresso').busyTicksLeft = 100;
    expect(uncoveredOrder(s, bot(s))).toBeNull();
  });

  it('two latte customers and a person holding grounds: the bot gets the second', () => {
    const s = cafe(1);
    s.customers = [{ id: 952, drink: 'latte', ...huge }, { id: 953, drink: 'latte', ...huge }];
    human(s).holding = 'grounds';
    expect(uncoveredOrder(s, bot(s))?.id).toBe(953);
  });

  it('a cold brew customer is not covered by grounds in hand', () => {
    const s = cafe(1);
    s.customers = [{ id: 954, drink: 'coldBrew', ...huge }];
    human(s).holding = 'grounds';
    expect(uncoveredOrder(s, bot(s))?.id).toBe(954);
  });

  it('a person carrying a shot by the counter for the one latte: the bot does not start a latte', () => {
    let s = cafe(1);
    s.customers = [{ id: 955, drink: 'latte', ...huge }];
    human(s).holding = 'espresso';
    human(s).pos = { x: 4.5, y: 5 };
    const beans = s.supplies.beans;
    for (let i = 0; i < 600; i++) {
      s = step(s, []);
      expect(bot(s).bot!.claim).not.toBe(955);
    }
    expect(s.supplies.beans).toBe(beans);
    expect(station(s, 'grinder').busyTicksLeft).toBe(0);
  });
});

describe('bots on a messy floor', () => {
  const spill = (s: GameState, x: number, y: number) => s.messes.push({ id: s.nextMessId++, kind: 'spill', x, y, amount: 1 });
  const parkHuman = (s: GameState) => {
    s.players.find((p) => p.id === 'p1')!.pos = { x: 11, y: 5 };
  };
  const NEIGHBOURS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

  it('a bot avoids a spill when a dry route exists', () => {
    let s = cafe(1);
    parkHuman(s);
    bot(s).pos = { x: 8, y: 4 };
    spill(s, 7, 4);
    s.customers = [{ id: 900, drink: 'espresso', ...huge }];
    // The plain route west to the grinder runs straight through the spill.
    const grinder = s.stations.find((st) => st.id === 'grinder')!;
    const plain = findPath(s, bot(s).pos, targetNodes(s, grinder, bot(s).pos)[0])!;
    expect(plain).toContainEqual({ x: 7, y: 4 });
    const tiles: { x: number; y: number }[] = [];
    s = runUntil(s, (x) => {
      tiles.push({ ...bot(x).tile });
      return x.today.served === 1;
    }, 3000);
    expect(tiles).not.toContainEqual({ x: 7, y: 4 });
  });

  // Review Focus 5
  it('spills on every approach to the counter: the bot walks through and still serves', () => {
    let s = cafe(1);
    parkHuman(s);
    const counter = s.stations.find((st) => st.id === 'counter')!;
    const node = targetNodes(s, counter, bot(s).pos)[0];
    for (const d of NEIGHBOURS) {
      const t = { x: node.x + d.x, y: node.y + d.y };
      if (isWalkable(s, t)) spill(s, t.x, t.y);
    }
    expect(s.messes.length).toBeGreaterThan(0);
    s.customers = [{ id: 900, drink: 'espresso', ...huge }];
    let stunStreak = 0;
    let wet = false;
    s = runUntil(s, (x) => {
      const b = bot(x);
      stunStreak = b.stunTicksLeft > 0 ? stunStreak + 1 : 0;
      expect(stunStreak).toBeLessThanOrEqual(300);
      if (x.messes.some((m) => m.kind === 'spill' && m.x === b.tile.x && m.y === b.tile.y)) wet = true;
      return x.today.served === 1;
    }, 3000);
    expect(s.today.served).toBe(1);
    expect(wet).toBe(true); // it did walk through a spill
  });

  it('a forced bot can slip and keeps its plan', () => {
    /** bot-1 boxed in by spills at (6,3) with a latte for the pass; p1 parked out of the way. */
    function forced(seed: number): GameState {
      const s = createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 1, dayLengthSec: 600 } });
      s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
      startDay(s);
      parkHuman(s);
      const b = bot(s);
      b.pos = { x: 6, y: 3 };
      b.tile = { x: 6, y: 3 };
      b.holding = 'latte';
      b.bot!.plan = [{ kind: 'use', station: 'counter', action: 'put' }];
      for (const d of NEIGHBOURS) spill(s, 6 + d.x, 3 + d.y);
      return s;
    }
    const slipped = (x: GameState) => x.log.some((e) => e.kind === 'slip' && e.data.player === 'bot-1');
    let s: GameState | null = null;
    for (let seed = 1; seed <= 500 && s === null; seed++) {
      let t = forced(seed);
      for (let i = 0; i < 120 && !slipped(t); i++) t = step(t, []);
      if (slipped(t)) s = t;
    }
    expect(s).not.toBeNull();
    let x = s!;
    expect(bot(x).stunTicksLeft).toBeGreaterThan(0);
    const plan = structuredClone(bot(x).bot!.plan);
    expect(plan).toEqual([{ kind: 'use', station: 'counter', action: 'put' }]);
    const pos = { ...bot(x).pos };
    while (bot(x).stunTicksLeft > 0) {
      x = step(x, []);
      expect(bot(x).bot!.plan).toEqual(plan);
      if (bot(x).stunTicksLeft > 0) expect(bot(x).pos).toEqual(pos); // the tick the stun runs out the bot acts again
    }
    x = runUntil(x, (y) => bot(y).pos.x !== pos.x || bot(y).pos.y !== pos.y, 10);
    x = runUntil(x, (y) => {
      const first = bot(y).bot!.plan[0];
      return first?.kind !== 'use' || first.station !== 'counter';
    }, 600); // reached the counter and did the put
  });

  it('a bot mops when idle and the floor is dirty', () => {
    let s = cafe(1);
    parkHuman(s);
    spill(s, 3, 4);
    spill(s, 8, 3);
    spill(s, 9, 5);
    let held = false;
    s = runUntil(s, (x) => {
      if (x.mop.heldBy === 'bot-1') held = true;
      return x.messes.length === 0;
    }, 3000);
    expect(held).toBe(true);
    s = step(s, []);
    expect(s.mop).toEqual({ pos: LAYOUT.mopHome, heldBy: null });
    expect(bot(s).tool).toBeNull();
  });

  it('a bot does not mop a clean-enough floor', () => {
    let s = cafe(1);
    parkHuman(s);
    spill(s, 3, 4);
    s.cleanliness = 90;
    for (let i = 0; i < 600; i++) {
      s = step(s, []);
      expect(s.mop.heldBy).toBeNull();
    }
  });

  it('a bot that loses the mop mid-plan drops the rest of the plan', () => {
    let s = cafe(1);
    parkHuman(s);
    spill(s, 3, 4);
    spill(s, 8, 3);
    spill(s, 9, 5);
    // Mop in hand, on its way to a clean node.
    s = runUntil(s, (x) => {
      const b = bot(x);
      const first = b.bot!.plan[0];
      return b.tool === 'mop' && first?.kind === 'floor' && first.action === 'clean' && b.bot!.path.length > 0;
    }, 3000);
    bot(s).tool = null; // e.g. sent home while the bot was out cold
    s.mop = { pos: { ...LAYOUT.mopHome }, heldBy: null };
    s = runUntil(s, (x) => bot(x).bot!.plan.length === 0, 2);
    expect(bot(s).tool).toBeNull();
  });

  // Review Focus 4
  it('an order interrupts a mop plan', () => {
    let s = cafe(1);
    parkHuman(s);
    spill(s, 3, 4);
    spill(s, 8, 3);
    spill(s, 9, 5);
    s = runUntil(s, (x) => bot(x).cleaningTicksLeft > 0, 3000);
    expect(bot(s).tool).toBe('mop');
    s.customers = [{ id: 900, drink: 'espresso', ...huge }];
    s = runUntil(s, (x) => x.mop.heldBy === null && bot(x).bot!.claim === 900, ECONOMY.bots.thinkTicks + 2);
    expect(bot(s).tool).toBeNull();
    s = runUntil(s, (x) => {
      const b = bot(x);
      expect(b.tool === 'mop' && b.holding !== null).toBe(false);
      return x.today.served === 1;
    }, 3000);
  });

  // Review Focus 1
  it('a botched drink at the cap is binned, not spilled', () => {
    /** bot-1 holding an unchecked latte that it notices after 4 ticks (seed 2: the spill roll hits), `messes` spills down. */
    const notice = (messes: number) => {
      let s = cafe(1);
      s.rng = 1128724345; // pinned: the stream where the notice's spill roll hits (B6's smaller hand moved seed 2's)
      parkHuman(s);
      for (let i = 0; i < messes; i++) spill(s, i < 11 ? 1 + i : 1, i < 11 ? 3 : 4);
      const b = bot(s);
      b.holding = 'latte';
      b.bot!.noticeTicksLeft = 4;
      const wasted = s.today.wasted ?? 0;
      for (let i = 0; i < 4; i++) s = step(s, []);
      expect(bot(s).bot!.noticeTicksLeft).toBe(0);
      return { s, wasted };
    };
    // Control, one below the cap: the roll hits, the latte hits the floor where the bot stands.
    const below = notice(ECONOMY.mess.max - 1);
    const tile = bot(below.s).tile;
    expect(below.s.messes.length).toBe(ECONOMY.mess.max);
    expect(below.s.messes.at(-1)).toMatchObject({ kind: 'spill', x: tile.x, y: tile.y });
    expect(bot(below.s).holding).toBeNull();
    expect(below.s.today.wasted ?? 0).toBe(below.wasted + 1);
    expect(bot(below.s).bot!.plan.some((st) => st.kind === 'use' && st.action === 'trash')).toBe(false); // nothing left to bin
    // At the cap the same roll hits, but nothing lands: the drink stays in hand and goes in the bin.
    const at = notice(ECONOMY.mess.max);
    expect(at.s.messes.length).toBe(ECONOMY.mess.max);
    expect(bot(at.s).holding).toBe('latte');
    expect(at.s.today.wasted ?? 0).toBe(at.wasted); // nothing wasted on the floor
    expect(bot(at.s).bot!.plan[0]).toEqual({ kind: 'use', station: 'trash', action: 'trash' });
    const s = runUntil(at.s, (x) => bot(x).holding === null, 60 * 10); // binned at the trash
    expect(s.messes.length).toBe(ECONOMY.mess.max);
    expect(s.today.wasted ?? 0).toBe(at.wasted + 1);
    expect(nearestStation(s, bot(s).pos)?.kind).toBe('trash');
  });
});

/** A café with its slots edited (stations rebuilt from them), `bots` bots, one parked human, no arrivals. */
function cafeSlots(bots: number, edit: (slots: SlotContent[]) => void): GameState {
  const s = createRun({ seed: 2, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots, dayLengthSec: 600 } });
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  edit(s.slots!);
  s.stations = stationsFromSlots(tierOf(s), s.slots!);
  return startDay(s);
}
const TWIN_ESPRESSO = (sl: SlotContent[]) => { sl[5] = 'espresso'; };
const NO_TRASH = (sl: SlotContent[]) => { sl[sl.indexOf('trash')] = null; };
const NO_GRINDER = (sl: SlotContent[]) => { sl[sl.indexOf('grinder')] = null; };
const useSteps = (p: Player) => p.bot!.plan.filter((x) => x.kind === 'use');
const insertAt = (p: Player, kind: string) =>
  useSteps(p).filter((x) => x.kind === 'use' && x.action === 'insert' && x.station.startsWith(kind)).map((x) => (x.kind === 'use' ? x.station : ''));
/** Every 'use' step of every bot names a station that exists. */
const plansValid = (s: GameState) =>
  s.players.every((p) => !p.bot || p.bot.plan.every((x) => x.kind !== 'use' || s.stations.some((st) => st.id === x.station)));

describe('bots with duplicate or missing stations', () => {
  it('two espresso machines, two bots on two espressos: each plan targets a different machine', () => {
    let s = cafeSlots(2, TWIN_ESPRESSO);
    expect(s.stations.map((st) => st.id)).toContain('espresso-2');
    s.customers = [{ id: 920, drink: 'espresso', ...huge }, { id: 921, drink: 'espresso', ...huge }];
    for (let i = 0; i < 12; i++) s = step(s, []);
    const a = insertAt(bot(s, 'bot-1'), 'espresso');
    const b = insertAt(bot(s, 'bot-2'), 'espresso');
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]).not.toBe(b[0]);
    // Each insert/take pair keeps one machine.
    for (const p of [bot(s, 'bot-1'), bot(s, 'bot-2')]) {
      const plan = p.bot!.plan;
      for (let i = 0; i < plan.length - 1; i++) {
        const x = plan[i];
        const y = plan[i + 1];
        if (x.kind === 'use' && x.action === 'insert') expect(y).toEqual({ kind: 'use', station: x.station, action: 'take' });
      }
    }
    s = runUntil(s, (x) => x.customers.length === 0, 60 * 60);
    expect(s.today.drinks!.espresso).toBe(2);
  });

  it('a bot whose machine turns busy before it inserts moves to the idle duplicate', () => {
    let s = cafeSlots(1, TWIN_ESPRESSO);
    s.customers = [{ id: 930, drink: 'espresso', ...huge }];
    const atEspresso = (x: GameState) => {
      const st = bot(x).bot!.plan[0];
      return bot(x).holding === 'grounds' && st?.kind === 'use' && st.action === 'insert' && st.station === 'espresso';
    };
    s = runUntil(s, atEspresso, 60 * 30);
    const esp = s.stations.find((st) => st.id === 'espresso')!;
    esp.busyTicksLeft = 2000;
    esp.making = 'espresso';
    s = runUntil(s, (x) => { const st = bot(x).bot!.plan[0]; return st?.kind === 'use' && st.station === 'espresso-2'; }, 60 * 30);
    expect(bot(s).bot!.plan.slice(0, 2)).toEqual([
      { kind: 'use', station: 'espresso-2', action: 'insert' },
      { kind: 'use', station: 'espresso-2', action: 'take' },
    ]);
    const served = s.today.served;
    s = runUntil(s, (x) => x.customers.length === 0, 60 * 30);
    expect(s.today.served).toBe(served + 1);
  });

  it('Review Focus 4: no bin and no grinder, a bot holding grounds drops them on the floor and does not loop', () => {
    let s = cafeSlots(1, (sl) => { NO_TRASH(sl); NO_GRINDER(sl); });
    expect(s.stations.some((st) => st.kind === 'trash' || st.kind === 'grinder')).toBe(false);
    const b = bot(s);
    b.holding = 'grounds';
    b.bot!.plan = [{ kind: 'use', station: 'grinder', action: 'take' }]; // a stale step for a machine that is gone
    for (let i = 0; i < 300 && !s.messes.some((m) => m.kind === 'grounds'); i++) {
      s = step(s, []);
      expect(plansValid(s)).toBe(true);
    }
    expect(s.messes.some((m) => m.kind === 'grounds')).toBe(true);
    expect(bot(s).holding).toBeNull();
    expect(bot(s).bot!.plan.some((x) => x.kind === 'use' && x.action === 'trash')).toBe(false);
  });

  it('Review Focus 4: no grinder but a bin, a bot holding grounds bins them', () => {
    let s = cafeSlots(1, NO_GRINDER);
    const b = bot(s);
    b.holding = 'grounds';
    b.bot!.plan = [{ kind: 'use', station: 'grinder', action: 'take' }];
    s = runUntil(s, (x) => bot(x).holding === null, 300);
    expect(s.messes.some((m) => m.kind === 'grounds')).toBe(false);
    expect(nearestStation(s, bot(s).pos)?.kind).toBe('trash');
  });

  it('no bin: dropPlan walks to a floor node out of every station\'s reach', () => {
    const s = cafeSlots(1, NO_TRASH);
    const b = bot(s);
    b.holding = 'grounds';
    const plan = dropPlan(s, b);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ kind: 'floor', action: 'drop' });
    const node = (plan[0] as { node: Vec2 }).node;
    expect(node).toEqual(floorDropNode(s, b.pos));
    expect(isWalkable(s, node)).toBe(true);
    expect(nearestStation(s, node)).toBeNull();
    // With a bin, the bin.
    const withBin = cafe(1);
    bot(withBin).holding = 'grounds';
    expect(dropPlan(withBin, bot(withBin))).toEqual([{ kind: 'use', station: 'trash', action: 'trash' }]);
  });

  it('floorDropNode avoids spills and falls back to the bot\'s own node', () => {
    const s = cafeSlots(1, NO_TRASH);
    const from = bot(s).pos;
    const first = floorDropNode(s, from);
    s.messes.push({ id: 999, kind: 'spill', x: first.x, y: first.y, amount: 1 });
    const second = floorDropNode(s, from);
    expect(second).not.toEqual(first);
    expect(spillTiles(s).some((t) => t.x === second.x && t.y === second.y)).toBe(false);
  });

  it('a botched drink with no bin ends on the floor as a spill', () => {
    let s = cafeSlots(1, NO_TRASH);
    const b = bot(s);
    b.holding = 'latte';
    b.bot!.noticeTicksLeft = 4;
    s = runUntil(s, (x) => bot(x).holding === null, 300);
    expect(s.messes.some((m) => m.kind === 'spill')).toBe(true);
    expect(plansValid(s)).toBe(true);
  });

  it('a botched drink with no bin, the roll missing: the plan is a floor drop, never a trash step', () => {
    // At the mess cap spillHeld fails whatever the roll, so the plan decides.
    let s = cafeSlots(1, NO_TRASH);
    for (let i = 0; i < ECONOMY.mess.max; i++) s.messes.push({ id: 500 + i, kind: 'spill', x: 1 + (i % 10), y: i < 10 ? 4 : 5, amount: 1 });
    const b = bot(s);
    b.holding = 'latte';
    b.bot!.noticeTicksLeft = 4;
    for (let i = 0; i < 4; i++) s = step(s, []);
    expect(bot(s).bot!.plan[0]).toMatchObject({ kind: 'floor', action: 'drop' });
  });
});

describe('default café determinism (station resolution must not change the default choice)', () => {
  const fnv = (str: string): number => {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };
  // Measured on fb1 @ e503518 / fb1-sim-slots @ da09025 (rng, JSON length, FNV-1a of JSON.stringify).
  const golden: [number, number, number, number][] = [
    [0, 1798888878, 3227, 2905389040],
    [1, -1928183945, 4348, 3243538846],
    [2, -1360289472, 5200, 1819755783],
    [3, -2056066339, 6038, 3097927026],
  ];
  for (const [bots, rng, len, hash] of golden) {
    it(`seed 5, ${bots} bot(s), 900 ticks: identical state`, () => {
      let s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots } });
      s.scenario = 'normal';
      s = startDay(s);
      for (let i = 0; i < 900; i++) s = step(s, []);
      expect(s.rng).toBe(rng);
      const j = JSON.stringify(s);
      expect(j.length).toBe(len);
      expect(fnv(j)).toBe(hash);
    });
  }
});
