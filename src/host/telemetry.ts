import { zeroDrinks } from '../sim/tally';
import type { HostToClient, Transport } from '../net/transport';
import { isBot } from '../sim/bots/roster';
import { validateInput } from '../sim/validate';
import type { DayStats, DrinkId, EventKind, GameState, Phase, PlayerInput } from '../sim/types';
import type { ForecastId } from '../data/forecasts';
import { awardsFor } from '../sim/awards';
import { scoreRun } from '../sim/score';

/**
 * The host's in-memory record of a run: validated inputs, phase-boundary snapshots, the
 * sim's own log, peers' UI events, and an end-of-run summary. Nothing is uploaded; the
 * rows can be downloaded as newline-delimited JSON.
 */

export interface TelemetryMeta { host: string; build: string; protocol: number }
export interface TelemetryRow { kind: string; at: number; tick?: number; data: unknown }
export interface TeleEvent { kind: string; data: unknown; at: number }
export interface TelemetrySummary {
  days: DayStats[]; drinks: Record<DrinkId, number>;
  cards: { day: number; offered: string[]; bought: string[]; rerolls: number }[];
  /** B11: balance telemetry. Each played day's forecast and challenges (dealt / won). */
  forecasts: { day: number; forecast: ForecastId }[];
  challenges: { day: number; dealt: string[]; won: string[] }[];
  /** Easter eggs seen this run, by log kind (egg.cat, egg.camper, ...). */
  eggs: Record<string, number>;
  /** Award ids and winners at the time of the summary, and the run's score. */
  awards: { id: string; winner: string }[];
  score: number;
  idleTicks: Record<string, number>; botMistakes: Record<string, number>;
  events: { day: number; events: EventKind[] }[];
  pass: { put: number; take: number; serve: number; stale: number };
}
export interface Telemetry {
  record(kind: string, data: unknown, tick?: number): void;
  input(input: PlayerInput): void;
  snapshot(state: GameState): void;
  peerEvents(token: string, events: TeleEvent[]): void;
  ui(kind: string, data?: unknown): void;
  summary(state: GameState): TelemetrySummary;
  toNdjson(): string;
  rows(): TelemetryRow[];
  download(filename?: string): void;
}

declare global {
  interface Window {
    cafetycoon?: {
      /** Build version from package.json. */
      version?: string;
      telemetry: { download(): void; rows(): TelemetryRow[] };
      /** Read-only peek for playtests and smoke scripts: the latest snapshot and who this tab plays. */
      peek?: { state(): unknown; me(): string | null };
    };
  }
}

/** Row kinds only the host may write (its own rows and the sim's log); a peer's tele events using one are rejected. */
export const RESERVED_TELE_KINDS: readonly string[] = [
  'meta', 'snapshot', 'summary', 'input', 'input.mash', 'peer.join', 'peer.leave',
  'pass.put', 'pass.take', 'pass.serve', 'pass.stale', 'trash', 'bot.mistake', 'event.start', 'event.end', 'inspection', 'influencer',
  'drop', 'slip', 'clean', 'rogue.upset', 'rogue.remade', 'rogue.made', 'rogue.stormed', 'served',
];

const MASH_COUNT = 4;
const MASH_WINDOW_MS = 1000;
const UI_BUFFER_CAP = 200;

const defaultNow = () => performance.now();

/** Browser-only: build a Blob and click a temporary download link. Touches `document` only when called. */
function saveInBrowser(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/x-ndjson' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function metaRow(state: GameState, meta: TelemetryMeta): TelemetryRow {
  const players = state.players.filter((p) => !isBot(p)).map((p) => p.name);
  return { kind: 'meta', at: 0, data: { seed: state.seed, scenario: state.scenario, host: meta.host, players, build: meta.build, protocol: meta.protocol } };
}

