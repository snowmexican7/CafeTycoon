// FB1 WP3: the "close early" vote. Final selector shape:
//   closeEarlyState(state): { votes: number; needed: number; voted: PlayerId[]; open: boolean; hint: 'soldOut' | 'empty' | null }
// `needed` = connected humans, `votes` = how many of them have voted, `open` = day phase and the 15 s gate has passed,
// `hint` = why the UI may nudge the button ('soldOut' wins over 'empty').
import { secondsToTicks } from './constants';
import { availableDrinks } from './customers';
import { menuDrinks } from './unlocks';
import type { GameState, Player, PlayerId, PlayerInput } from './types';

/** Seconds of the day that must have run before a vote counts. */
export const CLOSE_EARLY_GATE_SECONDS = 15;
/** How long the shop must sit empty before the 'empty' hint shows. */
export const EMPTY_HINT_SECONDS = 10;

export interface CloseEarlyState {
  votes: number;
  needed: number;
  voted: PlayerId[];
  open: boolean;
  hint: 'soldOut' | 'empty' | null;
}

const isConnectedHuman = (p: Player): boolean => !p.bot && p.connected;

/** Connected humans: the people whose agreement closes the shop. */
export function closeVoters(state: GameState): Player[] {
  return state.players.filter(isConnectedHuman);
}

/** True once the doors are open and the day has run long enough for a vote to count. */
export function closeVoteOpen(state: GameState): boolean {
  return state.phase === 'day' && secondsToTicks(state.settings.dayLengthSec) - state.phaseTicksLeft >= secondsToTicks(CLOSE_EARLY_GATE_SECONDS);
}

export function closeEarlyState(state: GameState): CloseEarlyState {
  const voters = closeVoters(state);
  const cast = state.closeVotes ?? [];
  const voted = voters.filter((p) => cast.includes(p.id)).map((p) => p.id);
  let hint: CloseEarlyState['hint'] = null;
  if (menuDrinks(state).length > 0 && availableDrinks(state).length === 0) hint = 'soldOut';
  else if (
    state.customers.length === 0 &&
    state.rogue === null &&
    (menuDrinks(state).length === 0 || (state.emptySince !== undefined && state.tick - state.emptySince >= secondsToTicks(EMPTY_HINT_SECONDS)))
  ) {
    hint = 'empty';
  }
  return { votes: voted.length, needed: voters.length, voted, open: closeVoteOpen(state), hint };
}

/** A vote (or a withdrawn vote) from a connected human during the open part of the day; anything else is ignored. */
export function applyCloseEarly(state: GameState, input: Extract<PlayerInput, { kind: 'closeEarly' }>): void {
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !isConnectedHuman(p) || !closeVoteOpen(state)) return;
  const rest = (state.closeVotes ?? []).filter((id) => id !== p.id);
  const next = input.on ? [...rest, p.id] : rest;
  if (next.length === 0) delete state.closeVotes;
  else state.closeVotes = next;
}

/** A player left: their vote goes with them. */
export function dropCloseVote(state: GameState, id: PlayerId): void {
  if (!state.closeVotes) return;
  const rest = state.closeVotes.filter((v) => v !== id);
  if (rest.length === 0) delete state.closeVotes;
  else state.closeVotes = rest;
}

/** Every connected human has voted (and there is at least one). Checked each tick, so someone leaving can tip it. */
export function closeVoteUnanimous(state: GameState): boolean {
  const voters = closeVoters(state);
  const cast = state.closeVotes ?? [];
  return voters.length > 0 && voters.every((p) => cast.includes(p.id));
}
