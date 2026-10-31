/**
 * ui-3.7.1: sim log events that pop up as a toast, read once each by `seq` (the gear.quirk pattern in main.ts).
 * Pure, so the lines can be tested without the DOM.
 */
import { DRINK_INFO } from '../data/drinks';
import type { DrinkId, GameState, PlayerId, SimEvent } from '../sim/types';
import { rushToast } from './dayRestock';

/** Events after `seen` of the given kinds, and the new `seen` (a fresh run restarts the log, so `seen` resets). */
export function freshEvents(state: Pick<GameState, 'log' | 'nextLogSeq'>, seen: number, kinds: readonly SimEvent['kind'][]): { events: SimEvent[]; seen: number } {
  const from = state.nextLogSeq <= seen ? -1 : seen;
  const events = state.log.filter((e) => e.seq > from && kinds.includes(e.kind));
  const last = state.log.length ? state.log[state.log.length - 1].seq : from;
  return { events, seen: Math.max(from, last) };
}

/** "🧠 Your Strategist added Latte to the menu" / "🧠 Your Strategist took Mocha off the menu". */
export function strategistMenuLine(e: Pick<SimEvent, 'data'>): string {
  const d = e.data as { drink?: DrinkId; on?: boolean };
  const name = (d.drink && DRINK_INFO[d.drink]?.name) || 'a drink';
  return d.on ? `🧠 Your Strategist added ${name} to the menu` : `🧠 Your Strategist took ${name} off the menu`;
}

const MAX_LINES = 4;

/** FB2 C10: the layout went back to the default after a grow or a gear change. */
export function stationResetLine(): string {
  return 'Bar layout went back to the default';
}

/** FB2 C10: a short note when a machine lands on a new spot. */
export function stationPlaceLine(e: Pick<SimEvent, 'data'>, nameOf: (id: PlayerId) => string): string {
  const d = e.data as { by?: PlayerId; station?: string; swapped?: boolean };
  const who = d.by ? nameOf(d.by) : 'Someone';
  return d.swapped ? `${who} swapped a machine` : `${who} moved a machine`;
}

/** The toast lines for the fresh toast kinds (at most four, then "and N more"). */
export function logToastLines(events: readonly SimEvent[], nameOf: (id: PlayerId) => string, me?: PlayerId): string[] {
  const lines = events.flatMap((e) => {
    if (e.kind === 'restock.rush') return [rushToast(e, nameOf, me)];
    if (e.kind === 'strategist.menu') return [strategistMenuLine(e)];
    if (e.kind === 'station.reset') return [stationResetLine()];
    if (e.kind === 'station.place') return [stationPlaceLine(e, nameOf)];
    return [];
  });
  if (lines.length <= MAX_LINES) return lines;
  return [...lines.slice(0, MAX_LINES - 1), `…and ${lines.length - (MAX_LINES - 1)} more changes`];
}

export const TOAST_KINDS = ['restock.rush', 'strategist.menu', 'station.reset', 'station.place'] as const satisfies readonly SimEvent['kind'][];
