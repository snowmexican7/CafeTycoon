import { settleBranch } from './branch';
import { seasonWeekEnd } from './season';
import { sigRating } from './signature';
import { comboRating } from './taste';
import { accuracyRating } from './accuracy';
import { spoilOvernight } from './spoilage';
import { noteMissedFavourites } from './regulars';
import { ECONOMY } from '../data/economy';
import { loseCustomer } from './customers';
import { computeModifiers, rentForDay } from './effects';
import { payWages } from './staff';
import { activeCheckout } from './checkout';
import { eventActive, judgeInspection } from './events';
import { emitLog } from './log';
import { startNight } from './run';
import { layoutFor } from '../data/layout';
import { resetBotsForNight } from './bots/roster';
import { clearFloorFields } from './tiles';
import { returnBox } from './condiments';
import { steepClosing } from './steep';
import type { GameState } from './types';
import { settleEspresso } from './espresso';
import { settleChallenges } from './challenges';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Doors shut: lose the queue, clean up, pay rent, move reputation, and decide what comes next. */
export function finishDay(state: GameState): GameState {
  if (eventActive(state, 'healthInspector')) judgeInspection(state);
  steepClosing(state); // after the inspector: the pour-out at closing is never seen by them
  for (const c of state.customers) loseCustomer(state, c);
  state.customers = [];
  state.messes = [];
  state.rogue = null;
  state.mop = { pos: { ...layoutFor(state.tier).mopHome }, heldBy: null };
  state.pass = [];
  for (const e of state.events) emitLog(state, 'event.end', { kind: e.kind });
  state.events = [];
  state.eventSchedule = [];
  for (const s of state.stations) {
    s.busyTicksLeft = 0;
    s.output = null;
    delete s.outputSince;
    s.occupiedBy = null;
    s.making = null;
    // Review M9: a half-poured pot doesn't keep over the night.
    delete s.potLeft;
    delete s.potColdAt;
    delete s.potOff;
  }
  for (const p of state.players) {
    p.holding = null;
    delete p.heldSince; // A2: no cup, no clock
    if (p.tool === 'box') returnBox(state, p);
    clearFloorFields(p);
  }
  resetBotsForNight(state);

  settleChallenges(state);
  const rent = rentForDay(state);
  state.today.rent = rent;
  state.cash = round2(state.cash - rent);
  payWages(state);
  const licence = activeCheckout(state).daily;
  if (licence > 0) {
    state.cash = round2(state.cash - licence);
    state.today.checkoutFees = round2((state.today.checkoutFees ?? 0) + licence);
  }
  settleEspresso(state);
  settleBranch(state);

  const { served, lost } = state.today;
  const weighted = lost + (state.today.lostRegulars ?? 0) * (ECONOMY.customers.regular.lostWeight - 1);
  const ratio = served + lost === 0 ? 1 : served / (served + weighted);
  const r = ECONOMY.reputation;
  const bonus = state.today.inspection === 'pass' ? ECONOMY.events.inspector.reputationBonus : 0;
  const rogueHit = ECONOMY.rogue.repHit * (state.today.rogues ?? 0);
  const next = state.reputation + (ratio >= r.threshold ? r.delta : -r.delta) + bonus - rogueHit + computeModifiers(state).quality + accuracyRating(state.today) + comboRating(state.today) + sigRating(state.today);
  state.reputation = round2(Math.min(r.max, Math.max(r.min, next)));

  noteMissedFavourites(state);
  spoilOvernight(state);
  state.days.push(state.today);
  state.activeTomorrow = [];

  if (state.cash < 0) {
    state.phase = 'ended';
    state.bankrupt = true;
    state.phaseTicksLeft = 0;
    return state;
  }
  if ((!state.unlimited && state.day === ECONOMY.scoredWeekDays) || seasonWeekEnd(state)) {
    state.phase = 'weekEnd';
    state.phaseTicksLeft = 0;
    return state;
  }
  state.day += 1;
  return startNight(state);
}
