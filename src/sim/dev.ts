import type { GameState } from './types';

/** R4 a: the cash a dev run is kept at (`?dev=1`): plenty to buy anything, shown on the HUD like any other cash. */
export const DEV_CASH = 999_999;

/**
 * Dev runs only: lift cash back up to DEV_CASH. The lift also raises `startingCash` by the same amount, so the
 * run score (cash - startingCash + fittings), the week profit, the season targets and "profit vs. start" never
 * count the top-up as income, and what the crew spends still shows as spent. No-op when dev is off.
 */
export function topUpDevCash(state: GameState): void {
  if (!state.dev || state.cash >= DEV_CASH) return;
  const add = Math.round((DEV_CASH - state.cash) * 100) / 100;
  state.cash = DEV_CASH;
  state.startingCash = Math.round((state.startingCash + add) * 100) / 100;
}

/** Host-only dev pause of the night (or the week-end screen): the timer stops counting; Ready still works. */
export function applyDevPause(state: GameState, input: { playerId: string; paused: boolean }): void {
  if (!state.dev || input.playerId !== state.hostId) return;
  if (state.phase !== 'night' && state.phase !== 'weekEnd') return;
  if (input.paused) state.devPaused = true;
  else delete state.devPaused;
}
