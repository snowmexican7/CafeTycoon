import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../data/economy';
import { LAYOUT } from '../data/layout';
import { TICK_RATE } from './constants';
import { ESPRESSO, canDrinkEspresso, espressoSpeed, settleEspresso } from './espresso';
import { createRun } from './run';
import { stationsFromSlots } from './slots';
import { tierOf } from './growth';
import { step } from './step';
import type { GameState, PlayerInput } from './types';

const opts = { seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }], settings: { bots: 0 as const } };
const ticks = (s: GameState, n: number, inputs: PlayerInput[] = []) => {
  for (let i = 0; i < n; i++) s = step(s, i === 0 ? inputs : []);
  return s;
};
const shot: PlayerInput = { kind: 'espresso', playerId: 'p1' };
const p1 = (s: GameState) => s.players.find((p) => p.id === 'p1')!;

/** Day 1, doors just opened, K standing in front of the espresso machine. */
function atMachine(settings: Record<string, unknown> = { bots: 0 }): GameState {
  let s = createRun({ ...opts, settings });
  s = ticks(s, s.phaseTicksLeft);
  expect(s.phase).toBe('day');
  s = structuredClone(s);
  p1(s).pos = { x: 3, y: 2 };
  return s;
}
const drinks = (s: GameState, n: number) => {
  for (let i = 0; i < n; i++) s = step(s, [shot]);
  return s;
};

