import { ECONOMY } from '../data/economy';
import { CONDIMENTS } from './condiments';
import { fridgeCapacity } from './fridge';
import type { GameState, SupplyId } from './types';

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

/** Round 5 devFill: how full a dev fill makes a jar with no cap of its own (beans, concentrate, flavour, pastry). */
export const DEV_JAR = 99;

/** Host-only, dev runs only: the phases a dev input may act in. */
const devHost = (state: GameState, playerId: string): boolean => state.dev === true && playerId === state.hostId;

/**
 * Round 5 `devFill` (host only, dev runs only, night, day or closing): every supply jar to its cap and never lower:
 * `DEV_JAR` for beans, concentrate, flavour and pastry; milk to the fridge's capacity (left alone when the shop has no
 * fridge, which holds none); in a Gear run the condiment bar to `CONDIMENTS.servings` and the box corner to
 * `CONDIMENTS.maxBoxes`. The cash is not touched (`topUpDevCash` keeps that going).
 */
export function applyDevFill(state: GameState, input: { playerId: string }): void {
  if (!devHost(state, input.playerId)) return;
  if (state.phase !== 'night' && state.phase !== 'day' && state.phase !== 'closing') return;
  for (const k of Object.keys(ECONOMY.packs) as SupplyId[]) {
    const cap = k === 'milk' ? fridgeCapacity(state) : DEV_JAR;
    state.supplies[k] = Math.max(state.supplies[k] ?? 0, Number.isFinite(cap) ? cap : DEV_JAR);
  }
  if (state.gear === true) {
    if (state.condiments) state.condiments.servings = Math.max(state.condiments.servings, CONDIMENTS.servings);
    state.condimentBoxes = Math.max(state.condimentBoxes ?? 0, CONDIMENTS.maxBoxes);
  }
}

/** Round 5 `devSkip`: host only, dev runs only, the day or its closing (the pre-open too): may the day end now? step.ts does it. */
export function canDevSkip(state: GameState, playerId: string): boolean {
  return devHost(state, playerId) && (state.phase === 'day' || state.phase === 'closing');
}
