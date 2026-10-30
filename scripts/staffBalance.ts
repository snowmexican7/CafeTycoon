/**
 * P3 B15 staff balance: Gear runs with 1-2 stand-ins plus 0-3 hired bot baristas (wages on), 7 days,
 * four seeds/scenarios. Prints week-end cash, served, gross takings and bankruptcies per crew mix.
 * Usage: npx tsx scripts/staffBalance.ts
 */
import { playGear } from './gearBalance';
for (const bots of [0, 1, 2, 3]) for (const h of [1, 2]) {
  if (h + bots > 4) continue;
  const rows = [100, 101, 102, 103].map((seed, i) => playGear(h, seed, [null, 'campusTown', 'rainyWeek', 'touristSeason'][i] as never, 7, bots));
  console.log(JSON.stringify({ h, bots, cash: rows.map((r) => r.cash), served: rows.map((r) => r.served), gross: rows.map((r) => r.cashByDay.reduce((a, b) => a + b, 0)), bk: rows.filter((r) => r.bankrupt).length, tier: rows.map((r) => r.tier) }));
}
