/**
 * Crew stats for the week (B10): per-player counters tallied from the sim log every tick, before the
 * log is pruned. Plain data in GameState (`state.crew`), so peers get it in the snapshot and the
 * end-of-week awards (src/sim/awards.ts) are derived from it, deterministic for a seed and inputs.
 */
import type { GameState, PlayerId, SimEvent } from './types';

export interface PlayerStats {
  id: PlayerId;
  name: string;
  bot: boolean;
  /** Customers paid (by this player's hand, at the pass or straight to the counter). */
  serves: number;
  /** Served with lots of patience left. */
  perfect: number;
  /** Money brought in by their serves (price + tip). */
  earned: number;
  /** Drinks put on the pass for someone else to hand over. */
  handoffs: number;
  slips: number;
  /** Floor messes they caused: dropped on the floor, spilled in a slip or a bot fumble. */
  messes: number;
  /** Messes they mopped up. */
  mopped: number;
  espressos: number;
  collapses: number;
  /** Upset customers or name mix-ups sorted out. */
  rescues: number;
  catPets: number;
  campersShooed: number;
  alarmsStopped: number;
  binned: number;
  cardsBought: number;
  rerolls: number;
  /** Ticks standing still (people only), copied from the player at each tally. */
  idle: number;
}

export interface CrewStats {
  /** The next log seq to count, so each entry is tallied once. */
  seen: number;
  players: PlayerStats[];
}

export type CountKey = Exclude<keyof PlayerStats, 'id' | 'name' | 'bot'>;

export const COUNT_KEYS: CountKey[] = [
  'serves', 'perfect', 'earned', 'handoffs', 'slips', 'messes', 'mopped', 'espressos', 'collapses',
  'rescues', 'catPets', 'campersShooed', 'alarmsStopped', 'binned', 'cardsBought', 'rerolls', 'idle',
];

export function blank(id: PlayerId, name: string, bot: boolean): PlayerStats {
  const s = { id, name, bot } as PlayerStats;
  for (const k of COUNT_KEYS) s[k] = 0;
  return s;
}

export function crewOf(state: GameState): CrewStats {
  return (state.crew ??= { seen: 0, players: [] });
}

/** The stats row for a player, created on first use (players order of first appearance). */
export function statsFor(state: GameState, id: PlayerId): PlayerStats | null {
  if (!id) return null;
  const crew = crewOf(state);
  let row = crew.players.find((r) => r.id === id);
  if (!row) {
    const p = state.players.find((x) => x.id === id);
    if (!p) return null;
    row = blank(id, p.name, !!p.bot);
    crew.players.push(row);
  }
  return row;
}

function bump(state: GameState, id: unknown, key: CountKey, by = 1): void {
  const row = typeof id === 'string' ? statsFor(state, id) : null;
  if (row) row[key] = Math.round((row[key] + by) * 100) / 100;
}

function count(state: GameState, e: SimEvent): void {
  const d = e.data;
  switch (e.kind) {
    case 'served':
      bump(state, d.by, 'serves');
      if (d.perfect === true) bump(state, d.by, 'perfect');
      if (typeof d.amount === 'number') bump(state, d.by, 'earned', d.amount);
      break;
    case 'pass.put':
      bump(state, d.by, 'handoffs');
      break;
    case 'slip':
      bump(state, d.player, 'slips');
      if (d.item !== undefined) bump(state, d.player, 'messes');
      break;
    case 'drop':
      if (d.x !== undefined && d.item !== 'mop') bump(state, d.by, 'messes');
      else if (d.station !== undefined && String(d.station).startsWith('trash')) bump(state, d.by, 'binned');
      break;
    case 'trash':
      bump(state, d.by, 'binned');
      break;
    case 'clean':
      bump(state, d.player, 'mopped');
      break;
    case 'espresso.shot':
      bump(state, d.by, 'espressos');
      break;
    case 'espresso.collapse':
      bump(state, d.by, 'collapses');
      break;
    case 'rogue.remade':
      bump(state, d.by, 'rescues');
      break;
    case 'egg.nameMix':
      if (d.fixed) bump(state, d.by, 'rescues');
      break;
    case 'egg.cat':
      if (d.pet) bump(state, d.by, 'catPets');
      break;
    case 'egg.camper':
      if (d.kicked) bump(state, d.by, 'campersShooed');
      break;
    case 'egg.smoke':
      if (d.cleared) bump(state, d.by, 'alarmsStopped');
      break;
    default:
      break;
  }
}

/** Count every new log entry once, and copy idle time across. Call once per tick, before pruneLog. */
export function tallyStats(state: GameState): void {
  const crew = crewOf(state);
  for (const e of state.log) {
    if (e.seq < crew.seen) continue;
    count(state, e);
  }
  crew.seen = state.nextLogSeq;
  for (const p of state.players) {
    if (p.bot || p.idleTicks === 0) continue;
    const row = statsFor(state, p.id);
    if (row) row.idle = p.idleTicks;
  }
}

/** A night purchase or re-roll, credited to whoever clicked it. */
export function noteNight(state: GameState, id: PlayerId, key: 'cardsBought' | 'rerolls'): void {
  bump(state, id, key);
}

/** Read-only stats rows for the awards: everyone at the table now (zeros if they never did anything) plus anyone who left after serving. */
export function crewRows(state: GameState): PlayerStats[] {
  const rows = state.crew?.players ?? [];
  const out = state.players.map((p) => rows.find((r) => r.id === p.id) ?? blank(p.id, p.name, !!p.bot));
  for (const r of rows) if (r.serves > 0 && !out.includes(r)) out.push(r);
  return out;
}
