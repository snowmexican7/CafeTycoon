import { ECONOMY } from '../data/economy';
import { secondsToTicks } from './constants';
import { emitLog } from './log';
import { rngInt, rngNext } from './rng';
import type { EventKind, GameState } from './types';

export const EVENT_LABELS: Record<EventKind, string> = {
  rushHour: 'Rush hour',
  powerFlicker: 'Power flicker',
  influencerVisit: 'Influencer visiting',
  healthInspector: 'Health inspector',
};

const ALL_KINDS: EventKind[] = ['rushHour', 'powerFlicker', 'influencerVisit', 'healthInspector'];

/** How long an event stays active, in ticks. The influencer has no timer yet (Task 5). */
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
  for (let i = 0; i < count; i++) {
    const kind = remaining.splice(rngInt(state, remaining.length), 1)[0];
    const startTick = state.tick + Math.round(dayTicks * (windowStart + rngNext(state) * (windowEnd - windowStart)));
    state.eventSchedule.push({ kind, startTick });
  }
  state.eventSchedule.sort((a, b) => a.startTick - b.startTick);
  return state;
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
        // Task 5 replaces this branch with the influencer customer; for now it begins and ends at once.
        emitLog(state, 'event.end', { kind: e.kind });
      } else {
        state.events.push({ kind: e.kind, ticksLeft: durationTicks(e.kind) });
      }
    }
  }
  for (const e of state.events) e.ticksLeft -= 1;
  const ended = state.events.filter((e) => e.ticksLeft <= 0);
  state.events = state.events.filter((e) => e.ticksLeft > 0);
  for (const e of ended) emitLog(state, 'event.end', { kind: e.kind });
  return state;
}
