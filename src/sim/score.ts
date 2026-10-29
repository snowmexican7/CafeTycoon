import { catalogueById } from '../data/catalogue';
import { ECONOMY } from '../data/economy';
import type { GameState, RunRecord } from './types';
import { checkoutSpent } from './checkout';
import { tierSpent } from './growth';

/** B11: what the café's permanent fittings are worth at the week's end (half their price), so upgrades are not pure cost. */
export function fittingsValue(state: GameState): number {
  let total = 0;
  for (const o of state.owned) {
    const item = catalogueById[o.itemId];
    if (item?.duration === 'permanent') total += item.cost;
  }
  total += checkoutSpent(state);
  total += tierSpent(state);
  return Math.round(total * ECONOMY.fittingsResale * 100) / 100;
}

/** The week's score: net profit over the run, plus the fittings' resale value (B11). */
export function scoreRun(state: GameState): number {
  return Math.round((state.cash - state.startingCash + fittingsValue(state)) * 100) / 100;
}

/** One line for the run history. The caller supplies today's date; the sim has no clock. */
export function summarizeRun(state: GameState, date: string): RunRecord {
  return {
    date,
    seed: state.seed,
    scenario: state.scenario,
    players: state.players.filter((p) => !p.bot).map((p) => p.name),
    daysCompleted: state.days.length,
    score: scoreRun(state),
    itemsBought: state.owned.map((o) => o.itemId),
  };
}