describe('espresso easter egg', () => {
  it('works at any espresso machine, not only the first', () => {
    const s = atMachine();
    s.slots![5] = 'espresso';
    s.stations = stationsFromSlots(tierOf(s), s.slots!);
    p1(s).pos = { x: 11, y: 2 };
    expect(canDrinkEspresso(s, p1(s))).toBe(true);
    p1(s).pos = { x: 6, y: 4 };
    expect(canDrinkEspresso(s, p1(s))).toBe(false);
  });

  it('only works near the espresso machine, during the day, for people', () => {
    let s = createRun(opts);
    expect(canDrinkEspresso(s, p1(s))).toBe(false); // night
    s = atMachine();
    expect(canDrinkEspresso(s, p1(s))).toBe(true);
    const away = structuredClone(s);
    p1(away).pos = { ...LAYOUT.spawnPoints[0] };
    expect(step(away, [shot]).players[0].espresso).toBeUndefined();
    const bot = atMachine({ bots: 1 });
    const b = bot.players.find((p) => p.bot)!;
    b.pos = { x: 3, y: 2 };
    expect(canDrinkEspresso(bot, b)).toBe(false);
    expect(step(bot, [{ kind: 'espresso', playerId: b.id }]).players.find((p) => p.bot)!.espresso).toBeUndefined();
  });

  it('drinks a held espresso anywhere, using the cup instead of beans', () => {
    let s = atMachine();
    p1(s).pos = { ...LAYOUT.spawnPoints[0] };
    p1(s).holding = 'espresso';
    const beans = s.supplies.beans;
    expect(canDrinkEspresso(s, p1(s))).toBe(true);
    s = step(s, [shot]);
    expect(p1(s).holding).toBeNull();
    expect(s.supplies.beans).toBe(beans);
    expect(Math.round((espressoSpeed(p1(s)) - 1) * 100)).toBe(30);
  });

  it('costs a bean and each shot today is stronger: 30, 35, 40, 45, 50%', () => {
    let s = atMachine();
    const beans = s.supplies.beans;
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      s = step(s, [shot]);
      seen.push(Math.round((espressoSpeed(p1(s)) - 1) * 100));
    }
    expect(seen).toEqual([30, 35, 40, 45, 50]);
    expect(s.supplies.beans).toBe(beans - 5);
    expect(p1(s).espresso!.out).toBe(false);
  });

  it('actually moves the barista faster', () => {
    const base = atMachine();
    const move: PlayerInput = { kind: 'move', playerId: 'p1', x: 0, y: 1, interact: false };
    const plain = ticks(base, 30, [move]);
    const boosted = ticks(step(base, [shot]), 30, [move]);
    const d0 = plain.players[0].pos.y - 2;
    const d1 = boosted.players[0].pos.y - 2;
    expect(d1 / d0).toBeCloseTo(1.3, 1);
  });

  it('lasts about 15 s, and re-drinking refreshes the timer', () => {
    let s = step(atMachine(), [shot]);
    s = ticks(s, 10 * TICK_RATE);
    expect(espressoSpeed(p1(s))).toBeCloseTo(1.3);
    s = step(s, [shot]);
    s = ticks(s, 10 * TICK_RATE);
    expect(espressoSpeed(p1(s))).toBeCloseTo(1.35); // would have run out without the refresh
    s = ticks(s, 5 * TICK_RATE + 1);
    expect(espressoSpeed(p1(s))).toBe(1);
  });

  it('the 6th shot is a collapse: out for the day, wheeled off, ambulance on the bill', () => {
    let s = drinks(atMachine(), 5);
    s = structuredClone(s);
    p1(s).holding = 'grounds';
    s = step(s, [shot]);
    const me = p1(s);
    expect(me.espresso!.out).toBe(true);
    expect(me.holding).toBeNull();
    expect(espressoSpeed(me)).toBe(1);
    expect(s.today.ambulance).toBe(ESPRESSO.ambulanceBill);
    expect(s.log.some((e) => e.kind === 'espresso.collapse' && e.data.by === 'p1')).toBe(true);
    const fell = { ...me.pos };
    // can't move, use stations or drink more
    s = ticks(s, 60, [{ kind: 'move', playerId: 'p1', x: 1, y: 1, interact: true }]);
    expect(p1(s).pos).toEqual(fell);
    s = step(s, [shot]);
    expect(p1(s).espresso!.shots).toBe(6);
    s = ticks(s, ESPRESSO.collapse.wheeledOut * TICK_RATE);
    expect(p1(s).pos).toEqual(LAYOUT.door);
    expect(p1(s).espresso!.out).toBe(true);
  });

  it('a bot covers the station when the crew has room', () => {
    let s = drinks(atMachine({ bots: 'auto' }), 6);
    const bots = s.players.filter((p) => p.bot).length;
    expect(bots).toBe(ECONOMY.bots.autoCrew - 1); // two humans, one out
    s = ticks(s, s.phaseTicksLeft + ECONOMY.closingGraceSeconds * TICK_RATE + 2);
    expect(s.phase).toBe('night');
    s = ticks(s, s.phaseTicksLeft);
    expect(s.phase).toBe('day');
    expect(s.players.filter((p) => p.bot).length).toBe(bots - 1); // the cover bot went home
  }, 15_000); // simulates most of a day

  it('next morning they are back with $150 on the tab, paid from profits, never bankrupting', () => {
    let s = drinks(atMachine(), 6);
    s = ticks(s, s.phaseTicksLeft + ECONOMY.closingGraceSeconds * TICK_RATE + 2);
    expect(s.phase).toBe('night');
    expect(s.bankrupt).toBe(false);
    expect(s.days[0].ambulance).toBe(150);
    expect(s.debt).toBe(150);
    s = ticks(s, s.phaseTicksLeft);
    expect(s.phase).toBe('day');
    expect(p1(s).espresso).toBeUndefined(); // back, and the counter resets for the new day
    expect(s.morningNotes.some((n) => n.includes('ER'))).toBe(true);

    // a profitable day pays half its profit toward the tab
    s = structuredClone(s);
    s.today.sales = 100;
    const cashBefore = s.cash + 100;
    s = ticks(s, s.phaseTicksLeft + ECONOMY.closingGraceSeconds * TICK_RATE + 2);
    const d = s.days[1];
    const profit = d.sales + d.tips - d.rent;
    expect(d.debtPaid).toBeCloseTo(profit * ESPRESSO.repayShare, 2);
    expect(s.debt).toBeCloseTo(150 - d.debtPaid!, 2);
    expect(s.cash).toBeLessThan(cashBefore + 1000); // sanity: the tab came out of the till
  }, 15_000); // simulates a day and the next morning

  it('a broke crew only pays what is in the till', () => {
    const s = structuredClone(atMachine());
    s.debt = 150;
    s.cash = 10;
    s.today.sales = 100;
    s.today.rent = 25;
    settleEspresso(s);
    expect(s.today.debtPaid).toBe(10);
    expect(s.cash).toBe(0);
    expect(s.debt).toBe(140);
    const loss = structuredClone(atMachine());
    loss.debt = 150;
    loss.today.rent = 25;
    settleEspresso(loss);
    expect(loss.today.debtPaid).toBeUndefined();
    expect(loss.debt).toBe(150);
  });

  it('is deterministic: same seed and inputs give the same state', () => {
    const run = () => {
      let s = atMachine({ bots: 'auto' });
      for (let i = 0; i < 8; i++) s = ticks(s, 30, [shot, { kind: 'move', playerId: 'p2', x: 1, y: 0, interact: i % 2 === 0 }]);
      return ticks(s, 900);
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
