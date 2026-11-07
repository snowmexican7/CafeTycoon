import { describe, it, expect } from 'vitest';
import { createRun, startDay, startNight } from './run';
import { finishDay } from './closing';
import { step } from './step';
import { branchAreas, branchDay } from './branch';
import { CALL, branchTakesCall, callFor, callOutcome, callRinging, type CallKind } from './call';
import { secondsToTicks } from './constants';
import { validateInput } from './validate';
import { callVM } from '../ui/live';
import { callHtml } from '../ui/hud';
import { callLine } from '../ui/branchView';
import type { DayStats, GameState } from './types';
import { diffCues, logCursor, RING_EVERY_SEC } from '../audio/cues';
import { addBots } from '../harness/crew';

/** A Gear run at night with a branch open since day 1, then rolled to the first day of `kind` call. */
function dayWithCall(kind: CallKind): GameState {
  const s = addBots(createRun({ seed: 11, hostId: 'p1', players: [{ id: 'p1', name: 'Kay' }] }), 1);
  s.gear = true;
  s.tier = 'cafe';
  s.cash = 1000;
  startNight(s);
  const t = step(s, [{ kind: 'branch', playerId: 'p1', action: 'open', area: branchAreas(s)[0] }]);
  t.branch!.openedDay = 0;
  for (let d = 1; d < 200; d++) {
    t.day = d;
    const c = callFor(t);
    if (c?.kind === kind) return startDay(t);
  }
  throw new Error('no call found');
}
const dayTicks = (s: GameState) => secondsToTicks(s.settings.dayLengthSec);
const at = (s: GameState, ticksIn: number) => { s.phaseTicksLeft = dayTicks(s) - ticksIn; return s; };
/** Yesterday's branch day, with `walked` people lost. */
const yesterday = (s: GameState, walked: number) => {
  s.days = [...s.days, { ...s.today, day: s.day - 1, branch: { served: 10, walked, takings: 0, costs: 0, profit: 0 } } as DayStats];
};
/** Step once at the first ringing tick, so the branch decides. */
const ring = (s: GameState) => step(at(structuredClone(s), callFor(s)!.ringAt), []);

