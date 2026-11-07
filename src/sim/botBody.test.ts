import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../data/economy';
import { nightViewModel } from '../ui/viewModels';
import { addBots, addStandIns } from '../harness/crew';
import { createRun, startDay, startNight } from './run';
import { stepNight } from './night';
import { summarizeRun } from './score';
import { step } from './step';
import { botSpeed, isBotId, makeBotState, resetBotsForNight, CASHIER_ID } from './botBody';
import type { GameState } from './types';

const p1 = { id: 'p1', name: 'K' };
const p2 = { id: 'p2', name: 'S' };
const solo = { seed: 1, hostId: 'p1', players: [p1] };
const two = () => createRun({ seed: 1, hostId: 'p1', players: [p1, p2] });
const botIds = (s: GameState) => s.players.filter((p) => p.bot).map((p) => p.id);

describe('bot bodies (bot cut 4a: no crew bots in the game)', () => {
  it('a run of people never gets bot crewmates, solo or co-op, day after day', () => {
    let s = startDay(createRun(solo));
    expect(botIds(s)).toEqual([]);
    s = startDay(startNight(s));
    expect(botIds(s)).toEqual([]);
    expect(botIds(startDay(two()))).toEqual([]);
    expect(botIds(startDay(createRun({ ...solo, settings: { cashier: true } })))).toEqual([CASHIER_ID]); // only the cashier
  });

  it('test-only crew bots are not in the ready check, the night list or the run summary', () => {
    let s = startNight(startDay(addBots(two(), 1)));
    expect(botIds(s)).toEqual(['bot-1']);
    s = step(s, [{ kind: 'ready', playerId: 'p1' }, { kind: 'ready', playerId: 'p2' }]);
    expect(s.phase).toBe('day');
    const night = startNight(startDay(addBots(two(), 1)));
    expect(nightViewModel(night, 'p1').ready.map((r) => r.id)).toEqual(['p1', 'p2']);
    expect(summarizeRun(night, '2026-10-28').players).toEqual(['K', 'S']);
    expect(stepNight(night).phase).toBe('night');
  });

  it('inputs naming a bot body are ignored and nobody joins as one', () => {
    let s = startNight(startDay(addBots(two(), 1)));
    const before = s.players.find((p) => p.id === 'bot-1')!;
    const ready = [...s.ready];
    s = step(s, [
      { kind: 'join', playerId: 'bot-2', name: 'Evil' },
      { kind: 'join', playerId: 'sim-1', name: 'Evil' },
      { kind: 'join', playerId: CASHIER_ID, name: 'Evil' },
      { kind: 'leave', playerId: 'bot-1' },
      { kind: 'move', playerId: 'bot-1', x: 1, y: 0, interact: true },
      { kind: 'ready', playerId: 'bot-1' },
      { kind: 'menu', playerId: 'bot-1', drink: 'latte', on: false },
    ]);
    const bot = s.players.find((p) => p.id === 'bot-1')!;
    expect([bot.connected, bot.moveDir, bot.holding]).toEqual([before.connected, before.moveDir, before.holding]);
    expect(s.ready).toEqual(ready);
    expect(s.menu.latte).toBe(true);
    expect(s.players.map((p) => p.id)).toEqual(['p1', 'p2', 'bot-1']);
    expect([CASHIER_ID, 'bot-3', 'sim-2', 'p1', 'robot'].map(isBotId)).toEqual([true, true, true, false, false]);
  });

  it('a new person joins before the bot bodies', () => {
    let s = startNight(startDay(addBots(two(), 1)));
    s = step(s, [{ kind: 'join', playerId: 'p3', name: 'Jo' }]);
    expect(s.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'bot-1']);
  });

  it('the harness crew: stand-ins and bots with the old names and personalities; bodies reset for the night; speed is the personality', () => {
    const s = startDay(addBots(addStandIns(createRun(solo), 2), 1));
    expect(s.players.map((p) => [p.id, p.name, p.bot?.personality])).toEqual([
      ['p1', 'K', undefined],
      ['sim-1', 'Stand-in 1', 'human'],
      ['sim-2', 'Stand-in 2', 'human'],
      ['bot-1', 'Bo', 'steady'],
    ]);
    expect(addBots(createRun(solo), 9).players.map((p) => [p.name, p.bot?.personality])).toEqual([
      ['K', undefined],
      ['Bo', 'steady'],
      ['Lu', 'hurried'],
      ['Mo', 'veteran'],
      ['Zip', 'rookie'],
    ]);
    const bot = s.players[3];
    bot.moveDir = { x: 1, y: 0 };
    bot.bot = { ...bot.bot!, mistakes: 2, claim: 4, claimDrink: 'latte', yields: 3, path: [{ x: 1, y: 1 }] };
    resetBotsForNight(s);
    expect(bot.bot).toEqual({ ...makeBotState('steady'), mistakes: 2 });
    expect(bot.moveDir).toEqual({ x: 0, y: 0 });
    expect(botSpeed(makeBotState('rookie'))).toBe(ECONOMY.bots.personalities.rookie.speed);
    expect(botSpeed(makeBotState('steady'))).toBe(1);
    expect(botSpeed(makeBotState('human'))).toBe(ECONOMY.bots.personalities.human.speed);
  });
});
