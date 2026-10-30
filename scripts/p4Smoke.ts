/**
 * P4 B8 integration smoke: plays Gear runs headless for four weeks with stand-ins and a scripted crew
 * that uses every Phase 4 system: Keep going into the season (real week-end input), Match it on the
 * rival's happy hours, the stamp card against the loyalty card, the second shop once there's a cushion,
 * stock sent over, and every phone call answered. Checks invariants (finite cash, season recorded and
 * medalled, saves round-trip through JSON, the same seed replays identically) and prints one row per run.
 * Usage: npx tsx scripts/p4Smoke.ts [days=28] [seeds=3]   (CAFE=1 starts at the café tier with $500)
 */
import { playGear, type ExtraMoves } from './gearBalance';
import { canOpenBranch, branchAreas, BRANCH } from '../src/sim/branch';
import { callRinging } from '../src/sim/call';
import { isPromoDay, loyaltyLive, RIVAL } from '../src/sim/rival';
import { seasonMedal, targetsHit } from '../src/sim/season';
import { foldRecords, emptyRecords } from '../src/storage/recordsStore';
import type { GameState, PlayerInput } from '../src/sim/types';
// Node globals, typed locally so src tests can import this file without @types/node.
declare const process: { env: Record<string, string | undefined>; argv: string[]; exit(code?: number): never };

export interface P4Trace { counters: number; stamps: number | null; branchDay: number | null; calls: number; sends: number }

export function crew(trace: P4Trace): ExtraMoves {
  return (s: GameState, ids: string[]): PlayerInput[] => {
    const by = ids[0]!;
    if (s.phase === 'day') {
      const c = callRinging(s);
      if (c) { trace.calls++; return [{ kind: 'call', playerId: by, take: c.kind === 'order' || s.cash > 60 }]; }
      return [];
    }
    if (isPromoDay(s) && s.rival?.counter !== s.day) { trace.counters++; return [{ kind: 'rivalCounter', playerId: by }]; }
    if (loyaltyLive(s) && s.rival?.stamps === undefined && s.cash >= RIVAL.stampCost + 60) { trace.stamps = s.day; return [{ kind: 'stampCard', playerId: by }]; }
    if (canOpenBranch(s) && s.cash >= BRANCH.cost + 120) { trace.branchDay = s.day; return [{ kind: 'branch', playerId: by, action: 'open', area: branchAreas(s)[0]! }]; }
    if (s.branch && !s.branch.stockCredit && (s.supplies.beans ?? 0) > 40 && trace.sends < 3) { trace.sends++; return [{ kind: 'branch', playerId: by, action: 'send', supply: 'beans' }]; }
    return [];
  };
}

export function p4Run(seed: number, humans = 2, days = 28, start?: Parameters<typeof playGear>[7]) {
  const trace: P4Trace = { counters: 0, stamps: null, branchDay: null, calls: 0, sends: 0 };
  let end: GameState | null = null;
  const r = playGear(humans, seed, null, days, 0, crew(trace), (s) => (end = s), start);
  const s = end as unknown as GameState;
  const problems: string[] = [];
  if (!Number.isFinite(s.cash)) problems.push('cash not finite');
  if (s.days.some((d) => !Number.isFinite(d.sales) || (d.branch && !Number.isFinite(d.branch.profit)))) problems.push('NaN in a day');
  if (s.days.length >= 28 && (!s.season || s.season.weeks.length !== 4 || !s.season.done)) problems.push(`season not finished: ${JSON.stringify(s.season?.weeks.map((w) => w.week))}`);
  const back = JSON.parse(JSON.stringify(s)) as GameState;
  if (JSON.stringify(back) !== JSON.stringify(s)) problems.push('save does not round-trip');
  const rec = foldRecords(emptyRecords(), s, [], '2026-10-30', s.cash);
  if (s.season && !rec.seasons?.length) problems.push('season missing from records');
  const branchDays = s.days.filter((d) => d.branch);
  return {
    seed, humans, days: s.days.length, cash: Math.round(s.cash), tier: s.tier, bankrupt: s.bankrupt,
    season: s.season ? `${s.season.weeks.map((w) => `w${w.week}:${Math.round(w.profit)}${w.target !== null ? '/' + w.target : ''}`).join(' ')} → ${targetsHit(s.season)} hit, ${seasonMedal(s.season) ?? 'no medal'}` : null,
    counters: trace.counters, stamps: trace.stamps, branchDay: trace.branchDay,
    branchProfit: Math.round(branchDays.reduce((a, d) => a + (d.branch!.profit ?? 0), 0)),
    calls: branchDays.filter((d) => d.branch!.call).length, sends: trace.sends,
    served: r.served, lost: r.lost, problems,
  };
}

if (process.argv[1]?.endsWith('p4Smoke.ts')) {
  const days = Number(process.argv[2] ?? 28);
  const seeds = Number(process.argv[3] ?? 3);
  const start = process.env.CAFE ? { tier: 'cafe' as const, cash: 500 } : undefined;
  let bad = 0;
  for (let i = 0; i < seeds; i++) {
    const row = p4Run(200 + i, 2, days, start);
    console.log(JSON.stringify(row));
    bad += row.problems.length;
  }
  const a = JSON.stringify(p4Run(200, 2, Math.min(days, 10)));
  const b = JSON.stringify(p4Run(200, 2, Math.min(days, 10)));
  if (a !== b) { console.log('NOT DETERMINISTIC'); bad++; }
  console.log(bad ? `FAIL (${bad})` : 'OK');
  process.exit(bad ? 1 : 0);
}
