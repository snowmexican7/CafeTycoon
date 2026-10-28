import type { GameState, RunRecord } from './types';

/** The week's score: net profit over the run. */
export function scoreRun(state: GameState): number {
  return Math.round((state.cash - state.startingCash) * 100) / 100;
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
