import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../data/economy';
import { createRun } from '../sim/run';
import { step } from '../sim/step';
import type { GameState, SimEvent } from '../sim/types';
import { ambienceFor, createHeartbeat, CROWD_FULL, diffCues, heartbeatGapMs, logCursor, MAX_STATION_SEC, type CueId } from './cues';

const run = () => createRun({ seed: 9, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }] });
const clone = (s: GameState): GameState => structuredClone(s);
const ids = (r: { cues: { id: CueId }[] }) => r.cues.map((c) => c.id);

function withLog(s: GameState, ...entries: Omit<SimEvent, 'seq' | 'tick'>[]): GameState {
  const n = clone(s);
  for (const e of entries) n.log.push({ ...e, seq: n.nextLogSeq++, tick: n.tick });
  return n;
}

describe('diffCues', () => {
  it('stays silent on the first snapshot, a different run, or a log that went backwards', () => {
    const s = withLog(run(), { kind: 'pass.serve', data: { by: 'p1', item: 'latte' } });
    expect(diffCues(null, s, 'p1', 0)).toEqual({ cues: [], lastSeq: logCursor(s) });
    const other = clone(s);
    other.seed = 99;
    expect(diffCues(s, other, 'p1', 0).cues).toEqual([]);
    expect(diffCues(s, s, 'p1', logCursor(s) + 50).cues).toEqual([]);
  });

  it('maps log entries to sounds once, marking the ones the local player caused', () => {
    const a = run();
    const b = withLog(
      a,
      { kind: 'pass.put', data: { by: 'p1', item: 'espresso' } },
      { kind: 'pass.take', data: { by: 'p2', item: 'shot' } },
      { kind: 'pass.serve', data: { by: 'p1', item: 'latte' } },
      { kind: 'trash', data: { by: 'p2', item: 'milk' } },
      { kind: 'bot.mistake', data: { bot: 'b1' } },
      { kind: 'event.start', data: { kind: 'rushHour' } },
      { kind: 'event.start', data: { kind: 'powerFlicker' } },
      { kind: 'event.start', data: { kind: 'healthInspector' } },
      { kind: 'event.start', data: { kind: 'influencerVisit' } },
      { kind: 'event.end', data: { kind: 'rushHour' } },
      { kind: 'inspection', data: { result: 'pass' } },
      { kind: 'inspection', data: { result: 'fail' } },
      { kind: 'influencer', data: { result: 'served' } },
      { kind: 'influencer', data: { result: 'missed' } },
      { kind: 'pass.stale', data: { item: 'shot' } },
    );
    const r = diffCues(a, b, 'p1', logCursor(a));
    expect(ids(r)).toEqual([
      'cupDown', 'pickUp', 'serve', 'trash', 'botOops',
      'rushHour', 'powerFlicker', 'inspector', 'influencer',
      'inspectPass', 'inspectFail', 'influencerServed',
    ]);
    expect(r.cues.filter((c) => c.mine).map((c) => c.id)).toEqual(['cupDown', 'serve']);
    expect(r.lastSeq).toBe(logCursor(b));
    // the same entries are still in the next snapshot's log: no repeat
    expect(diffCues(b, clone(b), 'p1', r.lastSeq).cues).toEqual([]);
  });

  it('starts a station sound for its real busy time (capped) and dings when the item is ready', () => {
    const a = run();
    const b = clone(a);
    const grinder = b.stations.find((s) => s.kind === 'grinder')!;
    grinder.busyTicksLeft = 150;
    const esp = b.stations.find((s) => s.kind === 'espresso')!;
    esp.busyTicksLeft = 60 * 60;
    let r = diffCues(a, b, 'p1', logCursor(a));
    expect(r.cues).toEqual([{ id: 'grinder', dur: 2.5 }, { id: 'espresso', dur: MAX_STATION_SEC }]);
    const c = clone(b);
    c.stations.find((s) => s.kind === 'grinder')!.busyTicksLeft = 0;
    c.stations.find((s) => s.kind === 'grinder')!.output = 'grounds' as never;
    r = diffCues(b, c, 'p1', logCursor(b));
    expect(ids(r)).toEqual(['stationReady']);
    // still busy, still holding: nothing new
    expect(diffCues(c, clone(c), 'p1', logCursor(c)).cues).toEqual([]);
  });

  it('rings the door for new customers and reacts to lost or turned-away ones', () => {
    const a = run();
    a.phase = 'day';
    const b = clone(a);
    b.customers.push({ id: 900, drink: 'latte', patienceLeft: 10, patienceMax: 10 } as GameState['customers'][number]);
    b.customers.push({ id: 901, drink: 'espresso', patienceLeft: 10, patienceMax: 10 } as GameState['customers'][number]);
    b.today.lost = a.today.lost + 1;
    b.today.turnedAway = a.today.turnedAway + 2;
    expect(ids(diffCues(a, b, 'p1', logCursor(a)))).toEqual(['doorBell', 'stormOut', 'turnedAway']);
    // a new day resets the counters; that is not someone storming out
    const c = clone(b);
    c.day = b.day + 1;
    c.today.lost = 5;
    expect(ids(diffCues(b, c, 'p1', logCursor(b)))).toEqual([]);
  });

  it('plays phase stingers', () => {
    const at = (phase: GameState['phase'], bankrupt = false) => {
      const s = run();
      s.phase = phase;
      s.bankrupt = bankrupt;
      return s;
    };
    const one = (a: GameState, b: GameState) => ids(diffCues(a, b, 'p1', logCursor(a)));
    expect(one(at('night'), at('day'))).toEqual(['dayStart']);
    expect(one(at('day'), at('closing'))).toEqual(['dayEnd']);
    expect(one(at('night'), at('weekEnd'))).toEqual(['weekEnd']);
    expect(one(at('weekEnd'), at('ended', true))).toEqual(['gameOver']);
    expect(one(at('weekEnd'), at('ended'))).toEqual(['weekEnd']);
  });

  it('chimes purchases and restocks at night', () => {
    const a = run();
    a.phase = 'night';
    const b = clone(a);
    b.boughtTonight.push('streetSign' as never);
    b.supplies.milk += 10;
    expect(ids(diffCues(a, b, 'p1', logCursor(a)))).toEqual(['buy', 'restock']);
  });

  it('follows a real simulated day without replaying anything (and never touches the state)', () => {
    let s = run();
    let prev: GameState | null = null;
    let seq = 0;
    const heard: CueId[] = [];
    for (let t = 0; t < 60 * (ECONOMY.nightLengthSec + 30); t++) {
      s = step(s, []);
      if (t % 3 === 0) {
        const before = JSON.stringify(s);
        const r = diffCues(prev, s, 'p1', seq);
        expect(JSON.stringify(s)).toBe(before);
        seq = r.lastSeq;
        heard.push(...r.cues.map((c) => c.id));
        prev = s;
      }
    }
    expect(heard).toContain('doorBell');
    // every voiced log entry came from a distinct seq
    expect(seq).toBe(logCursor(s));
  });
});

