import { ECONOMY } from '../../data/economy';
import { LAYOUT } from '../../data/layout';
import type { BotState, GameState, Personality, Player } from '../types';

/** Who the bot baristas are: their ids, names, personalities, and how many the café wants. */
export const BOT_IDS = ['bot-1', 'bot-2', 'bot-3'];
export const BOT_PERSONALITIES: Personality[] = ['steady', 'rookie', 'veteran'];
const MAX_BARISTAS = LAYOUT.spawnPoints.length; // four: one spawn point per barista

export function isBot(p: Player): boolean {
  return p.bot !== undefined;
}

export function isBotId(id: string): boolean {
  return id.startsWith('bot-');
}

/** Connected people, plus tester stand-ins (bots with the 'human' personality). */
export function humanCount(state: GameState): number {
  // people who collapsed from too much espresso are out for the day (src/sim/espresso.ts)
  return state.players.filter((p) => (p.bot ? p.bot.personality === 'human' : p.connected && !p.espresso?.out)).length;
}

/** 'auto' tops the crew up to three; a number is a request, capped at four baristas in all. */
export function wantedBots(state: GameState): number {
  const h = humanCount(state);
  const n = state.settings.bots;
  const wanted = n === 'auto' ? ECONOMY.bots.names.length - h : Math.min(n, MAX_BARISTAS - h, ECONOMY.bots.names.length);
  return Math.max(0, wanted);
}

export function makeBotState(personality: Personality): BotState {
  return {
    personality,
    reactionTicksLeft: 0,
    yieldTicksLeft: 0,
    plan: [],
    claim: null,
    mistakes: 0,
    claimDrink: null,
    thinkTicksLeft: 0,
    path: [],
    yields: 0,
    nodeRank: 0,
    target: null,
    waitTicks: 0,
    noticeTicksLeft: 0,
  };
}

function newBarista(state: GameState, id: string, name: string, personality: Personality): Player {
  return {
    id,
    name,
    pos: { ...(LAYOUT.spawnPoints[state.players.length] ?? LAYOUT.door) },
    moveDir: { x: 0, y: 0 },
    interactQueued: false,
    holding: null,
    connected: true,
    bot: makeBotState(personality),
    idleTicks: 0,
  };
}

/** Bring the bot crew to the wanted size: drop the highest ids first, add at the lowest free ids. */
export function syncBots(state: GameState): GameState {
  const wanted = wantedBots(state);
  let current = state.players.filter((p) => isBotId(p.id));
  while (current.length > wanted) {
    const highest = current.reduce((a, b) => (BOT_IDS.indexOf(b.id) > BOT_IDS.indexOf(a.id) ? b : a));
    state.players = state.players.filter((p) => p !== highest);
    current = current.filter((p) => p !== highest);
  }
  for (let i = 0; i < BOT_IDS.length && current.length < wanted; i++) {
    if (current.some((p) => p.id === BOT_IDS[i])) continue;
    const bot = newBarista(state, BOT_IDS[i], ECONOMY.bots.names[i], BOT_PERSONALITIES[i]);
    state.players.push(bot);
    current.push(bot);
  }
  return state;
}

/** Doors shut: bots forget the day's plans and stand still. Mistakes stay on the record. */
export function resetBotsForNight(state: GameState): GameState {
  for (const p of state.players) {
    if (!p.bot) continue;
    p.bot = { ...makeBotState(p.bot.personality), mistakes: p.bot.mistakes };
    p.moveDir = { x: 0, y: 0 };
  }
  return state;
}

/** Tester only: n stand-in "humans" played by bots with the 'human' personality. */
export function addStandIns(state: GameState, n: number): GameState {
  for (let i = 1; i <= n; i++) state.players.push(newBarista(state, `sim-${i}`, `Stand-in ${i}`, 'human'));
  return state;
}

/** A bot's walking speed multiplier: personality, scaled by the skill setting (stand-ins ignore skill). */
export function botSpeed(state: GameState, bot: BotState): number {
  const p = bot.personality;
  const skill = p === 'human' ? 1 : ECONOMY.bots.skill.speed[state.settings.botSkill - 1];
  return ECONOMY.bots.personalities[p].speed * skill;
}
