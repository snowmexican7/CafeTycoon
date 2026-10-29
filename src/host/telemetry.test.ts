import { describe, it, expect, afterEach } from 'vitest';
import type { HostToClient, Transport } from '../net/transport';
import { createRun, freshDayStats, startDay } from '../sim/run';
import { makeBotState } from '../sim/bots/roster';
import type { GameState, PlayerInput, SimEvent } from '../sim/types';
import { createTelemetry, createUiBuffer, setUiTelemetrySink, uiTelemetry, withTelemetry } from './telemetry';

const META = { host: 'p1', build: 'test', protocol: 3 };
const run = (): GameState =>
  createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'Kay' }, { id: 'p2', name: 'Lu' }], settings: { bots: 0 } });

function setup() {
  const clock = { t: 0 };
  const saved: { filename: string; text: string }[] = [];
  const tele = createTelemetry(META, { now: () => clock.t, save: (filename, text) => saved.push({ filename, text }) });
  return { clock, saved, tele };
}

const kinds = (tele: ReturnType<typeof createTelemetry>) => tele.rows().map((r) => r.kind);
const logEntry = (seq: number, kind: SimEvent['kind'] = 'pass.put'): SimEvent => ({ seq, tick: seq * 10, kind, data: { item: 'latte' } });
const move = (playerId: string, interact: boolean): PlayerInput => ({ kind: 'move', playerId, x: 0, y: 0, interact });

