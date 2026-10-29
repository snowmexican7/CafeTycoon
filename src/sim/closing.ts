import { ECONOMY } from '../data/economy';
import { loseCustomer } from './customers';
import { computeModifiers, rentForDay } from './effects';
import { eventActive, judgeInspection } from './events';
import { emitLog } from './log';
import { startNight } from './run';
import { LAYOUT } from '../data/layout';
import { resetBotsForNight } from './bots/roster';
import { clearFloorFields } from './tiles';
import type { GameState } from './types';
import { settleEspresso } from './espresso';
import { settleChallenges } from './challenges';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Doors shut: lose the queue, clean up, pay rent, move reputation, and decide what comes next. */
export function finishDay(state: GameState): GameState {
  if (eventActive(state, 'healthInspector')) judgeInspection(state);
  for (const c of state.customers) loseCustomer(state, c);
  state.customers = [];
  state.messes = [];
  state.rogue = null;
  state.mop = { pos: { ...LAYOUT.mopHome }, heldBy: null };
  state.pass = [];
  for (const e of state.events) emitLog(state, 'event.end', { kind: e.kind });
  state.events = [];
  state.eventSchedule = [];
  for (const s of state.stations) {
    s.busyTicksLeft = 0;
    s.output = null;
    s.occupiedBy = null;
    s.making = null;
  }
  for (const p of state.players) {
    p.holding = null;
    clearFloorFields(p);
  }
  resetBotsForNight(state);

  settleChallenges(state);
  const rent = rentForDay(state);
  state.today.rent = rent;
  state.cash = round2(state.cash - rent);
  settleEspresso(state);

  const { served, lost } = state.today;
  const weighted = lost + (state.today.lostRegulars ?? 0) * (ECONOMY.customers.regular.lostWeight - 1);
  const ratio = served + lost === 0 ? 1 : served / (served + weighted);
  const r = ECONOMY.reputation;
  const bonus = state.today.inspection === 'pass' ? ECONOMY.events.inspector.reputationBonus : 0;
  const rogueHit = ECONOMY.rogue.repHit * (state.today.rogues ?? 0);
  const next = state.reputation + (ratio >= r.threshold ? r.delta : -r.delta) + bonus - rogueHit + computeModifiers(state).quality;
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
