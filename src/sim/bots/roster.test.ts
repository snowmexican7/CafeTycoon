import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../../data/economy';
import { LAYOUT } from '../../data/layout';
import { nightViewModel } from '../../ui/viewModels';
import { createRun, startDay, startNight } from '../run';
import { stepNight } from '../night';
import { summarizeRun } from '../score';
import { step } from '../step';
import { validateInput } from '../validate';
import type { GameState, Settings } from '../types';
import { BOT_IDS, BOT_PERSONALITIES, addStandIns, botSpeed, botsFor, isBot, makeBotState, resetBotsForNight } from './roster';

const p1 = { id: 'p1', name: 'K' };
const p2 = { id: 'p2', name: 'S' };
const two = (settings: Partial<Settings> = {}) => createRun({ seed: 1, hostId: 'p1', players: [p1, p2], settings });
const solo = { seed: 1, hostId: 'p1', players: [p1] };
const botIds = (s: GameState) => s.players.filter(isBot).map((p) => p.id);

describe('bot roster', () => {
  it('auto fills to three baristas on the first morning, after the humans', () => {
    const s = startDay(two());
    expect(s.players.map((p) => [p.id, p.name, p.bot?.personality])).toEqual([
      ['p1', 'K', undefined],
      ['p2', 'S', undefined],
      ['bot-1', 'Bo', 'steady'],
    ]);
    expect(s.players[2].pos).toEqual(LAYOUT.spawnPoints[2]);
    expect(s.players[2]).toMatchObject({ connected: true, idleTicks: 0, holding: null });
    expect(startDay(createRun({ ...solo })).players.filter(isBot)).toHaveLength(2);
  });

  it('a numeric setting is a cap of four baristas', () => {
    expect(botIds(startDay(two({ bots: 3 })))).toEqual(['bot-1', 'bot-2']);
    const s = startDay(createRun({ ...solo, settings: { bots: 3 } }));
    expect(s.players.map((p) => [p.id, p.name, p.bot?.personality])).toEqual([
      ['p1', 'K', undefined],
      ['bot-1', 'Bo', 'steady'],
      ['bot-2', 'Lu', 'hurried'],
      ['bot-3', 'Mo', 'veteran'],
    ]);
    expect(botIds(startDay(two({ bots: 0 })))).toEqual([]);
    expect(botIds(startDay(two({ bots: 1 })))).toEqual(['bot-1']);
  });

  it('the roster has four bots; any crew with two or more bots includes a hurried one', () => {
    expect(BOT_IDS).toEqual(['bot-1', 'bot-2', 'bot-3', 'bot-4']);
    expect(BOT_PERSONALITIES).toEqual(['steady', 'hurried', 'veteran', 'rookie']);
    expect(ECONOMY.bots.names).toHaveLength(BOT_IDS.length);
    // four bots with no humans (tester runs): everyone clocks in, the fourth is a rookie (the veteran stays in the three-bot cap)
    const four = startDay(createRun({ seed: 1, hostId: 'p1', players: [], settings: { bots: 4 } }));
    expect(four.players.map((p) => [p.id, p.name, p.bot?.personality])).toEqual([
      ['bot-1', 'Bo', 'steady'],
      ['bot-2', 'Lu', 'hurried'],
      ['bot-3', 'Mo', 'veteran'],
      ['bot-4', 'Zip', 'rookie'],
    ]);
    for (const n of [2, 3]) {
      const s = startDay(createRun({ ...solo, settings: { bots: n } }));
      expect(s.players.filter((p) => p.bot?.personality === 'hurried')).toHaveLength(1);
    }
    expect(startDay(createRun({ ...solo, settings: { bots: 1 } })).players.some((p) => p.bot?.personality === 'hurried')).toBe(false);
    expect(botsFor('auto', 1)).toBe(2); // auto still fills to three baristas
    expect(botsFor(4, 0)).toBe(4);
    expect(botsFor(4, 1)).toBe(3);
  });

  it('a friend who joins mid-week replaces a bot the next morning, highest id first', () => {
    let s = startDay(createRun({ ...solo }));
    expect(botIds(s)).toEqual(['bot-1', 'bot-2']);
    s = step(s, [{ kind: 'join', playerId: 'p2', name: 'S' }]);
    expect(s.players.map((p) => p.id)).toEqual(['p1', 'p2', 'bot-1', 'bot-2']);
    s = startDay(s);
    expect(s.players.map((p) => p.id)).toEqual(['p1', 'p2', 'bot-1']);
  });

  it('bots are not in the ready check, the night list or the run summary', () => {
    let s = startNight(startDay(two()));
    expect(botIds(s)).toEqual(['bot-1']);
    s = step(s, [{ kind: 'ready', playerId: 'p1' }, { kind: 'ready', playerId: 'p2' }]);
    expect(s.phase).toBe('day');
    const night = startNight(startDay(two()));
    expect(nightViewModel(night, 'p1').ready.map((r) => r.id)).toEqual(['p1', 'p2']);
    expect(summarizeRun(night, '2026-10-28').players).toEqual(['K', 'S']);
    expect(stepNight(night).phase).toBe('night');
  });

  it('Review Focus 3: inputs naming a bot are ignored and nobody joins as a bot', () => {
    let s = startNight(startDay(two()));
    expect(s.phase).toBe('night');
    const before = s.players.find((p) => p.id === 'bot-1')!;
    const ready = [...s.ready];
    s = step(s, [
      { kind: 'join', playerId: 'bot-2', name: 'Evil' },
      { kind: 'leave', playerId: 'bot-1' },
      { kind: 'move', playerId: 'bot-1', x: 1, y: 0, interact: true },
      { kind: 'ready', playerId: 'bot-1' },
      { kind: 'menu', playerId: 'bot-1', drink: 'latte', on: false },
    ]);
    const bot = s.players.find((p) => p.id === 'bot-1')!;
    expect([bot.connected, bot.moveDir, bot.holding]).toEqual([before.connected, before.moveDir, before.holding]);
    expect(s.ready).toEqual(ready);
    expect(s.menu.latte).toBe(true);
    expect(s.players.filter(isBot).map((p) => p.id)).not.toContain('bot-2');
    expect(s.players.map((p) => p.id)).toEqual(['p1', 'p2', 'bot-1']);
  });

  it('a new human joins before the bots', () => {
    let s = startNight(startDay(two()));
    s = step(s, [{ kind: 'join', playerId: 'p3', name: 'Jo' }]);
    expect(s.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'bot-1']);
  });

  it('settings clamp bots to 0..3 or auto and skill to 1..5', () => {
    const clean = (settings: Record<string, unknown>) => {
      const v = validateInput({ kind: 'settings', playerId: 'p1', settings: settings as Partial<Settings> });
      return v && v.kind === 'settings' ? v.settings : null;
    };
    expect(clean({ bots: 9 })).toEqual({ bots: 3 });
    expect(clean({ bots: -1 })).toEqual({ bots: 0 });
    expect(clean({ bots: 1.6 })).toEqual({ bots: 2 });
    expect(clean({ bots: 'x' })).toEqual({});
    expect(clean({ bots: 'auto' })).toEqual({ bots: 'auto' });
    expect(clean({ botSkill: 0 })).toEqual({ botSkill: 1 });
    expect(clean({ botSkill: 9 })).toEqual({ botSkill: 5 });
    expect(clean({ botSkill: NaN })).toEqual({});
  });

  it('stand-ins count as humans, bots reset for the night, and speed follows skill', () => {
    expect(startDay(addStandIns(createRun({ ...solo }), 2)).players.filter((p) => p.bot?.personality !== 'human' && p.bot)).toEqual([]);
    const s = startDay(addStandIns(createRun({ ...solo, settings: { bots: 3 } }), 2));
    expect(s.players.map((p) => [p.id, p.name, p.bot?.personality])).toEqual([
      ['p1', 'K', undefined],
      ['sim-1', 'Stand-in 1', 'human'],
      ['sim-2', 'Stand-in 2', 'human'],
      ['bot-1', 'Bo', 'steady'],
    ]);
    const bot = s.players[3];
    bot.moveDir = { x: 1, y: 0 };
    bot.bot = { ...bot.bot!, mistakes: 2, claim: 4, claimDrink: 'latte', yields: 3, path: [{ x: 1, y: 1 }] };
    resetBotsForNight(s);
    expect(bot.bot).toEqual({ ...makeBotState('steady'), mistakes: 2 });
    expect(bot.moveDir).toEqual({ x: 0, y: 0 });
    s.settings.botSkill = 5;
    expect(botSpeed(s, makeBotState('rookie'))).toBeCloseTo(ECONOMY.bots.personalities.rookie.speed * ECONOMY.bots.skill.speed[4]);
    expect(botSpeed(s, makeBotState('human'))).toBe(ECONOMY.bots.personalities.human.speed);
  });
});
