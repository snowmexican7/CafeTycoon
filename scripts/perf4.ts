// B12 perf probe: a whole week with 4 stand-in baristas; times step() and measures snapshot size.
import { addStandIns } from '../src/sim/bots/roster';
import { createRun } from '../src/sim/run';
import { step } from '../src/sim/step';
import { nightInputs } from './balanceCore';
import type { GameState } from '../src/sim/types';
import { applyPatch, diff, roundFloats } from '../src/net/delta';
import { KEYFRAME_EVERY } from '../src/net/hostRoom';
// Wire size per snapshot at 20 Hz (every 3rd 60 Hz tick): full JSON vs a delta against the last one sent.
let wirePrev: unknown = null; let wireTicks = 0; let diffMs = 0; let fullSum = 0, deltaSum = 0, deltaMax = 0, wireN = 0, mismatches = 0;
let last = '';
let s: GameState = createRun({ seed: 7, hostId: 'tester', players: [], settings: { bots: 0, botSkill: 3, pace: 3, dayLengthSec: 120, nightLengthSec: 5 } as never });
addStandIns(s, 4);
const times: number[] = []; let maxBytes = 0, sumBytes = 0, n = 0, maxCust = 0;
while (s.phase !== 'weekEnd' && s.phase !== 'ended') {
  const inputs = s.phase === 'night' && last !== 'night' ? nightInputs(s) : [];
  last = s.phase;
  const t = performance.now(); s = step(s, inputs); const dt = performance.now() - t;
  if ((s.phase === 'day' || s.phase === 'closing') && wireTicks++ % 3 === 0) {
    const full = JSON.stringify(s).length; fullSum += full;
    if (wirePrev === null || wireN % KEYFRAME_EVERY === 0) { wirePrev = roundFloats(s); deltaSum += JSON.stringify(wirePrev).length; } else {
      const t0 = performance.now(); const p = diff(wirePrev, s); diffMs += performance.now() - t0; const b = p ? JSON.stringify(p).length : 2; deltaSum += b; deltaMax = Math.max(deltaMax, b);
      if (p) wirePrev = applyPatch(wirePrev, JSON.parse(JSON.stringify(p)));
      if (wireN % 500 === 0 && JSON.stringify(wirePrev) !== JSON.stringify(roundFloats(s))) mismatches++;
    }
    wireN++;
  }
  if (s.phase === 'day' || s.phase === 'closing') { times.push(dt); if (n++ % 30 === 0) { const b = JSON.stringify(s).length; maxBytes = Math.max(maxBytes, b); sumBytes += b; } maxCust = Math.max(maxCust, s.customers.length); }
}
times.sort((a, b) => a - b);
const q = (p: number) => times[Math.floor(times.length * p)].toFixed(3);
console.log(JSON.stringify({ players: s.players.length, dayTicks: times.length, p50ms: q(0.5), p99ms: q(0.99), maxms: times.at(-1)!.toFixed(2), avgSnapKB: (sumBytes / Math.ceil(n / 30) / 1024).toFixed(1), maxSnapKB: (maxBytes / 1024).toFixed(1), maxCustomers: maxCust, days: s.days.map((d) => [d.served, d.lost]) }));
const kbps = (bytes: number) => ((bytes / wireN) * 20 * 3 * 8 / 1e6).toFixed(2);
console.log(JSON.stringify({ snaps: wireN, avgFullB: Math.round(fullSum / wireN), avgDeltaB: Math.round(deltaSum / wireN), maxDeltaB: deltaMax, fullMbit3peers: kbps(fullSum), deltaMbit3peers: kbps(deltaSum), avgDiffMs: (diffMs / wireN).toFixed(3), mismatches }));
