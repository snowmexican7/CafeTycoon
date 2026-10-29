import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../data/economy';
import { LAYOUT } from '../data/layout';
import { scenarioById } from '../data/scenarios';
import { finishDay } from './closing';
import { computeModifiers } from './effects';
import { placeMess } from './floor';
import { createRun, startDay } from './run';
import { scoreRun, summarizeRun } from './score';
import { step } from './step';
import { validateInput } from './validate';
import type { GameState, PlayerInput } from './types';

const opts = { seed: 11, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }], settings: { bots: 0 } };
const ticks = (s: GameState, n: number, inputs: PlayerInput[] = []) => {
  for (let i = 0; i < n; i++) s = step(s, i === 0 ? inputs : []);
  return s;
};

describe('step', () => {
  it('runs night -> day -> closing -> night with the right timers', () => {
    let s = createRun(opts);
    s = ticks(s, 60 * 60);
    expect(s.phase).toBe('day');
    expect(s.day).toBe(1);
    expect(s.morningNotes[0]).toBe(scenarioById[s.scenario].note);
    s = ticks(s, 150 * 60);
    expect(s.phase).toBe('closing');
    s = ticks(s, ECONOMY.closingGraceSeconds * 60);
    expect(s.phase).toBe('night');
    expect(s.day).toBe(2);
    expect(s.days).toHaveLength(1);
    expect(s.days[0].rent).toBe(25);
    expect(s.hand).toHaveLength(5);
  });

  it('counts idle ticks for still players', () => {
    let s = createRun(opts);
    s = ticks(s, 60 * 60);
    expect(s.phase).toBe('day');
    const move: PlayerInput = { kind: 'move', playerId: 'p1', x: 1, y: 0, interact: false };
    s = ticks(s, 60, [move]);
    expect(s.players[0].idleTicks).toBe(0);
    expect(s.players[1].idleTicks).toBe(60);
  });

  it('idle ticks are a running total: still, move, still adds both still stretches; bots stay at 0', () => {
    let s = createRun({ ...opts, settings: { bots: 1 } });
    s = ticks(s, 60 * 60);
    expect(s.phase).toBe('day');
    const p1 = (x: GameState) => x.players.find((p) => p.id === 'p1')!;
    const base = p1(s).idleTicks;
    s = ticks(s, 60);
    s = ticks(s, 60, [{ kind: 'move', playerId: 'p1', x: 1, y: 0, interact: false }]);
    s = ticks(s, 60, [{ kind: 'move', playerId: 'p1', x: 0, y: 0, interact: false }]);
    expect(p1(s).idleTicks - base).toBe(120);
    expect(s.players.find((p) => p.bot)!.idleTicks).toBe(0);
  });

  it('a still tick with an interact is not idle; a disconnected player is not counted', () => {
    let s = createRun(opts);
    s = ticks(s, 60 * 60);
    const before = s.players.map((p) => p.idleTicks);
    s = step(s, [{ kind: 'move', playerId: 'p1', x: 0, y: 0, interact: true }, { kind: 'leave', playerId: 'p2' }]);
    expect(s.players[0].idleTicks).toBe(before[0]);
    expect(s.players[1].idleTicks).toBe(before[1]);
  });

  it('closing clears stations and hands, pays rent, moves reputation, and can bankrupt', () => {
    let s = createRun(opts);
    s = ticks(s, 60 * 60);
    s.players[0].holding = 'latte';
    s.stations[1].output = 'espresso';
    s.today = { ...s.today, served: 7, lost: 3 };
    s.cash = 30;
    s.phase = 'closing';
    s.phaseTicksLeft = 1;
    s = step(s, []);
    expect(s.cash).toBe(5);
    expect(s.reputation).toBe(2.7);
    expect(s.players[0].holding).toBeNull();
    expect(s.stations[1].output).toBeNull();
    expect(s.phase).toBe('night');
    s.today = { ...s.today, served: 1, lost: 9 };
    s.phase = 'closing';
    s.phaseTicksLeft = 1;
    s = step(s, []);
    expect(s.reputation).toBe(2.5);
    expect(s.cash).toBe(-20);
    expect(s.phase).toBe('ended');
    expect(s.bankrupt).toBe(true);
  });

  it('reaches weekEnd after day 7 and continues into unlimited mode', () => {
    // Short phases keep the whole week cheap; tick counts derive from the settings.
    const settings = { dayLengthSec: 30, nightLengthSec: 30, bots: 0 };
    const nightTicks = settings.nightLengthSec * 60;
    const dayTicks = (settings.dayLengthSec + ECONOMY.closingGraceSeconds) * 60;
    let s = createRun({ ...opts, settings });
    s.cash = 10000;
    for (let d = 1; d <= 7; d++) {
      s = ticks(s, nightTicks);
      s = ticks(s, dayTicks);
    }
    expect(s.phase).toBe('weekEnd');
    expect(s.days).toHaveLength(7);
    expect(scoreRun(s)).toBeCloseTo(s.cash - 100);
    expect(step(s, [{ kind: 'weekEnd', playerId: 'p2', choice: 'stop' }]).phase).toBe('weekEnd'); // not the host
    s = step(s, [{ kind: 'weekEnd', playerId: 'p1', choice: 'continue' }]);
    expect(s.phase).toBe('night');
    expect(s.day).toBe(8);
    expect(s.unlimited).toBe(true);
    s = ticks(s, nightTicks);
    s = ticks(s, dayTicks);
    expect(s.days[7].rent).toBeCloseTo(31.25);
    expect(s.phase).toBe('night');
    expect(step(s, [{ kind: 'weekEnd', playerId: 'p1', choice: 'stop' }]).phase).toBe('night'); // ignored outside weekEnd
  }, 15000);

  it('is deterministic and JSON-safe mid-run', () => {
    // Review Focus 4
    const settings = { dayLengthSec: 30, nightLengthSec: 30, bots: 0 };
    const script = (s: GameState) => {
      s = ticks(s, settings.nightLengthSec * 60);
      s = ticks(s, 30, [{ kind: 'move', playerId: 'p1', x: 1, y: 0, interact: false }]);
      return ticks(s, 20 * 60);
    };
    const a = script(createRun({ ...opts, settings }));
    const b = script(createRun({ ...opts, settings }));
    expect(a).toEqual(b);
    const c = JSON.parse(JSON.stringify(a)) as GameState;
    expect(step(c, [])).toEqual(step(a, []));
    expect(script(createRun({ ...opts, settings, seed: 12 }))).not.toEqual(a);
  });

  it('handles join and leave mid-day', () => {
    // Review Focus 4
    let s = createRun(opts);
    s = ticks(s, 60 * 60);
    s.players[1].holding = 'latte';
    s = step(s, [
      { kind: 'leave', playerId: 'p2' },
      { kind: 'join', playerId: 'p3', name: 'Jo' },
    ]);
    expect(s.players[1].connected).toBe(false);
    expect(s.players[1].holding).toBeNull();
    expect(s.players[2]).toMatchObject({ id: 'p3', name: 'Jo', pos: LAYOUT.door, holding: null, connected: true });
    s = ticks(s, 10);
    expect(s.players).toHaveLength(3);
    s = step(s, [{ kind: 'join', playerId: 'p2', name: 'S' }]);
    expect(s.players[1].connected).toBe(true);
    expect(s.players).toHaveLength(3);
  });

  it('applies a pace change immediately to new customers only', () => {
    // Review Focus 5
    let s = createRun(opts);
    s.scenario = 'normal'; // seed 11 rolls rainyWeek, which also scales patience
    s = ticks(s, 60 * 60);
    s.customers = [{ id: 1, drink: 'espresso', patienceLeft: 1500, patienceMax: 1500 }];
    s = step(s, [{ kind: 'settings', playerId: 'p1', settings: { pace: 5 } }]);
    expect(s.settings.pace).toBe(5);
    expect(s.customers[0].patienceMax).toBe(1500);
    expect(computeModifiers(s).patience).toBeCloseTo(0.7);
    expect(step(s, [{ kind: 'settings', playerId: 'p2', settings: { pace: 1 } }]).settings.pace).toBe(5); // not the host
  });

  it('summarizes a run', () => {
    const s = createRun(opts);
    s.owned = [{ itemId: 'streetSign', effects: [] }];
    s.days = [s.today];
    s.cash = 140;
    expect(summarizeRun(s, '2026-10-28')).toEqual({
      date: '2026-10-28',
      seed: 11,
      scenario: s.scenario,
      players: ['K', 'S'],
      daysCompleted: 1,
      score: 40,
      itemsBought: ['streetSign'],
    });
  });
});