/** Returns true when this interact is a player's 4th inside the rolling window (and restarts it). */
function createMashTracker() {
  const recent = new Map<string, number[]>();
  return (player: string, at: number): boolean => {
    const times = (recent.get(player) ?? []).filter((t) => at - t < MASH_WINDOW_MS);
    times.push(at);
    if (times.length >= MASH_COUNT) {
      recent.set(player, []);
      return true;
    }
    recent.set(player, times);
    return false;
  };
}

/** Days for the summary: finished days, plus today while it is still being played. */
function summaryDays(state: GameState): DayStats[] {
  const inProgress = (state.phase === 'day' || state.phase === 'closing') && !state.days.some((d) => d.day === state.today.day);
  return inProgress ? [...state.days, state.today] : [...state.days];
}

type NightCards = { offered: string[]; bought: string[]; rerolls: number };
type DayDeal = { forecast: ForecastId; dealt: string[] };

function buildSummary(state: GameState, rows: TelemetryRow[], cards: Map<number, NightCards>, deals: Map<number, DayDeal>): TelemetrySummary {
  const days = summaryDays(state);
  const drinks: Record<DrinkId, number> = zeroDrinks();
  for (const d of days) for (const k of Object.keys(drinks) as DrinkId[]) drinks[k] += d.drinks?.[k] ?? 0;
  const idleTicks: Record<string, number> = {};
  const botMistakes: Record<string, number> = {};
  for (const p of state.players) {
    idleTicks[p.name] = p.idleTicks;
    if (p.bot) botMistakes[p.name] = p.bot.mistakes;
  }
  const pass = { put: 0, take: 0, serve: 0, stale: 0 };
  const eggs: Record<string, number> = {};
  for (const r of rows) {
    if (r.kind.startsWith('egg.')) eggs[r.kind] = (eggs[r.kind] ?? 0) + 1;
    const key = r.kind.startsWith('pass.') ? (r.kind.slice(5) as keyof typeof pass) : null;
    if (key && key in pass) pass[key] += 1;
  }
  return {
    days,
    drinks,
    cards: [...cards.entries()].sort((a, b) => a[0] - b[0]).map(([day, c]) => ({ day, offered: [...c.offered], bought: [...c.bought], rerolls: c.rerolls })),
    forecasts: [...deals.entries()].sort((a, b) => a[0] - b[0]).map(([day, d]) => ({ day, forecast: d.forecast })),
    challenges: [...deals.entries()].sort((a, b) => a[0] - b[0]).map(([day, d]) => ({
      day,
      dealt: [...d.dealt],
      won: [...(days.find((x) => x.day === day)?.challengesWon ?? [])],
    })),
    eggs,
    awards: state.days.length ? awardsFor(state).map((a) => ({ id: a.id, winner: a.winner })) : [],
    score: scoreRun(state),
    idleTicks,
    botMistakes,
    events: days.map((d) => ({ day: d.day, events: [...(d.events ?? [])] })),
    pass,
  };
}

const toNdjson = (rows: TelemetryRow[]) => rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');

const asObject = (data: unknown): Record<string, unknown> =>
  data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : data === undefined ? {} : { value: data };

