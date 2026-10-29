// B12 perf probe: a whole week with 4 stand-in baristas; times step() and measures snapshot size.
import { addStandIns } from '../src/sim/bots/roster';
import { createRun } from '../src/sim/run';
import { step } from '../src/sim/step';
import { nightInputs } from './balanceCore';
import type { GameState } from '../src/sim/types';
let last = '';
let s: GameState = createRun({ seed: 7, hostId: 'tester', players: [], settings: { bots: 0, botSkill: 3, pace: 3, dayLengthSec: 120, nightLengthSec: 5 } as never });
addStandIns(s, 4);
const times: number[] = []; let maxBytes = 0, sumBytes = 0, n = 0, maxCust = 0;
while (s.phase !== 'weekEnd' && s.phase !== 'ended') {
  const inputs = s.phase === 'night' && last !== 'night' ? nightInputs(s) : [];
  last = s.phase;
  const t = performance.now(); s = step(s, inputs); const dt = performance.now() - t;
  if (s.phase === 'day' || s.phase === 'closing') { times.push(dt); if (n++ % 30 === 0) { const b = JSON.stringify(s).length; maxBytes = Math.max(maxBytes, b); sumBytes += b; } maxCust = Math.max(maxCust, s.customers.length); }
}
times.sort((a, b) => a - b);
const q = (p: number) => times[Math.floor(times.length * p)].toFixed(3);
console.log(JSON.stringify({ players: s.players.length, dayTicks: times.length, p50ms: q(0.5), p99ms: q(0.99), maxms: times.at(-1)!.toFixed(2), avgSnapKB: (sumBytes / Math.ceil(n / 30) / 1024).toFixed(1), maxSnapKB: (maxBytes / 1024).toFixed(1), maxCustomers: maxCust, days: s.days.map((d) => [d.served, d.lost]) }));