describe('ambienceFor', () => {
  it('picks the loop, crowd level and power state', () => {
    expect(ambienceFor(null)).toEqual({ music: 'night', crowd: 0, powerOut: false });
    const s = run();
    s.phase = 'day';
    s.customers = [];
    expect(ambienceFor(s)).toMatchObject({ music: 'day', crowd: 0 });
    for (let i = 0; i < CROWD_FULL / 2; i++) s.customers.push({ id: i, drink: 'latte', patienceLeft: 1, patienceMax: 1 } as GameState['customers'][number]);
    expect(ambienceFor(s).crowd).toBeCloseTo(0.5);
    s.customers[0].extra = Array(20).fill('latte');
    expect(ambienceFor(s).crowd).toBe(1);
    s.events = [{ kind: 'powerFlicker' } as GameState['events'][number]];
    expect(ambienceFor(s).powerOut).toBe(true);
    s.phase = 'night';
    expect(ambienceFor(s)).toEqual({ music: 'night', crowd: 0, powerOut: false });
  });
});

describe('espresso sounds', () => {
  it('gulps on a shot and faints + sirens on the collapse', () => {
    const a = run();
    const b = withLog(a, { kind: 'espresso.shot', data: { by: 'p1', shot: 1 } }, { kind: 'espresso.collapse', data: { by: 'p2' } });
    const r = diffCues(a, b, 'p1', logCursor(a));
    expect(r.cues).toEqual([{ id: 'gulp', mine: true }, { id: 'collapse', mine: false }]);
  });

  it('beats faster with every shot from the 3rd, and stops when out or unboosted', () => {
    const s = run();
    s.phase = 'day';
    const me = s.players[0];
    expect(heartbeatGapMs(s, 'p1')).toBeNull();
    me.espresso = { shots: 2, boostTicksLeft: 100, mul: 1.35, collapsedAt: null, fellAt: null, out: false };
    expect(heartbeatGapMs(s, 'p1')).toBeNull();
    const gaps = [3, 4, 5].map((n) => {
      me.espresso!.shots = n;
      return heartbeatGapMs(s, 'p1')!;
    });
    expect(gaps[0]).toBeGreaterThan(gaps[1]);
    expect(gaps[1]).toBeGreaterThan(gaps[2]);
    expect(heartbeatGapMs(s, 'p2')).toBeNull();
    me.espresso!.boostTicksLeft = 0;
    expect(heartbeatGapMs(s, 'p1')).toBeNull();
    me.espresso!.boostTicksLeft = 5;
    me.espresso!.out = true;
    expect(heartbeatGapMs(s, 'p1')).toBeNull();
  });

  it('heartbeat ticker beats at the gap and speeds up at once', () => {
    const h = createHeartbeat();
    expect(h.tick(1000, 600)).toBe(true);
    expect(h.tick(1300, 600)).toBe(false);
    expect(h.tick(1600, 600)).toBe(true);
    expect(h.tick(1700, 300)).toBe(false); // next pulled in to 2000
    expect(h.tick(2000, 300)).toBe(true);
    expect(h.tick(2100, null)).toBe(false);
    expect(h.tick(2150, 300)).toBe(true);
  });
});

