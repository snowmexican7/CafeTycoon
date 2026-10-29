import { readFileSync } from 'node:fs';
import { formatSummary, summarize, type BalanceReport } from './balanceCore';

/** Merge `npm run balance -- --json` reports (e.g. from parallel seed ranges) and print the B11 summary. */
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: tsx scripts/balanceSummary.ts report.json [more.json ...]');
  process.exitCode = 2;
} else {
  const weeks = files.flatMap((f) => (JSON.parse(readFileSync(f, 'utf8')) as BalanceReport).weeks);
  process.stdout.write(formatSummary(summarize(weeks)) + '\n');
}
