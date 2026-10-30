import { TICK_RATE } from '../sim/constants';
import { callRinging } from '../sim/call';
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
  | 'gulp'
  | 'heartbeat'
  | 'collapse'
  | 'click'
  | 'slip'
  | 'splash'
  | 'scatter'
  | 'mopGrab'
  | 'mopDown'
  | 'squeak'
  | 'rogueSneak'
  | 'rogueUpset'
  | 'rogueSaved'
  | 'rogueMade'
  | 'rogueStorm'
  | 'doorSlam'
  | 'buzz'
  | 'eggMeow'
  | 'eggSmoke'
  | 'eggReview'
  | 'eggSecret'
  | 'eggCamper'
  | 'eggNameMix'
  | 'phoneRing';

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

/** Ticks between ballast buzzes while the power is out. */
export const BUZZ_TICKS = 48;

/** Seconds between phone rings while the second shop's call is waiting (P6). */
export const RING_EVERY_SEC = 3;

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
      case 'espresso.shot': cues.push({ id: 'gulp', mine }); break;
      case 'espresso.collapse': cues.push({ id: 'collapse', mine }); break;
      case 'slip': cues.push({ id: 'slip', mine: e.data.player === me }); break;
      case 'drop':
        if (e.data.item === 'mop') cues.push({ id: 'mopDown' });
        else if (e.data.x !== undefined) cues.push({ id: e.data.item === 'grounds' ? 'scatter' : 'splash' });
        break;
      case 'clean': cues.push({ id: 'squeak', mine: e.data.player === me }); break;
      case 'rogue.upset': cues.push({ id: 'rogueUpset' }); break;
      case 'rogue.remade': cues.push({ id: 'rogueSaved' }); break;
      case 'rogue.made': cues.push({ id: 'rogueMade' }); break;
      case 'rogue.stormed': cues.push({ id: 'rogueStorm' }); break;
      case 'egg.cat':
        if (!e.data.left) cues.push({ id: 'eggMeow', mine });
        break;
      case 'egg.smoke':
        cues.push({ id: e.data.cleared ? 'squeak' : 'eggSmoke', mine });
        break;
      case 'egg.latteArt': cues.push({ id: 'eggReview' }); break;
      case 'egg.secret': cues.push({ id: 'eggSecret', mine }); break;
      case 'egg.camper':
        if (!e.data.left) cues.push({ id: 'eggCamper' });
        break;
      case 'egg.nameMix':
        if (e.data.wrong || e.data.refuse) cues.push({ id: 'eggNameMix' });
        break;
      default: break;
    }
  }

  const sameDay = prev.day === next.day && prev.phase !== 'night';
  // the lights are out: the ballast keeps buzzing every ~0.8 s
  if (sameDay && next.events.some((e) => e.kind === 'powerFlicker') && Math.floor(prev.tick / BUZZ_TICKS) !== Math.floor(next.tick / BUZZ_TICKS)) cues.push({ id: 'buzz' });
  // chaos pack state changes: the mop picked up, a rogue appearing, the door slamming behind them
  // the second shop is on the phone: ring when it starts, then every few seconds until someone picks up
  const ring = callRinging(next);
  if (ring) {
    const was = sameDay ? callRinging(prev) : null;
    if (!was || Math.ceil(was.secsLeft / RING_EVERY_SEC) !== Math.ceil(ring.secsLeft / RING_EVERY_SEC)) cues.push({ id: 'phoneRing' });
  }
  if (prev.mop && next.mop && prev.mop.heldBy === null && next.mop.heldBy !== null) cues.push({ id: 'mopGrab', mine: next.mop.heldBy === me });
  const rogueStarted = !prev.rogue && !!next.rogue;
  if (rogueStarted) cues.push({ id: 'rogueSneak' });
  if (prev.rogue && !next.rogue && (prev.rogue.stage === 'leaving' || prev.rogue.stage === 'stormingOut')) cues.push({ id: 'doorSlam' });
  if (next.phase === 'day' || next.phase === 'closing') {
    const known = new Set(prev.customers.map((c) => c.id));
    if (next.customers.some((c) => !known.has(c.id))) cues.push({ id: 'doorBell' });
    // a customer going rogue counts as lost, but they don't storm out: they sneak in (rogueSneak)
    if (sameDay && next.today.lost > prev.today.lost && !rogueStarted) cues.push({ id: 'stormOut' });
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

/**
 * The espresso Easter egg's tell: from the 3rd shot today the local barista hears their own heart,
 * faster with every shot. Returns the gap between beats in ms, or null for no heartbeat.
 */
export function heartbeatGapMs(state: GameState | null, me: PlayerId): number | null {
  if (!state || (state.phase !== 'day' && state.phase !== 'closing')) return null;
  const e = state.players.find((p) => p.id === me)?.espresso;
  if (!e || e.out || e.boostTicksLeft <= 0 || e.shots < 3) return null;
  const bpm = [0, 0, 0, 96, 128, 168][Math.min(5, e.shots)];
  return 60000 / bpm;
}

/** Tick every frame; says when to play the next heartbeat. Starts with a beat right away. */
export function createHeartbeat() {
  let next = 0;
  return {
    tick(nowMs: number, gapMs: number | null): boolean {
      if (gapMs === null) {
        next = 0;
        return false;
      }
      if (next === 0 || nowMs >= next) {
        next = (next === 0 || nowMs - next > gapMs ? nowMs : next) + gapMs;
        return true;
      }
      // a faster heart takes over at once instead of waiting out the slow gap
      if (next - nowMs > gapMs) next = nowMs + gapMs;
      return false;
    },
  };
}