describe('input validation', () => {
  const day = () => ticks(createRun(opts), 60 * 60);
  it('clamps settings into range and ignores non-numbers', () => {
    let s = step(day(), [{ kind: 'settings', playerId: 'p1', settings: { pace: 9 as never } }]);
    expect(s.settings.pace).toBe(5);
    s = step(s, [{ kind: 'settings', playerId: 'p1', settings: { pace: NaN as never } }]);
    expect(s.settings.pace).toBe(5);
    s = step(s, [{ kind: 'settings', playerId: 'p1', settings: { dayLengthSec: 5, nightLengthSec: 10_000 } }]);
    expect(s.settings.dayLengthSec).toBe(30);
    expect(s.settings.nightLengthSec).toBe(600);
    expect(Number.isFinite(computeModifiers(s).traffic)).toBe(true);
  });
  it('rejects malformed restock and move inputs', () => {
    let s = createRun(opts);
    for (const packs of [NaN, 0, -1, 1.5, Infinity]) {
      s = step(s, [{ kind: 'restock', playerId: 'p1', supply: 'beans', packs }]);
    }
    expect(s.cash).toBe(100);
    expect(s.supplies.beans).toBe(20);
    s = step(day(), [{ kind: 'move', playerId: 'p1', x: NaN, y: 5, interact: 'yes' as never }]);
    expect(s.players[0].moveDir).toEqual({ x: 0, y: 1 });
    expect(s.players[0].interactQueued).toBe(false);
  });
});

