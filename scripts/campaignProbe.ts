/**
 * Plays the first Campaign days with the test-only stand-in and the balance crew's night
 * (restock, then gear when there is a cushion). Prints the till after each day's rent.
 * Usage: npx tsx scripts/campaignProbe.ts
 */
import { playGear } from './gearBalance';
import { CAMPAIGN_START } from '../src/data/campaign';

declare const process: { argv: string[]; exit(code?: number): never };

const days = Number(process.argv[2] ?? 5);
const seeds = (process.argv[3] ?? '1,2,3,7,11').split(',').map((n) => Number(n));

let bad = 0;
console.log(`campaign start cash ${CAMPAIGN_START.cash} beans ${CAMPAIGN_START.beans} pot ${CAMPAIGN_START.pot}`);
for (const seed of seeds) {
  const r = playGear(1, seed, null, days, 0, undefined, undefined, { mode: 'campaign', cashier: true });
  const row = {
    seed,
    days: r.days,
    bankrupt: r.bankrupt,
    till: r.till,
    end: r.cash,
    served: r.served,
    lost: r.lost,
    gear: r.gear,
    drinks: r.drinks,
  };
  console.log(JSON.stringify(row));
  if (r.bankrupt || r.days < days || r.till.length < days || r.till.some((c) => c < 0)) bad++;
}
console.log(bad ? `FAIL (${bad})` : 'OK');
process.exit(bad ? 1 : 0);
