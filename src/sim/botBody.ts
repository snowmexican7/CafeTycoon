/**
 * Bot cut step 4a: what is left of bots in the game. Kennedy 2026-11-06: no bot crewmates at all; the only bot body in
 * a real run is the solo robot cashier (src/sim/cashier.ts). Tests and the headless scripts add their own bot players
 * through src/harness/crew.ts, so the generic `p.bot` body bits live here: a fresh bot state, its walking speed, the ids
 * no person can play as, and the night reset.
 */
import { ECONOMY } from '../data/economy';
import type { BotState, GameState, Personality } from './types';

/** The robot cashier's player id (src/sim/cashier.ts). */
export const CASHIER_ID = 'cashier';

/** Ids no person can join or sit as: the robot cashier and the test-only players (`bot-*` crew, `sim-*` stand-ins). */
export function isBotId(id: string): boolean {
  return id === CASHIER_ID || id.startsWith('bot-') || id.startsWith('sim-');
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

/** A bot body's walking speed multiplier: its personality's (the cashier is 'steady', ×1.0). */
export function botSpeed(bot: BotState): number {
  return ECONOMY.bots.personalities[bot.personality].speed;
}

/** Doors shut: bot bodies forget the day's plans and stand still. Mistakes stay on the record. */
export function resetBotsForNight(state: GameState): GameState {
  for (const p of state.players) {
    if (!p.bot) continue;
    p.bot = { ...makeBotState(p.bot.personality), mistakes: p.bot.mistakes };
    p.moveDir = { x: 0, y: 0 };
  }
  return state;
}