describe('drop input', () => {
  it('drop input validates, queues only by day and is cleared each tick', () => {
    expect(validateInput({ kind: 'drop', playerId: 'p1' })).toEqual({ kind: 'drop', playerId: 'p1' });
    /** p1 at the counter with a latte in hand, then one tick with a drop. */
    const dropAtCounter = (s: GameState): GameState => {
      Object.assign(s.players[0], { pos: { x: 6, y: 5 }, holding: 'latte' });
      return step(s, [{ kind: 'drop', playerId: 'p1' }]);
    };
    // By night nothing happens: the latte stays in hand.
    const night = dropAtCounter(createRun(opts));
    expect(night.phase).toBe('night');
    expect(night.players[0].holding).toBe('latte');
    expect(night.pass).toEqual([]);
    expect(night.players[0].dropQueued).toBe(false);
    // By day it lands on the pass.
    const day = dropAtCounter(startDay(createRun(opts)));
    expect(day.phase).toBe('day');
    expect(day.players[0].holding).toBeNull();
    expect(day.pass.map((i) => i.item)).toEqual(['latte']);
    expect(day.players[0].dropQueued).toBe(false);
  });

  it('a drop naming a bot is ignored', () => {
    const s = startDay(createRun({ ...opts, settings: { bots: 1 } }));
    const before = s.players.find((p) => p.id === 'bot-1')!;
    const withDrop = step(s, [{ kind: 'drop', playerId: 'bot-1' }]).players.find((p) => p.id === 'bot-1')!;
    const without = step(s, []).players.find((p) => p.id === 'bot-1')!;
    expect(before.dropQueued).toBe(false);
    expect(withDrop).toEqual(without);
  });
});

describe('closing', () => {
  it('day end clears floor and rogue state', () => {
    const s = startDay(createRun(opts));
    s.messes = [{ id: 1, kind: 'spill', x: 3, y: 4, amount: 1 }];
    s.cleanliness = 40;
    s.mop = { pos: { x: 4, y: 4 }, heldBy: 'p1' };
    Object.assign(s.players[0], { tool: 'mop', stunTicksLeft: 50, cleaningTicksLeft: 10, cleaningMess: 1, dropQueued: true });
    s.rogue = { customerId: 3, drink: 'latte', stage: 'making', pos: { x: 5, y: 2 }, path: [], station: 'steamer', ticksLeft: 100, waitTicks: 0 };
    s.stations.find((st) => st.id === 'steamer')!.occupiedBy = 3;
    const t = finishDay(s);
    expect(t.messes).toEqual([]);
    expect(t.rogue).toBeNull();
    expect(t.mop).toEqual({ pos: LAYOUT.mopHome, heldBy: null });
    expect(t.stations.every((st) => st.occupiedBy === null)).toBe(true);
    expect(t.players[0]).toMatchObject({ tool: null, stunTicksLeft: 0, cleaningTicksLeft: 0, cleaningMess: null, dropQueued: false });
  });
});

