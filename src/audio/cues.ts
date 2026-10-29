import { TICK_RATE } from '../sim/constants';
import type { EventKind, GameState, PlayerId, StationKind } from '../sim/types';

/**
 * Every sound the game can make. Audio is purely client-side: cues are derived by diffing two
 * snapshots this client already received, so nothing here can touch the sim, co-op sync or the seed.
 */
export type CueId =
  | 'grinder'
  | 'espresso'
  | 'steam'
  | 'pour'
  | 'stationReady'
  | 'cupDown'
  | 'pickUp'
  | 'serve'
  | 'doorBell'
  | 'stormOut'
  | 'turnedAway'
  | 'trash'
  | 'botOops'
  | 'buy'
  | 'restock'
  | 'dayStart'
  | 'dayEnd'
  | 'weekEnd'
  | 'gameOver'
  | 'rushHour'
  | 'powerFlicker'
  | 'inspector'
  | 'influencer'
  | 'inspectPass'
  | 'inspectFail'
  | 'influencerServed'
  | 'click';

export interface Cue {
  id: CueId;
  /** Seconds the sound should last (station sounds follow the station's real busy time). */
  dur?: number;
  /** The local player caused it; played a little louder. */
  mine?: boolean;
}

export const STATION_CUE: Partial<Record<StationKind, CueId>> = {
  grinder: 'grinder',
  espresso: 'espresso',
  steamer: 'steam',
  coldBrewTap: 'pour',
};

export const EVENT_CUE: Record<EventKind, CueId> = {
  rushHour: 'rushHour',
  powerFlicker: 'powerFlicker',
  healthInspector: 'inspector',
  influencerVisit: 'influencer',
};

/** Longest a station loop may run, so a slowed station can't drone forever. */
export const MAX_STATION_SEC = 8;

/** How far the log has been read; seq numbers only grow within a run. */
export function logCursor(state: GameState): number {
  return state.nextLogSeq - 1;
}

const owed = (s: GameState) => s.customers.reduce((n, c) => n + 1 + (c.extra?.length ?? 0), 0);

/**
 * The sounds that happened between two snapshots. `lastSeq` is the highest log seq already voiced,
 * so a log entry that stays in state for several snapshots still sounds once.
 */
export function diffCues(prev: GameState | null, next: GameState, me: PlayerId, lastSeq: number): { cues: Cue[]; lastSeq: number } {
  // First snapshot of a run (or a different run): start listening from here, play nothing old.
  if (!prev || prev.seed !== next.seed || next.nextLogSeq - 1 < lastSeq) return { cues: [], lastSeq: logCursor(next) };
  const cues: Cue[] = [];

  if (prev.phase !== next.phase) {
    if (next.phase === 'day') cues.push({ id: 'dayStart' });
    else if (next.phase === 'closing') cues.push({ id: 'dayEnd' });
    else if (next.phase === 'weekEnd') cues.push({ id: 'weekEnd' });
    else if (next.phase === 'ended') cues.push({ id: next.bankrupt ? 'gameOver' : 'weekEnd' });
  }

  const before = new Map(prev.stations.map((s) => [s.id, s]));
  for (const s of next.stations) {
    const was = before.get(s.id);
    const cue = STATION_CUE[s.kind];
    if (!was || !cue) continue;
    if (was.busyTicksLeft === 0 && s.busyTicksLeft > 0) cues.push({ id: cue, dur: Math.min(MAX_STATION_SEC, s.busyTicksLeft / TICK_RATE) });
    else if (was.output === null && s.output !== null && s.busyTicksLeft === 0) cues.push({ id: 'stationReady' });
  }

  for (const e of next.log) {
    if (e.seq <= lastSeq) continue;
    const mine = e.data.by === me;
    switch (e.kind) {
      case 'pass.put': cues.push({ id: 'cupDown', mine }); break;
      case 'pass.take': cues.push({ id: 'pickUp', mine }); break;
      case 'pass.serve': cues.push({ id: 'serve', mine }); break;
      case 'trash': cues.push({ id: 'trash', mine }); break;
      case 'bot.mistake': cues.push({ id: 'botOops' }); break;
      case 'event.start': {
        const cue = EVENT_CUE[e.data.kind as EventKind];
        if (cue) cues.push({ id: cue });
        break;
      }
      case 'inspection': cues.push({ id: e.data.result === 'pass' ? 'inspectPass' : 'inspectFail' }); break;
      case 'influencer': if (e.data.result === 'served') cues.push({ id: 'influencerServed' }); break;
      default: break;
    }
  }

  const sameDay = prev.day === next.day && prev.phase !== 'night';
  if (next.phase === 'day' || next.phase === 'closing') {
    const known = new Set(prev.customers.map((c) => c.id));
    if (next.customers.some((c) => !known.has(c.id))) cues.push({ id: 'doorBell' });
    if (sameDay && next.today.lost > prev.today.lost) cues.push({ id: 'stormOut' });
    if (sameDay && next.today.turnedAway > prev.today.turnedAway) cues.push({ id: 'turnedAway' });
  }

  if (next.phase === 'night' && prev.phase === 'night') {
    if (next.boughtTonight.length > prev.boughtTonight.length) cues.push({ id: 'buy' });
    const restocked = (Object.keys(next.supplies) as (keyof GameState['supplies'])[]).some((k) => next.supplies[k] > prev.supplies[k]);
    if (restocked) cues.push({ id: 'restock' });
  }

  return { cues, lastSeq: Math.max(lastSeq, logCursor(next)) };
}

export type MusicMode = 'day' | 'night';

/** The continuous layers: which music loop, how busy the room sounds, and whether the power is out. */
export interface Ambience {
  music: MusicMode;
  /** 0 = empty room, 1 = full queue. */
  crowd: number;
  powerOut: boolean;
}

/** Drinks owed at which the room sounds as busy as it gets. */
export const CROWD_FULL = 8;

export function ambienceFor(state: GameState | null): Ambience {
  if (!state) return { music: 'night', crowd: 0, powerOut: false };
  const open = state.phase === 'day' || state.phase === 'closing';
  return {
    music: state.phase === 'day' ? 'day' : 'night',
    crowd: open ? Math.min(1, owed(state) / CROWD_FULL) : 0,
    powerOut: open && state.events.some((e) => e.kind === 'powerFlicker'),
  };
}
