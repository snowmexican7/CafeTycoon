import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { enterClosing, step } from './step';
import { restockCost, rushCost } from './night';
import { CONDIMENTS } from './condiments';
import { ECONOMY, RESTOCK } from '../data/economy';
import type { GameState } from './types';

/** Round 4 f follow-up: restock (and condiment boxes) also work in the day, as a rush delivery at +25%. */
const gearNight = (bots = 0): GameState =>
  createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'L' }], settings: { bots }, tier: 'stand', gear: true });
const gearDay = (bots = 0): GameState => {
  const s = gearNight(bots);
  s.supplies.concentrate = 20;
  return startDay(s);
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const rushes = (s: GameState) => s.log.filter((e) => e.kind === 'restock.rush');

describe('mid-day restock: the rush delivery', () => {
  it('RESTOCK.rushMul is 1.25 and rushCost is the night price plus 25%', () => {
    expect(RESTOCK.rushMul).toBe(1.25);
    const s = gearDay();
    expect(rushCost(s, 'beans', 2)).toBe(round2(restockCost(s, 'beans', 2) * 1.25));
    expect(restockCost(s, 'beans', 2)).toBe(round2(2 * ECONOMY.packs.beans.cost)); // the night price does not read the phase
  });

  it('during the day a person buys at the rush price; the stock arrives at once and restock.rush is logged', () => {
    const s = gearDay();
    s.cash = 100;
    const beans = s.supplies.beans;
    const cost = rushCost(s, 'beans', 2);
    const t = step(s, [{ kind: 'restock', playerId: 'p2', supply: 'beans', packs: 2 }]);
    expect(t.cash).toBe(round2(100 - cost));
    expect(t.supplies.beans).toBe(beans + 2 * ECONOMY.packs.beans.size);
    expect(rushes(t).map((e) => e.data)).toEqual([{ by: 'p2', supply: 'beans', packs: 2, cost }]);
  });

  it('works in the closing phase too', () => {
    const s = gearDay();
    enterClosing(s);
    s.cash = 100;
    const t = step(s, [{ kind: 'restock', playerId: 'p1', supply: 'pastry', packs: 1 }]);
    expect(t.cash).toBe(round2(100 - rushCost(s, 'pastry', 1)));
    expect(rushes(t)).toHaveLength(1);
  });

  it('at night the price is the normal one and nothing is logged as a rush', () => {
    const s = gearNight();
    s.cash = 100;
    const cost = restockCost(s, 'beans', 1);
    const t = step(s, [{ kind: 'restock', playerId: 'p1', supply: 'beans', packs: 1 }]);
    expect(t.cash).toBe(round2(100 - cost));
    expect(rushes(t)).toHaveLength(0);
  });

  it('never on credit, never for strangers, the disconnected or bots, never after the run', () => {
    const s = gearDay(1);
    s.cash = round2(rushCost(s, 'beans', 1) - 0.01);
    expect(step(s, [{ kind: 'restock', playerId: 'p1', supply: 'beans', packs: 1 }]).cash).toBe(s.cash);
    s.cash = 100;
    expect(step(s, [{ kind: 'restock', playerId: 'nobody', supply: 'beans', packs: 1 }]).cash).toBe(100);
    const bot = s.players.find((p) => p.bot)!;
    expect(step(s, [{ kind: 'restock', playerId: bot.id, supply: 'beans', packs: 1 }]).cash).toBe(100);
    const gone = structuredClone(s);
    gone.players.find((p) => p.id === 'p2')!.connected = false;
    expect(step(gone, [{ kind: 'restock', playerId: 'p2', supply: 'beans', packs: 1 }]).cash).toBe(100);
    const ended = structuredClone(s);
    ended.phase = 'ended';
    expect(step(ended, [{ kind: 'restock', playerId: 'p1', supply: 'beans', packs: 1 }]).cash).toBe(100);
  });

  it('a condiment box in the day costs the rush price too ($7.50) and logs restock.rush with supply "condiments"', () => {
    const s = gearDay();
    s.cash = 20;
    s.condimentBoxes = 0;
    const t = step(s, [{ kind: 'condimentBox', playerId: 'p1', boxes: 2 }]);
    const cost = round2(2 * CONDIMENTS.boxCost * RESTOCK.rushMul);
    expect(cost).toBe(15);
    expect([t.cash, t.condimentBoxes]).toEqual([round2(20 - cost), 2]);
    expect(rushes(t).map((e) => e.data)).toEqual([{ by: 'p1', supply: 'condiments', packs: 2, cost }]);
    s.cash = 14.99;
    expect(step(s, [{ kind: 'condimentBox', playerId: 'p1', boxes: 2 }]).condimentBoxes).toBe(0);
  });
});