export function createTelemetry(
  meta: TelemetryMeta,
  deps: { now?: () => number; save?: (filename: string, text: string) => void } = {},
): Telemetry {
  const now = deps.now ?? defaultNow;
  const save = deps.save ?? saveInBrowser;
  const start = now();
  const at = () => now() - start;
  const rows: TelemetryRow[] = [];
  const cards = new Map<number, NightCards>();
  const deals = new Map<number, DayDeal>();
  const isMash = createMashTracker();
  let seed: number | null = null;
  let lastTick: number | undefined;
  let lastPhase: Phase | null = null;
  let lastSeq = 0;
  let summarized = false;
  let weekSummarized = false;

  const record = (kind: string, data: unknown, tick?: number) => {
    rows.push(tick === undefined ? { kind, at: at(), data } : { kind, at: at(), tick, data });
  };

  const tele: Telemetry = {
    record,
    input(raw) {
      const input = validateInput(raw);
      if (!input) return;
      record('input', input, lastTick);
      if (input.kind === 'join') record('peer.join', { player: input.playerId, name: input.name }, lastTick);
      if (input.kind === 'leave') record('peer.leave', { player: input.playerId }, lastTick);
      if (input.kind === 'move' && input.interact && isMash(input.playerId, now())) {
        record('input.mash', { player: input.playerId, count: MASH_COUNT }, lastTick);
      }
    },
    snapshot(state) {
      lastTick = state.tick;
      if (seed === null) {
        seed = state.seed;
        rows.unshift({ ...metaRow(state, meta), at: at() });
      }
      if (state.phase !== lastPhase) {
        lastPhase = state.phase;
        // The log is already recorded row by row below; keep it out of snapshots so files stay small.
        const { log: _log, ...rest } = state;
        record('snapshot', structuredClone(rest), state.tick);
      }
      for (const e of state.log) {
        if (e.seq <= lastSeq) continue;
        lastSeq = e.seq;
        record(e.kind, { ...e.data }, e.tick);
      }
      if (state.phase === 'night') {
        const offered = [...new Set([...state.hand, ...state.boughtTonight])];
        cards.set(state.day, { offered, bought: [...state.boughtTonight], rerolls: state.rerolls ?? 0 });
      }
      if (state.phase === 'day' && !deals.has(state.day)) {
        deals.set(state.day, { forecast: state.forecast, dealt: (state.challenges ?? []).map((c) => c.id) });
      }
      // A summary at the scored week's end and again when the run ends; the last one is authoritative.
      if (state.phase === 'weekEnd' && !weekSummarized) {
        weekSummarized = true;
        record('summary', tele.summary(state), state.tick);
      }
      if (state.phase === 'ended' && !summarized) {
        summarized = true;
        record('summary', tele.summary(state), state.tick);
      }
    },
    peerEvents(token, events) {
      for (const e of events) record(e.kind, { ...asObject(e.data), from: token }, lastTick);
    },
    ui(kind, data) {
      record(kind, data ?? {}, lastTick);
    },
    summary: (state) => buildSummary(state, rows, cards, deals),
    toNdjson: () => toNdjson(rows),
    rows: () => rows,
    download(filename) {
      const date = new Date().toISOString().slice(0, 10);
      save(filename ?? `cafetycoon-${seed ?? 'run'}-${date}.ndjson`, toNdjson(rows));
    },
  };
  return tele;
}

/** A Transport that records every input it forwards and every snapshot it receives. */
export function withTelemetry(inner: Transport, tele: Telemetry): Transport {
  const unsubscribe = inner.onSnapshot((snap: HostToClient) => tele.snapshot(snap.state));
  return {
    start: (opts) => inner.start(opts),
    resume: (state) => inner.resume(state),
    sendInput(input) {
      tele.input(input);
      inner.sendInput(input);
    },
    onSnapshot: (handler) => inner.onSnapshot(handler),
    onError: (handler) => inner.onError(handler),
    close() {
      unsubscribe();
      inner.close();
    },
  };
}

/** A peer's buffer of UI events waiting to be sent to the host (newest 200 kept). */
export function createUiBuffer(now: () => number = defaultNow): { push(kind: string, data?: unknown): void; drain(): TeleEvent[] } {
  let buf: TeleEvent[] = [];
  return {
    push(kind, data) {
      buf.push({ kind, data: data ?? {}, at: now() });
      if (buf.length > UI_BUFFER_CAP) buf.splice(0, buf.length - UI_BUFFER_CAP);
    },
    drain() {
      const out = buf;
      buf = [];
      return out;
    },
  };
}

let uiSink: ((kind: string, data: unknown) => void) | null = null;

/** UI code reports through this; it does nothing until a sink is set. */
export const uiTelemetry = {
  ui(kind: string, data?: unknown): void {
    uiSink?.(kind, data);
  },
};

export function setUiTelemetrySink(fn: ((kind: string, data: unknown) => void) | null): void {
  uiSink = fn;
}
