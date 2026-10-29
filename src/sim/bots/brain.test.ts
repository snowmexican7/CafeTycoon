import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../../data/economy';
import { createRun, startDay } from '../run';
import { nearestStation } from '../movement';
import { step } from '../step';
import type { GameState, Personality, Player } from '../types';
import { chainFor, reactionDelay, think, uncoveredOrder } from './brain';
import { findPath, targetNodes } from './path';
import { addStandIns, botSpeed, makeBotState } from './roster';
import { floorFields } from '../tiles';

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
    const ids = (d: Parameters<typeof chainFor>[0], f: 'serve' | 'put') =>
      chainFor(d, f).map((x) => (x.kind === 'use' ? `${x.station}:${x.action}` : 'idle'));
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
      60 * 15,
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
    // let any botch still in hand be noticed and binned
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
    s = runUntil(s, (x) => (x.today.wasted ?? 0) > wasted, 60 * 10); // noticed: binned
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
