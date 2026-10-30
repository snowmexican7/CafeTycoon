import { GEAR } from '../data/gear';
import { SINK_ID } from '../data/layout';
import { coolTicks, heldCool, stationCool } from '../sim/cooling';
import { needsDump, potCold, potMachine } from '../sim/sink';
import { DRINK_INFO } from '../data/drinks';
import type { DrinkId, GameState, Player, SimEvent, Station } from '../sim/types';

/**
 * FB2 A3 (3.3.3): the pure half of the back sink and the drip pots that go to it. No Pixi here, so it is
 * unit-tested; src/render/layers/sink.ts draws from it and src/ui/live.ts reads the same rules for the hints.
 */

export type PotTone = 'stale' | 'cold' | 'out';
export interface PotBadge { tone: PotTone; text: string }

/**
 * The badge over a drip machine whose pot needs the sink: "STALE: dump at sink" (yesterday's pot,
 * `Station.stale`), "COLD: dump at sink" (past `potColdAt` with cups left), or "POT OUT · Ada" while someone
 * carries it (`Station.potOut`). Null for a fine pot, a pour-over bar, an urn and classic runs.
 */
export function potBadge(state: Pick<GameState, 'gear' | 'tick' | 'players'>, st: Station): PotBadge | null {
  if (state.gear !== true || !potMachine(st)) return null;
  if (st.potOut !== undefined) {
    const who = state.players.find((p) => p.id === st.potOut)?.name;
    return { tone: 'out', text: who ? `POT OUT · ${who}` : 'POT OUT' };
  }
  if (st.stale === true) return { tone: 'stale', text: 'STALE: dump at sink' };
  if (potCold(state as GameState, st)) return { tone: 'cold', text: 'COLD: dump at sink' };
  return null;
}

export type CarafeTone = 'fresh' | 'cold' | 'stale' | 'empty' | 'brewing';
export interface CarafeLook {
  /** False while the pot is out (the hot plate shows empty). */
  show: boolean;
  /** 0..1 how full the glass is. */
  fill: number;
  tone: CarafeTone;
}

/** How full a carried pot (or a returned stale one) is drawn: the sim drops the cup count when it's lifted. */
export const CARRIED_FILL = 0.45;

/** How the carafe on a drip machine looks this frame: gone while carried, filling while brewing, tinted cold or stale. */
export function carafeLook(state: Pick<GameState, 'gear' | 'tick' | 'players'>, st: Station): CarafeLook {
  const cups = st.gear ? (GEAR[st.gear].pot?.cups ?? 0) : 0;
  if (st.potOut !== undefined) return { show: false, fill: 0, tone: 'empty' };
  if (st.busyTicksLeft > 0) {
    const total = st.busyTotal ?? 0;
    return { show: true, fill: total > 0 ? Math.max(0.05, Math.min(1, 1 - st.busyTicksLeft / total)) : 0.5, tone: 'brewing' };
  }
  const left = st.potLeft ?? 0;
  // a pot carried back undumped has no cup count any more (lifting clears it), but it's still old coffee
  if (st.stale === true) return { show: true, fill: left > 0 && cups > 0 ? Math.max(0.12, Math.min(1, left / cups)) : CARRIED_FILL, tone: 'stale' };
  if (left <= 0 || cups <= 0) return { show: true, fill: 0, tone: 'empty' };
  const fill = Math.max(0.12, Math.min(1, left / cups));
  if (potCold(state as GameState, st)) return { show: true, fill, tone: 'cold' };
  return { show: true, fill, tone: 'fresh' };
}

/** True when the cup in this player's hands has gone cold (A2 `heldCool` at 1). Iced drinks never do. */
export function heldIsCold(state: GameState, p: Player): boolean {
  return p.holding !== null && p.tool === null && coolTicks(p.holding) !== null && heldCool(state, p) >= 1;
}

/** 0..1 freshness (1 = just made) of a hot cup in hand, or null when it has no clock (iced, grounds, empty hands). */
export function heldFreshness(state: GameState, p: Player): number | null {
  if (state.gear !== true || p.holding === null || p.tool !== null || p.heldSince === undefined || coolTicks(p.holding) === null) return null;
  return 1 - heldCool(state, p);
}

/**
 * 0..1 freshness (1 = just made) of what waits at a machine, by the A2 clock: a pulled shot, steamed milk, a
 * finished drink sitting at the station (`Station.outputSince`). A drip pot uses its own hot-plate timer. Null
 * when there is no clock (iced, grounds, old saves).
 */
export function outputFreshness(state: GameState, st: Station): number | null {
  if (state.gear !== true) return null;
  if (st.potLeft !== undefined) return null; // the drip pot keeps its own ring (countsModel.potCool)
  if (st.output === null || st.outputSince === undefined || coolTicks(st.output) === null) return null;
  return 1 - stationCool(state, st);
}

/** Does this station need the sink right now (the hint and the badge agree with the sim's `needsDump`). */
export const potNeedsDump = (state: GameState, st: Station): boolean => needsDump(state, st);

/** A one-line toast for a sink, pot or leak event, or null when the event needs none. `me` words it as "You". */
export function sinkToast(e: Pick<SimEvent, 'kind' | 'data'>, names: (id: string) => string, me: string | null): string | null {
  const who = (id: unknown) => (String(id) === me ? 'You' : names(String(id)));
  switch (e.kind) {
    case 'sink.dump':
      return e.data.item === 'pot' ? `${who(e.data.by)} dumped the old pot: ready to brew` : null;
    case 'pot.stale':
      return "Yesterday's drip pot is stale: dump it at the sink";
    case 'bin.leak':
      return 'The bin bag leaked! Grab the mop';
    case 'pickup.cold':
      return `Cold ${DRINK_INFO[e.data.drink as DrinkId]?.short.toLowerCase() ?? 'cup'} picked up: no pay`;
    default:
      return null;
  }
}

/** The sink's id, re-exported for the scene. */
export { SINK_ID };