describe('phone calls from the second shop (P4 B6; bot cut: the branch handles them itself)', () => {
  it('rings on some days only, never in classic runs, without a branch or on its opening day, and is deterministic', () => {
    const s = dayWithCall('machine');
    const rang = Array.from({ length: 100 }, (_, i) => callFor(s, i + 1)).filter(Boolean).length;
    expect(rang).toBeGreaterThan(25);
    expect(rang).toBeLessThan(65);
    expect(callFor(s)).toEqual(callFor(structuredClone(s)));
    expect(callFor({ ...s, gear: undefined })).toBeNull();
    expect(callFor({ ...s, branch: undefined })).toBeNull();
    expect(callFor({ ...s, branch: { ...s.branch!, openedDay: s.day } })).toBeNull();
    const c = callFor(s)!;
    expect(c.ringAt).toBeGreaterThanOrEqual(Math.floor(dayTicks(s) * CALL.ringFrom));
    expect(c.until - c.ringAt).toBeLessThanOrEqual(secondsToTicks(CALL.answerSec));
  });

  it('an office order is taken when yesterday lost nobody at the branch, and refused otherwise', () => {
    const calm = dayWithCall('order');
    yesterday(calm, 0);
    expect(branchTakesCall(calm, 'order')).toBe(true);
    expect(ring(calm).callDecision).toEqual({ day: calm.day, take: true });
    const rough = dayWithCall('order');
    yesterday(rough, 3);
    expect(branchTakesCall(rough, 'order')).toBe(false);
    expect(ring(rough).callDecision).toEqual({ day: rough.day, take: false });
  });

  it('a broken machine is fixed with two branch staff, not with one', () => {
    const staffed = dayWithCall('machine');
    staffed.branch!.staff = 2;
    expect(branchTakesCall(staffed, 'machine')).toBe(true);
    expect(ring(staffed).callDecision).toEqual({ day: staffed.day, take: true });
    const thin = dayWithCall('machine');
    thin.branch!.staff = 1;
    expect(branchTakesCall(thin, 'machine')).toBe(false);
    expect(ring(thin).callDecision).toEqual({ day: thin.day, take: false });
  });

  it('decides once when it first rings, logs call.outcome, and keeps ringing for its whole window', () => {
    const s = dayWithCall('order');
    yesterday(s, 0);
    const c = callFor(s)!;
    const before = step(at(structuredClone(s), c.ringAt - 2), []);
    expect(before.callDecision).toBeUndefined();
    expect(callRinging(at(structuredClone(s), c.ringAt - 1))).toBeNull();
    let t = ring(s);
    expect(t.log.filter((e) => e.kind === 'call.outcome').map((e) => e.data)).toEqual([{ kind: 'order', take: true }]);
    // it keeps ringing after the decision, to the end of its window
    at(t, c.ringAt + 5);
    expect(callRinging(t)).toMatchObject({ kind: 'order', take: true });
    at(t, c.until - 1);
    expect(callRinging(t)?.secsLeft).toBeGreaterThan(0);
    at(t, c.until);
    expect(callRinging(t)).toBeNull();
    // later ticks don't re-decide or re-log, even if the branch's numbers change
    at(t, c.ringAt + 5);
    t.days.at(-1)!.branch!.walked = 9;
    t = step(t, []);
    expect(t.callDecision).toEqual({ day: s.day, take: true });
    expect(t.log.filter((e) => e.kind === 'call.outcome').length).toBe(1);
    // nobody answers it: the input is gone
    expect(validateInput({ kind: 'call', playerId: 'p1', take: true } as never)).toBeNull();
  });

  it('closing applies the decision: a fixed machine costs the repair, a refused one halves the cups', () => {
    const s = dayWithCall('machine');
    s.branch!.staff = 3;
    const plain = branchDay(s)!;
    const fixed = ring(s);
    expect(callOutcome(fixed)).toEqual({ kind: 'machine', took: true });
    const f = branchDay(fixed, fixed.day, true)!;
    expect(f.served).toBe(plain.served);
    expect(f.costs).toBeCloseTo(plain.costs + CALL.repair, 2);
    expect(callLine(f.call)).toMatch(/got the machine fixed/);
    const thin = dayWithCall('machine');
    thin.branch!.staff = 1;
    const plainThin = branchDay(thin)!;
    const broke = finishDay(at(ring(thin), callFor(thin)!.until + 5));
    expect(broke.days.at(-1)!.branch?.call).toEqual({ kind: 'machine', took: false });
    expect(broke.days.at(-1)!.branch?.served).toBe(Math.min(plainThin.served + plainThin.walked, Math.floor(12 / 2)));
    expect(broke.callDecision).toBeUndefined();
  });

  it('a taken order adds its profit but uses branch cups, and closing records and clears it', () => {
    const s = dayWithCall('order');
    s.branch!.staff = 1;
    yesterday(s, 0);
    const plain = branchDay(s)!;
    const t = ring(s);
    const took = branchDay(t, t.day, true)!;
    expect(took.served).toBe(Math.min(plain.served + plain.walked, 12 - CALL.orderCups));
    expect(took.takings).toBeGreaterThan(CALL.orderProfit - 0.01);
    const after = finishDay(t);
    expect(after.callDecision).toBeUndefined();
    expect(after.days.at(-1)!.branch?.call).toEqual({ kind: 'order', took: true });
    expect(after.days.at(-1)!.branch?.takings).toBeCloseTo(took.takings, 2);
  });

  it('a day that closed before the call rang is no call', () => {
    const s = dayWithCall('machine');
    s.branch!.staff = 3;
    const c = callFor(s)!;
    const plain = branchDay(s)!;
    const t = step(at(structuredClone(s), c.ringAt - 40), []);
    expect(t.callDecision).toBeUndefined();
    expect(callOutcome(t)).toBeNull();
    expect(branchDay(t, t.day, true)!.call).toBeUndefined();
    const early = finishDay(t);
    expect(early.days.at(-1)!.branch?.call).toBeUndefined();
    expect(early.days.at(-1)!.branch?.served).toBe(plain.served);
    // a decision left from another day is not today's
    expect(callOutcome({ ...t, callDecision: { day: t.day - 1, take: true } })).toBeNull();
  });

  it('is deterministic: the same state rings to the same decision', () => {
    const s = dayWithCall('order');
    yesterday(s, 1);
    const a = ring(s);
    const b = ring(structuredClone(s));
    expect(a.callDecision).toEqual(b.callDecision);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('shows a heads-up card while it rings, with no answer buttons (not to bots)', () => {
    const s = dayWithCall('machine');
    at(s, callFor(s)!.ringAt);
    const vm = callVM(s, 'p1')!;
    expect(vm.title).toMatch(/machine/);
    const html = callHtml(vm);
    expect(html).not.toMatch(/data-take/);
    expect(html).toMatch(/is calling/);
    const bot = s.players.find((p) => p.bot);
    if (bot) expect(callVM(s, bot.id)).toBeUndefined();
  });

  it('rings the phone when the call starts and every few seconds for its whole window (P6 sound)', () => {
    const s = dayWithCall('machine');
    const c = callFor(s)!;
    const rings = (prev: GameState, next: GameState) => diffCues(prev, next, 'p1', logCursor(prev)).cues.filter((q) => q.id === 'phoneRing').length;
    const before = at(structuredClone(s), c.ringAt - 1);
    const start = at(structuredClone(s), c.ringAt);
    expect(rings(before, start)).toBe(1);
    const tick = (n: number) => at(structuredClone(s), c.ringAt + n);
    expect(rings(tick(1), tick(2))).toBe(0);
    let total = 0;
    for (let i = 0; i < c.until - c.ringAt + 5; i++) total += rings(tick(i), tick(i + 1));
    expect(total).toBe(Math.ceil(CALL.answerSec / RING_EVERY_SEC) - 1);
    const decided = { ...tick(5), callDecision: { day: s.day, take: true } };
    expect(rings(tick(4), decided)).toBe(0);
    expect(callRinging(decided)).not.toBeNull();
  });
});
