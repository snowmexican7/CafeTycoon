import { ECONOMY } from '../data/economy';
import { secondsToTicks } from './constants';
import { spawnInfluencer } from './customers';
import { emitLog } from './log';
import { tally } from './tally';
import { rngNext } from './rng';
import { computeModifiers } from './effects';
import type { ActiveEvent, EventKind, GameState } from './types';

export const EVENT_LABELS: Record<EventKind, string> = {
  rushHour: 'Rush hour',
  powerFlicker: 'Power flicker',
  influencerVisit: 'Influencer visiting',
  healthInspector: 'Health inspector',
};

const ALL_KINDS: EventKind[] = ['rushHour', 'powerFlicker', 'influencerVisit', 'healthInspector'];

/** How long an event stays active, in ticks. The influencer's own timer is its customer's patience. */
function durationTicks(kind: EventKind): number {
  const e = ECONOMY.events;
  switch (kind) {
    case 'rushHour':
      return secondsToTicks(e.rushHour.seconds);
    case 'powerFlicker':
      return secondsToTicks(e.powerFlicker.seconds);
    case 'healthInspector':
      return secondsToTicks(e.inspector.seconds);
    case 'influencerVisit':
      return 0;
  }
}

/** Draw today's events (day 2 onward): a count, then a kind and a start tick for each. */
export function scheduleEvents(state: GameState): GameState {
  state.eventSchedule = [];
  if (state.day < 2) return state;
  const [w0, w1] = ECONOMY.events.scheduleWeights;
  const r = rngNext(state);
  const count = r < w0 ? 0 : r < w0 + w1 ? 1 : 2;
  const remaining = [...ALL_KINDS];
  const dayTicks = secondsToTicks(state.settings.dayLengthSec);
  const { windowStart, windowEnd } = ECONOMY.events;
  const odds = computeModifiers(state).eventOdds;
  for (let i = 0; i < count; i++) {
    // Weighted by the forecast's event odds; with even odds this is exactly a uniform pick (one rngNext).
    const total = remaining.reduce((s, k) => s + odds[k], 0);
    let roll = rngNext(state) * total;
    let at = remaining.length - 1;
    for (let j = 0; j < remaining.length; j++) {
      roll -= odds[remaining[j]];
      if (roll < 0) {
        at = j;
        break;
      }
    }
    const kind = remaining.splice(at, 1)[0];
    const startTick = state.tick + Math.round(dayTicks * (windowStart + rngNext(state) * (windowEnd - windowStart)));
    state.eventSchedule.push({ kind, startTick });
  }
  state.eventSchedule.sort((a, b) => a.startTick - b.startTick);
  return state;
}

/** The inspector's verdict: four or more drinks thrown away today, or a dirty floor, is one fine. */
export function judgeInspection(state: GameState): void {
  const { wastedLimit, fine } = ECONOMY.events.inspector;
  const failed = (state.today.wasted ?? 0) >= wastedLimit || state.cleanliness < ECONOMY.mess.inspectorMin;
  if (failed) {
    tally(state.today, 'fines', fine);
    state.cash = Math.round((state.cash - fine) * 100) / 100;
  }
  state.today.inspection = failed ? 'fail' : 'pass';
  emitLog(state, 'inspection', { result: state.today.inspection });
}

export function eventActive(state: GameState, kind: EventKind): boolean {
  return state.events.some((e) => e.kind === kind);
}

/** Start due events (doors open only), then count every active event down and retire the finished. */
export function stepEvents(state: GameState, doorsOpen: boolean): GameState {
  if (doorsOpen) {
    const due = state.eventSchedule.filter((e) => e.startTick <= state.tick);
    state.eventSchedule = state.eventSchedule.filter((e) => e.startTick > state.tick);
    for (const e of due) {
      state.today.events = [...(state.today.events ?? []), e.kind];
      emitLog(state, 'event.start', { kind: e.kind });
      if (e.kind === 'influencerVisit') {
        const customer = spawnInfluencer(state);
        if (customer) state.events.push({ kind: e.kind, ticksLeft: customer.patienceMax, customerId: customer.id });
        else emitLog(state, 'event.end', { kind: e.kind });
      } else {
        state.events.push({ kind: e.kind, ticksLeft: durationTicks(e.kind) });
      }
    }
  }
  for (const e of state.events) e.ticksLeft -= 1;
  const over = (e: ActiveEvent) =>
    e.ticksLeft <= 0 || (e.kind === 'influencerVisit' && !state.customers.some((c) => c.id === e.customerId));
  const ended = state.events.filter(over);
  state.events = state.events.filter((e) => !over(e));
  for (const e of ended) {
    if (e.kind === 'healthInspector') judgeInspection(state);
    emitLog(state, 'event.end', { kind: e.kind });
  }
  return state;
}