describe('telemetry', () => {
  afterEach(() => setUiTelemetrySink(null));

  it('starts with a meta row and records phase-boundary snapshots once each', () => {
    const { tele } = setup();
    const s = run();
    s.players.push({ ...s.players[0], id: 'bot-1', name: 'Bo', bot: makeBotState('steady') });
    tele.input(move('p1', false));
    tele.snapshot(s);
    s.tick = 5;
    tele.snapshot(s);
    expect(kinds(tele)).toEqual(['meta', 'input', 'snapshot']);
    const meta = tele.rows()[0];
    expect(meta.data).toEqual({ seed: 7, scenario: s.scenario, host: 'p1', players: ['Kay', 'Lu'], build: 'test', protocol: 3 });
    startDay(s);
    s.tick = 9;
    tele.snapshot(s);
    tele.snapshot(s);
    const snaps = tele.rows().filter((r) => r.kind === 'snapshot');
    expect(snaps).toHaveLength(2);
    expect(snaps[1].tick).toBe(9);
    expect((snaps[1].data as GameState).phase).toBe('day');
    expect(kinds(tele).filter((k) => k === 'meta')).toHaveLength(1);
  });

  it('records validated inputs only, and peer joins', () => {
    const { tele } = setup();
    const s = run();
    s.tick = 42;
    tele.snapshot(s);
    tele.input({ kind: 'move', playerId: 'p1', x: NaN, y: 0.5, interact: false });
    tele.input({ kind: 'bogus', playerId: 'p1' } as unknown as PlayerInput);
    tele.input({ kind: 'join', playerId: 'p3', name: '  Mo  ' });
    tele.input({ kind: 'leave', playerId: 'p3' });
    const rows = tele.rows().slice(2);
    expect(rows.map((r) => r.kind)).toEqual(['input', 'input', 'peer.join', 'input', 'peer.leave']);
    expect(rows[0].data).toEqual({ kind: 'move', playerId: 'p1', x: 0, y: 0.5, interact: false });
    expect(rows[0].tick).toBe(42);
    expect(rows[2].data).toEqual({ player: 'p3', name: 'Mo' });
    expect(rows[4].data).toEqual({ player: 'p3' });
  });

  it('flags four interacts within a second as mashing', () => {
    const { clock, tele } = setup();
    for (const t of [0, 200, 400, 600]) {
      clock.t = t;
      tele.input(move('p1', true));
    }
    tele.input(move('p1', false));
    clock.t = 2000;
    tele.input(move('p1', true));
    const mash = tele.rows().filter((r) => r.kind === 'input.mash');
    expect(mash).toHaveLength(1);
    expect(mash[0].data).toEqual({ player: 'p1', count: 4 });
    expect(mash[0].at).toBe(600);
  });

  it('only counts interacts inside the rolling window, per player', () => {
    const { clock, tele } = setup();
    for (const t of [0, 400, 800, 1100, 1300]) {
      clock.t = t;
      tele.input(move('p1', true));
      tele.input(move('p2', t === 1300));
    }
    // p1: at 1100 the window holds 400, 800, 1100 (0 has expired); 1300 is the 4th → one mash.
    expect(tele.rows().filter((r) => r.kind === 'input.mash').map((r) => r.data)).toEqual([{ player: 'p1', count: 4 }]);
    clock.t = 1400;
    tele.input(move('p1', true)); // window restarted after the mash
    expect(tele.rows().filter((r) => r.kind === 'input.mash')).toHaveLength(1);
  });

  it('copies new sim log entries exactly once', () => {
    const { tele } = setup();
    const s = run();
    s.log = [logEntry(1), logEntry(2)];
    tele.snapshot(s);
    s.log = [logEntry(2), logEntry(3, 'bot.mistake')];
    tele.snapshot(s);
    const logged = tele.rows().filter((r) => r.kind === 'pass.put' || r.kind === 'bot.mistake');
    expect(logged.map((r) => [r.kind, r.tick])).toEqual([
      ['pass.put', 10],
      ['pass.put', 20],
      ['bot.mistake', 30],
    ]);
    expect(logged[0].data).toEqual({ item: 'latte' });
  });

  it('summarizes the run when it ends and serializes as ndjson', () => {
    const { tele } = setup();
    const s = run();
    tele.snapshot(s); // night 1
    s.hand = ['a', 'b'];
    s.boughtTonight = ['c'];
    tele.snapshot(s);
    s.log = [logEntry(1), logEntry(2), logEntry(3, 'pass.stale')];
    startDay(s);
    tele.snapshot(s);
    const d1 = { ...freshDayStats(1), served: 4, events: ['rushHour' as const], drinks: { espresso: 1, latte: 2, coldBrew: 0 } };
    const d2 = { ...freshDayStats(2), served: 3, drinks: { espresso: 0, latte: 1, coldBrew: 2 } };
    s.days = [d1, d2];
    s.players[1].idleTicks = 30;
    s.players.push({ ...s.players[0], id: 'bot-1', name: 'Bo', idleTicks: 0, bot: { ...makeBotState('steady'), mistakes: 2 } });
    s.phase = 'ended';
    tele.snapshot(s);
    tele.snapshot(s);

    const rows = tele.rows();
    expect(rows.filter((r) => r.kind === 'summary')).toHaveLength(1);
    expect(rows[rows.length - 1].kind).toBe('summary');
    const sum = tele.summary(s);
    expect(rows[rows.length - 1].data).toEqual(sum);
    expect(sum.pass).toEqual({ put: 2, take: 0, serve: 0, stale: 1 });
    expect(sum.botMistakes).toEqual({ Bo: 2 });
    expect(sum.idleTicks).toEqual({ Kay: 0, Lu: 30, Bo: 0 });
    expect(sum.days).toEqual([d1, d2]);
    expect(sum.drinks).toEqual({ espresso: 1, latte: 3, coldBrew: 2 });
    expect(sum.cards).toEqual([{ day: 1, offered: ['a', 'b', 'c'], bought: ['c'] }]);
    expect(sum.events).toEqual([
      { day: 1, events: ['rushHour'] },
      { day: 2, events: [] },
    ]);

    const parsed = tele.toNdjson().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    expect(parsed).toHaveLength(rows.length);
    expect(parsed[0].kind).toBe('meta');
  });

  it('records a summary on entering weekEnd and again on ended, once per transition', () => {
    const { tele } = setup();
    const s = run();
    tele.snapshot(s);
    s.phase = 'weekEnd';
    tele.snapshot(s);
    tele.snapshot(s);
    const summaries = () => tele.rows().filter((r) => r.kind === 'summary');
    expect(summaries()).toHaveLength(1);
    s.phase = 'ended';
    tele.snapshot(s);
    tele.snapshot(s);
    expect(summaries()).toHaveLength(2);
    expect(tele.rows().at(-1)!.kind).toBe('summary');
  });

  it('counts the day in progress in the summary', () => {
    const { tele } = setup();
    const s = startDay(run());
    s.days = [{ ...freshDayStats(0), drinks: { espresso: 1, latte: 0, coldBrew: 0 } }];
    s.today.drinks = { espresso: 2, latte: 0, coldBrew: 0 };
    const sum = tele.summary(s);
    expect(sum.days.map((d) => d.day)).toEqual([0, 1]);
    expect(sum.drinks.espresso).toBe(3);
  });

  it('downloads through the injected saver', () => {
    const { tele, saved } = setup();
    tele.snapshot(run());
    tele.download();
    expect(saved).toHaveLength(1);
    expect(saved[0].filename).toMatch(/^cafetycoon-7-\d{4}-\d{2}-\d{2}\.ndjson$/);
    expect(saved[0].text).toBe(tele.toNdjson());
    tele.download('mine.ndjson');
    expect(saved[1].filename).toBe('mine.ndjson');
  });

  it('records ui and peer events under their own kinds', () => {
    const { clock, tele } = setup();
    clock.t = 50;
    tele.ui('frame.long', { ms: 120 });
    tele.peerEvents('tok', [{ kind: 'input.mash', data: { count: 4 }, at: 9 }]);
    expect(tele.rows().map((r) => [r.kind, r.at, r.data])).toEqual([
      ['frame.long', 50, { ms: 120 }],
      ['input.mash', 50, { from: 'tok', count: 4 }],
    ]);
  });

  it('peerEvents always records the real token as from, whatever the peer sent', () => {
    const { tele } = setup();
    tele.peerEvents('real', [{ kind: 'frame.long', data: { from: 'spoof', ms: 5 }, at: 1 }]);
    expect(tele.rows()[0].data).toEqual({ from: 'real', ms: 5 });
  });

  it('withTelemetry records inputs it forwards and snapshots it receives', () => {
    const { tele } = setup();
    const sent: PlayerInput[] = [];
    let emit: (snap: HostToClient) => void = () => {};
    let subs = 0;
    const inner: Transport = {
      start: () => {},
      resume: () => {},
      sendInput: (i) => {
        expect(tele.rows().some((r) => r.kind === 'input')).toBe(true);
        sent.push(i);
      },
      onSnapshot: (cb) => {
        subs++;
        const prev = emit;
        emit = (snap) => {
          prev(snap);
          cb(snap);
        };
        return () => {};
      },
      onError: () => () => {},
      close: () => {},
    };
    const wrapped = withTelemetry(inner, tele);
    const seen: HostToClient[] = [];
    wrapped.onSnapshot((snap) => seen.push(snap));
    wrapped.sendInput(move('p1', false));
    expect(sent).toHaveLength(1);
    const snap: HostToClient = { t: 'snapshot', state: run(), sentAt: 0 };
    emit(snap);
    expect(seen).toEqual([snap]);
    expect(kinds(tele)).toEqual(['meta', 'input', 'snapshot']);
    expect(subs).toBe(2);
  });

  it('the ui hook records nothing without a sink', () => {
    expect(() => uiTelemetry.ui('x')).not.toThrow();
    const calls: [string, unknown][] = [];
    setUiTelemetrySink((kind, data) => calls.push([kind, data]));
    uiTelemetry.ui('x');
    expect(calls).toEqual([['x', undefined]]);
  });

  it('buffers ui events for peers, keeping the newest 200', () => {
    let t = 0;
    const buf = createUiBuffer(() => t);
    for (let i = 0; i < 205; i++) {
      t = i;
      buf.push('frame.long', { i });
    }
    const drained = buf.drain();
    expect(drained).toHaveLength(200);
    expect(drained[0]).toEqual({ kind: 'frame.long', data: { i: 5 }, at: 5 });
    expect(buf.drain()).toEqual([]);
  });
});
