/**
 * Bot cut step 4a: the test-only crew. The game has no bot crewmates any more (Kennedy 2026-11-06), so tests and the
 * headless scripts add their own: `addBots` puts on the old bot baristas (bot-1..bot-4, Bo/Lu/Mo/Zip, with their old
 * personalities, as the game's old roster did), `addStandIns` puts on stand-in "humans" (bots with the 'human'
 * personality, ids sim-1..). Both are played by the test-only brain (src/harness/brain.ts, `installHarness`).
 * The game's own closing resets every bot body for the night (src/sim/botBody.ts `resetBotsForNight`).
 */
import { ECONOMY } from '../data/economy';
import { LAYOUT } from '../data/layout';
import { makeBotState } from '../sim/botBody';
import { freeSpot } from '../sim/spawn';
import { floorFields } from '../sim/tiles';
import type { GameState, Personality, Player } from '../sim/types';

/** The old bot baristas: their ids, names (ECONOMY.bots.names) and personalities, in roster order. */
export const BOT_IDS = ['bot-1', 'bot-2', 'bot-3', 'bot-4'];
export const BOT_PERSONALITIES: Personality[] = ['steady', 'hurried', 'veteran', 'rookie'];

/** Connected people, plus tester stand-ins (bots with the 'human' personality). People out for the day don't count. */
export function humanCount(state: GameState): number {
  return state.players.filter((p) => (p.bot ? p.bot.personality === 'human' : p.connected && !p.espresso?.out)).length;
}

function newBarista(state: GameState, id: string, name: string, personality: Personality): Player {
  // FB2 A3 fix round 2: a barista never lands inside a fixture (the stand's sink).
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

/** Put `n` bot baristas on the crew (at most four in all), at the lowest free ids, as the old roster did. */
export function addBots(state: GameState, n: number): GameState {
  let added = 0;
  for (let i = 0; i < BOT_IDS.length && added < n; i++) {
    if (state.players.some((p) => p.id === BOT_IDS[i])) continue;
    state.players.push(newBarista(state, BOT_IDS[i], ECONOMY.bots.names[i], BOT_PERSONALITIES[i]));
    added++;
  }
  return state;
}

/** n stand-in "humans" played by bots with the 'human' personality. */
export function addStandIns(state: GameState, n: number): GameState {
  for (let i = 1; i <= n; i++) state.players.push(newBarista(state, `sim-${i}`, `Stand-in ${i}`, 'human'));
  return state;
}
