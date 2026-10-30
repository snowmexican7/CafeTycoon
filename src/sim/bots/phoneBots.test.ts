import { describe, it, expect } from 'vitest';
import { createRun, startDay, startNight } from '../run';
import { step } from '../step';
import { branchAreas } from '../branch';
import { callFor, callRinging, type CallKind } from '../call';
import { secondsToTicks } from '../constants';
import type { GameState } from '../types';

const SECS = (n: number) => secondsToTicks(n);

/** A Gear run with a branch open since day 1, rolled to the first day with a `kind` call. One person, one bot. */
function dayWithCall(kind: CallKind): GameState {
  const s = createRun({ seed: 11, hostId: 'p1', players: [{ id: 'p1', name: 'Kay' }], settings: { bots: 1 } });
  s.gear = true;
  s.tier = 'cafe';
  s.cash = 1000;
  startNight(s);
  const t = step(s, [{ kind: 'branch', playerId: 'p1', action: 'open', area: branchAreas(s)[0] }]);
  t.branch!.openedDay = 0;
  for (let d = 1; d < 200; d++) {
    t.day = d;
    if (callFor(t)?.kind === kind) return startDay(t);
  }
  throw new Error('no call found');
}
const dayTicks = (s: GameState) => SECS(s.settings.dayLengthSec);
const at = (s: GameState, ticksIn: number) => { s.phaseTicksLeft = dayTicks(s) - ticksIn; return s; };
const bot = (s: GameState) => s.players.find((p) => p.bot)!;
const answers = (s: GameState) => s.log.filter((e) => e.kind === 'call.answer');
/** Step with nobody pressing anything, starting `secsIn` seconds after the phone began to ring. */
const ringFor = (s: GameState, secsIn: number) => step(at(s, callFor(s)!.ringAt + SECS(secsIn)), []);

describe('bots answer the phone when nobody else does', () => {
  it('a bot answers after 10 s of ringing, and the log says who', () => {
    const s = dayWithCall('order');
    s.days.push({ branch: { served: 5, walked: 0, takings: 10, costs: 5, profit: 5 } } as never);
    const early = ringFor(structuredClone(s), 5);
    expect(callRinging(early)).not.toBeNull();
    expect(early.callAnswer).toBeUndefined();
    const t = ringFor(s, 10);
    expect(t.callAnswer).toEqual({ day: s.day, take: true, by: bot(t).name });
    expect(answers(t)).toHaveLength(1);
    expect(answers(t)[0]!.data).toEqual({ by: bot(t).name, take: true, kind: 'order' });
    expect(callRinging(t)).toBeNull();
  });

  it('a person who answers first wins, and the bot never overrides', () => {
    const s = dayWithCall('order');
    const c = callFor(s)!;
    let t = step(at(s, c.ringAt + SECS(4)), [{ kind: 'call', playerId: 'p1', take: false }]);
    expect(t.callAnswer).toEqual({ day: s.day, take: false, by: 'Kay' });
    expect(answers(t).map((e) => e.data.by)).toEqual(['Kay']);
    for (let i = 0; i < SECS(8); i++) t = step(t, []);
    expect(t.callAnswer).toEqual({ day: s.day, take: false, by: 'Kay' });
    expect(t.log.filter((e) => e.kind === 'call.answer' && e.data.by !== 'Kay')).toEqual([]);
  });

  it('a person answering emits call.answer with their name', () => {
    const s = dayWithCall('machine');
    const t = step(at(s, callFor(s)!.ringAt + SECS(2)), [{ kind: 'call', playerId: 'p1', take: true }]);
    expect(answers(t)[0]!.data).toEqual({ by: 'Kay', take: true, kind: 'machine' });
  });

  it('no call ringing: nobody answers', () => {
    const s = dayWithCall('order');
    const c = callFor(s)!;
    const before = step(at(s, c.ringAt - SECS(1)), []);
    expect(before.callAnswer).toBeUndefined();
    const after = step(at(structuredClone(s), c.until + SECS(1)), []);
    expect(after.callAnswer).toBeUndefined();
    expect(answers(after)).toHaveLength(0);
    // A day with no call at all.
    const quiet = structuredClone(s);
    quiet.branch = undefined;
    expect(step(at(quiet, c.ringAt + SECS(12)), []).callAnswer).toBeUndefined();
  });

  it('an order call is taken when yesterday had no walk-outs, declined when it had some', () => {
    const calm = dayWithCall('order');
    calm.days.push({ branch: { served: 8, walked: 0, takings: 1, costs: 1, profit: 0 } } as never);
    expect(ringFor(calm, 10).callAnswer?.take).toBe(true);
    const rough = dayWithCall('order');
    rough.days.push({ branch: { served: 8, walked: 3, takings: 1, costs: 1, profit: 0 } } as never);
    const t = ringFor(rough, 10);
    expect(t.callAnswer).toEqual({ day: rough.day, take: false, by: bot(t).name });
    expect(answers(t)[0]!.data.take).toBe(false);
  });

  it('a machine call is fixed with 2+ branch staff, declined with fewer', () => {
    const staffed = dayWithCall('machine');
    staffed.branch!.staff = 2;
    expect(ringFor(staffed, 10).callAnswer?.take).toBe(true);
    const thin = dayWithCall('machine');
    thin.branch!.staff = 1;
    const t = ringFor(thin, 10);
    expect(t.callAnswer).toEqual({ day: thin.day, take: false, by: bot(t).name });
    expect(answers(t)[0]!.data.kind).toBe('machine');
  });

  it('a busy bot (with a claim) does not answer; an idle one further down the order does', () => {
    const s = dayWithCall('order');
    const b = bot(s);
    b.bot!.claim = 999;
    expect(ringFor(structuredClone(s), 10).callAnswer).toBeUndefined();
    // Two bots: the first is busy, so the second answers (first idle in players order).
    const two = dayWithCall('order');
    const first = bot(two);
    const second = { ...structuredClone(first), id: 'bot-extra', name: 'Zed', bot: structuredClone(first.bot!) };
    two.players.push(second);
    first.bot!.claim = 999;
    const t = ringFor(two, 10);
    expect(t.callAnswer?.by).toBe('Zed');
    // A bot mid-plan (a real step, not idle) is busy too.
    const planned = dayWithCall('order');
    bot(planned).bot!.plan = [{ kind: 'floor', node: { x: 1, y: 1 } } as never];
    expect(ringFor(planned, 10).callAnswer).toBeUndefined();
  });

  it('is deterministic: the same state twice gives the same answer', () => {
    const s = dayWithCall('machine');
    s.branch!.staff = 3;
    const a = ringFor(structuredClone(s), 11);
    const b = ringFor(structuredClone(s), 11);
    expect(a.callAnswer).toEqual(b.callAnswer);
    expect(a.log).toEqual(b.log);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('network inputs from a bot id are still refused', () => {
    const s = dayWithCall('order');
    const t = step(at(s, callFor(s)!.ringAt + SECS(2)), [{ kind: 'call', playerId: bot(s).id, take: true }]);
    expect(t.callAnswer).toBeUndefined();
  });
});