describe('Gear batch/pickup sounds (3.3.1)', () => {
  it('plays the serve sound when a customer takes their cup, and voices the till, the bar and the box', () => {
    const a = run();
    const b = withLog(
      a,
      { kind: 'till.rung', data: { customer: 3, drink: 'latte', by: 'p1' } },
      { kind: 'drop', data: { item: 'latte', station: 'pickup', by: 'p1' } },
      { kind: 'pickup.take', data: { drink: 'latte', customer: 3, by: 'p1' } },
      { kind: 'condiment.use', data: { customer: 3 } },
      { kind: 'condiment.black', data: { customer: 4, text: 'Black it is, I guess.' } },
      { kind: 'condiment.refill', data: { by: 'p2' } },
      { kind: 'drop', data: { item: 'box', x: 1, y: 7 } },
    );
    const r = diffCues(a, b, 'p1', logCursor(a));
    expect(ids(r)).toEqual(['ringUp', 'cupDown', 'serve', 'grumble', 'refill', 'boxDown']);
    expect(r.cues.filter((c) => c.mine).map((c) => c.id)).toEqual(['ringUp', 'cupDown', 'serve']);
  });

  it('a box going back to the corner is not a splash', () => {
    const a = run();
    const b = withLog(a, { kind: 'drop', data: { item: 'box', x: 1, y: 7 } }, { kind: 'drop', data: { item: 'latte', x: 2, y: 3 } });
    expect(ids(diffCues(a, b, 'p1', logCursor(a)))).toEqual(['boxDown', 'splash']);
  });
});
