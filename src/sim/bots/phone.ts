/**
 * Bots answering the branch's phone (CLAUDE_MORNING_PROMPT part 2 item 1). Bots hold no roles, so when a
 * call has rung for BOT_ANSWER_SEC and no person has picked up, the first idle bot (players order, no
 * claim, plan empty or idle) answers. Pure of RNG: same state, same answer.
 */
import { applyBotCall, callFor, callRinging, elapsed } from '../call';
import { secondsToTicks } from '../constants';
import type { GameState, Player } from '../types';

/** How long a call rings before a bot steps in. */
export const BOT_ANSWER_SEC = 10;

const idle = (p: Player): boolean =>
  !!p.bot && p.connected && p.stunTicksLeft === 0 && p.bot.claim === null && (p.bot.plan.length === 0 || p.bot.plan[0]!.kind === 'idle');

/** Order: take it unless yesterday's branch day lost people; machine: fix it with two or more branch staff. */
export function botTakesCall(state: GameState, kind: 'machine' | 'order'): boolean {
  if (kind === 'order') return (state.days.at(-1)?.branch?.walked ?? 0) === 0;
  return (state.branch?.staff ?? 0) >= 2;
}

/** Called once per tick from stepBots. */
export function answerPhone(state: GameState): void {
  if (!state.gear || !callRinging(state)) return;
  const c = callFor(state)!;
  if (elapsed(state) - c.ringAt < secondsToTicks(BOT_ANSWER_SEC)) return;
  const bot = state.players.find(idle);
  if (bot) applyBotCall(state, bot.id, botTakesCall(state, c.kind));
}
