import { describe, it, expect } from 'vitest';
import { createRun, startDay, startNight } from './run';
import { finishDay } from './closing';
import { step } from './step';
import { branchAreas, branchDay } from './branch';
import { CALL, callFor, callRinging, type CallKind } from './call';
import { secondsToTicks } from './constants';
import { validateInput } from './validate';
import { callVM } from '../ui/live';
import { callHtml } from '../ui/hud';
import { callLine } from '../ui/branchView';
import type { GameState } from './types';
import { diffCues, logCursor, RING_EVERY_SEC } from '../audio/cues';

/** A Gear run at night with a branch open since day 1, then rolled to the first day of `kind` call. */
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
    const c = callFor(t);
    if (c?.kind === kind) return startDay(t);
  }
  throw new Error('no call found');
}
const dayTicks = (s: GameState) => secondsToTicks(s.settings.dayLengthSec);
const botId = (s: GameState) => s.players.find((p) => p.bot)!.id;
const at = (s: GameState, ticksIn: number) => { s.phaseTicksLeft = dayTicks(s) - ticksIn; return s; };

describe('phone calls from the second shop (P4 B6)', () => {
  it('rings on some days only, never in classic runs, without a branch or on its opening day, and is deterministic', () => {
    const s = dayWithCall('machine');
    const ring = Array.from({ length: 100 }, (_, i) => callFor(s, i + 1)).filter(Boolean).length;
    expect(ring).toBeGreaterThan(25);
    expect(ring).toBeLessThan(65);
    expect(callFor(s)).toEqual(callFor(structuredClone(s)));
    expect(callFor({ ...s, gear: undefined })).toBeNull();
    expect(callFor({ ...s, branch: undefined })).toBeNull();
    expect(callFor({ ...s, branch: { ...s.branch!, openedDay: s.day } })).toBeNull();
    const c = callFor(s)!;
    expect(c.ringAt).toBeGreaterThanOrEqual(Math.floor(dayTicks(s) * CALL.ringFrom));
    expect(c.until - c.ringAt).toBeLessThanOrEqual(secondsToTicks(CALL.answerSec));
  });

  it('rings only inside its window and only a person can pick up', () => {
    const s = dayWithCall('order');
    const c = callFor(s)!;
    expect(callRinging(at(s, c.ringAt - 1))).toBeNull();
    expect(callRinging(at(s, c.until))).toBeNull();
    at(s, c.ringAt);
    expect(callRinging(s)?.secsLeft).toBe(CALL.answerSec);
    let t = step(s, [{ kind: 'call', playerId: botId(s), take: true }]);
    expect(t.callAnswer).toBeUndefined();
    t = step(at(s, c.ringAt + 5), [{ kind: 'call', playerId: 'p1', take: true }]);
    expect(t.callAnswer).toEqual({ day: s.day, take: true, by: 'Kay' });
    expect(callRinging(t)).toBeNull();
    expect(step(at(s, c.ringAt - 5), [{ kind: 'call', playerId: 'p1', take: true }]).callAnswer).toBeUndefined();
    expect(validateInput({ kind: 'call', playerId: 'p1', take: 'yes' } as never)).toBeNull();
    expect(validateInput({ kind: 'call', playerId: 'p1', take: false })).toEqual({ kind: 'call', playerId: 'p1', take: false });
  });

  it('a fixed machine costs the repair; a missed call halves the cups', () => {
    const s = dayWithCall('machine');
    s.branch!.staff = 3;
    const plain = branchDay(s)!;
    const missed = branchDay(s, s.day, true)!;
    expect(missed.call).toEqual({ kind: 'machine', took: false });
    expect(missed.served).toBe(Math.min(plain.served + plain.walked, Math.floor((3 * 12) / 2)));
    s.callAnswer = { day: s.day, take: true, by: 'Kay' };
    const fixed = branchDay(s, s.day, true)!;
    expect(fixed.served).toBe(plain.served);
    expect(fixed.costs).toBeCloseTo(plain.costs + CALL.repair, 2);
    expect(callLine(fixed.call)).toMatch(/Kay sent a fix/);
  });

  it('a taken order adds its profit but uses branch cups, and closing records and clears it', () => {
    const s = dayWithCall('order');
    s.branch!.staff = 1;
    const plain = branchDay(s)!;
    s.callAnswer = { day: s.day, take: true, by: 'Kay' };
    const took = branchDay(s, s.day, true)!;
    expect(took.served).toBe(Math.min(plain.served + plain.walked, 12 - CALL.orderCups));
    const after = finishDay(s);
    expect(after.callAnswer).toBeUndefined();
    expect(after.days[after.days.length - 1]!.branch?.call).toEqual({ kind: 'order', took: true, by: 'Kay' });
    expect(after.days[after.days.length - 1]!.branch?.takings).toBeCloseTo(took.takings, 2);
    expect(took.takings).toBeGreaterThan(CALL.orderProfit - 0.01);
  });

  it('shows a big card with both choices while it rings (not to bots), and old saves close a day', () => {
    const s = dayWithCall('machine');
    at(s, callFor(s)!.ringAt);
    const vm = callVM(s, 'p1')!;
    expect(vm.title).toMatch(/machine/);
    const html = callHtml(vm);
    expect(html).toMatch(/data-take="1"/);
    expect(html).toMatch(/data-take="0"/);
    expect(html).toMatch(/is calling/);
    expect(callVM(s, botId(s))).toBeUndefined();
    const old = dayWithCall('order');
    delete old.callAnswer;
    expect(() => finishDay(old)).not.toThrow();
  });

  it('rings the phone when the call starts and every few seconds until someone picks up (P6 sound)', () => {
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
    const answered = { ...tick(5), callAnswer: { day: s.day, take: true } } as GameState;
    expect(rings(tick(4), answered)).toBe(0);
  });
});
