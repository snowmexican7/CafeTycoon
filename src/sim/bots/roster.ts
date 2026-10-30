import { ECONOMY } from '../../data/economy';
import { LAYOUT } from '../../data/layout';
import type { BotsChoice, BotState, GameState, Personality, Player } from '../types';
import { floorFields } from '../tiles';
import { freeSpot } from '../spawn';

/** Who the bot baristas are: their ids, names, personalities, and how many the café wants. */
export const BOT_IDS = ['bot-1', 'bot-2', 'bot-3', 'bot-4'];
export const BOT_PERSONALITIES: Personality[] = ['steady', 'hurried', 'veteran', 'rookie'];
const MAX_BARISTAS = LAYOUT.spawnPoints.length; // four: one spawn point per barista

export function isBot(p: Player): boolean {
  return p.bot !== undefined;
}

/** Crew bots and agency temps: ids no person can join as. */
export function isBotId(id: string): boolean {
  return id.startsWith('bot-') || isTempId(id);
}

/** Temp baristas (B6 hire-temp card) clock in for one day and leave at closing. */
export const TEMP_ID = 'temp-1';
export function isTempId(id: string): boolean {
  return id.startsWith('temp-');
}

/** Connected people, plus tester stand-ins (bots with the 'human' personality). */
export function humanCount(state: GameState): number {
  // people who collapsed from too much espresso are out for the day (src/sim/espresso.ts)
  return state.players.filter((p) => (p.bot ? p.bot.personality === 'human' : p.connected && !p.espresso?.out)).length;
}

/** 'auto' tops the crew up to three; a number is a request, capped at four baristas in all. */
export function wantedBots(state: GameState): number {
  return botsFor(state.settings.bots, humanCount(state));
}

/** How many bots clock in for a bots setting and crew size: 'auto' fills to three baristas; a number never overfills the four spots. */
export function botsFor(n: GameState['settings']['bots'], humans: number): number {
  const wanted = n === 'auto' ? ECONOMY.bots.autoCrew - humans : Math.min(n, MAX_BARISTAS - humans, ECONOMY.bots.names.length);
  return Math.max(0, wanted);
}

/** The bots choices on offer for a crew of this many people: 'auto', off, then each count up to the cap. The lobby and the solo screen share it. */
export function botChoices(humans: number): BotsChoice[] {
  const out: BotsChoice[] = ['auto'];
  for (let n = 0; n <= botsFor(3, humans); n++) out.push(n);
  return out;
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
  // FB2 A3 fix round 2: a mid-day cover bot (or temp, or stand-in) never lands inside a fixture (the stand's sink).
  const pos = freeSpot(state, LAYOUT.spawnPoints[state.players.length] ?? LAYOUT.door);
  return {
    id,
    name,
    pos,
    moveDir: { x: 0, y: 0 },
    interactQueued: false,
    holding: null,
    connected: true,
    bot: makeBotState(personality),
    idleTicks: 0,
    ...floorFields(pos),
  };
}

/** Bring the bot crew to the wanted size: drop the highest ids first, add at the lowest free ids. */
export function syncBots(state: GameState): GameState {
  const wanted = wantedBots(state);
  let current = state.players.filter((p) => BOT_IDS.includes(p.id));
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
  syncTemp(state);
  return state;
}

/** A hired temp joins for the day when a spot behind the bar is free (four baristas at most). */
function syncTemp(state: GameState): void {
  if (state.phase !== 'day' || state.players.some((p) => isTempId(p.id))) return;
  if (!state.activeTomorrow.some((o) => o.effects.some((e) => e.kind === 'temp'))) return;
  if (state.players.length >= MAX_BARISTAS) return;
  state.players.push(newBarista(state, TEMP_ID, ECONOMY.bots.tempName, 'rookie'));
}

/** Doors shut: bots forget the day's plans and stand still. Mistakes stay on the record. */
export function resetBotsForNight(state: GameState): GameState {
  state.players = state.players.filter((p) => !isTempId(p.id));
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
