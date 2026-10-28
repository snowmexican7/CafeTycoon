import { ECONOMY } from '../data/economy';
import { rentForDay } from './effects';
import { startNight } from './run';
import type { GameState } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Doors shut: lose the queue, clean up, pay rent, move reputation, and decide what comes next. */
export function finishDay(state: GameState): GameState {
  state.today.lost += state.customers.length;
  state.customers = [];
  state.pass = [];
  for (const s of state.stations) {
    s.busyTicksLeft = 0;
    s.output = null;
  }
  for (const p of state.players) p.holding = null;

  const rent = rentForDay(state);
  state.today.rent = rent;
  state.cash = round2(state.cash - rent);

  const { served, lost } = state.today;
  const ratio = served + lost === 0 ? 1 : served / (served + lost);
  const r = ECONOMY.reputation;
  const next = state.reputation + (ratio >= r.threshold ? r.delta : -r.delta);
  state.reputation = round2(Math.min(r.max, Math.max(r.min, next)));

  state.days.push(state.today);
  state.activeTomorrow = [];

  if (state.cash < 0) {
    state.phase = 'ended';
    state.bankrupt = true;
    state.phaseTicksLeft = 0;
    return state;
  }
  if (!state.unlimited && state.day === ECONOMY.scoredWeekDays) {
    state.phase = 'weekEnd';
    state.phaseTicksLeft = 0;
    return state;
  }
  state.day += 1;
  return startNight(state);
}