describe('floor day', () => {
  it('a floor day with drops, a slip and a mop plan is deterministic and JSON-safe', () => {
    /** 1 human + 1 bot, traffic on: p1 drops a latte, paces a row of spills for 600 ticks pressing R now and then, then stands. */
    const floorDay = (seed: number) => {
      let s = startDay(createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 1, dayLengthSec: 600 } }));
      const p1 = s.players.find((p) => p.id === 'p1')!;
      p1.pos = { x: 3, y: 4 };
      p1.tile = { x: 3, y: 4 };
      p1.holding = 'latte';
      s.menu.coldBrew = false; // no pass prep: an idle bot turns to the floor before the first customer
      for (let x = 4; x <= 9; x++) s.messes.push({ id: s.nextMessId++, kind: 'spill', x, y: 4, amount: 1 });
      s = step(s, [{ kind: 'drop', playerId: 'p1' }]);
      const seen = { drop: false, slip: false, mop: false };
      for (let i = 0; i < 1200; i++) {
        const inputs: PlayerInput[] = [];
        if (i < 600 && i % 120 === 0) inputs.push({ kind: 'move', playerId: 'p1', x: i % 240 === 0 ? 1 : -1, y: 0, interact: false });
        if (i === 600) inputs.push({ kind: 'move', playerId: 'p1', x: 0, y: 0, interact: false });
        if (i % 90 === 45) inputs.push({ kind: 'drop', playerId: 'p1' });
        s = step(s, inputs);
        for (const e of s.log) {
          if (e.kind === 'drop' && e.data.item === 'latte') seen.drop = true;
          if (e.kind === 'slip') seen.slip = true;
        }
        if (s.players.some((p) => p.bot?.plan.some((st) => st.kind === 'floor'))) seen.mop = true;
      }
      return { s, seen };
    };
    const a = floorDay(5);
    expect(a.seen).toEqual({ drop: true, slip: true, mop: true });
    expect(floorDay(5).s).toEqual(a.s);
    const round = JSON.parse(JSON.stringify(a.s)) as GameState;
    let x = a.s;
    let y = round;
    for (let i = 0; i < 300; i++) {
      x = step(x, []);
      y = step(y, []);
    }
    expect(y).toEqual(x);
    expect(floorDay(6).s).not.toEqual(a.s);
  });
});

describe('chaos pack', () => {
  it('a day with messes, a mop plan and a rogue is deterministic and JSON-safe', () => {
    /** Day 2, 1 human + 1 bot, traffic on; three messes, a dirty café and one customer already upset. */
    const makeDay = () => {
      const s = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 1, dayLengthSec: 600 } });
      s.day = 2;
      const day = startDay(s);
      for (const tile of [{ x: 4, y: 4 }, { x: 6, y: 5 }, { x: 8, y: 4 }]) placeMess(day, 'grounds', tile);
      day.cleanliness = 60;
      if (day.customers.length === 0) day.customers.push({ id: 900, drink: 'latte', patienceLeft: 1200, patienceMax: 1200 });
      day.customers[0].upset = { ticksLeft: 60 };
      return day;
    };
    const run = (start: GameState) => {
      let s = start;
      let cleans = 0;
      let rogueTick = -1;
      let lastSeq = -1;
      for (let i = 0; i < 4000; i++) {
        s = step(s, []);
        for (const e of s.log) {
          if (e.seq <= lastSeq) continue;
          lastSeq = e.seq;
          if (e.kind === 'clean') cleans += 1;
        }
        if (s.rogue && rogueTick < 0) rogueTick = i;
      }
      return { s, cleans, rogueTick };
    };
    const a = run(makeDay());
    const b = run(makeDay());
    expect(b.s).toEqual(a.s);
    expect(a.cleans).toBeGreaterThan(0);
    expect(a.rogueTick).toBeGreaterThanOrEqual(0);

    const mid = makeDay();
    let x = mid;
    for (let i = 0; i < 1500; i++) x = step(x, []);
    let y = JSON.parse(JSON.stringify(x)) as GameState;
    for (let i = 0; i < 2500; i++) {
      x = step(x, []);
      y = step(y, []);
    }
    expect(y).toEqual(x);
  });
});
