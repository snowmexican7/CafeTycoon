import { defaultOptions, runWeek } from './balanceCore';
const o = defaultOptions(); const n = Number(process.argv[2] ?? 12); const pol = (process.argv[3] ?? 'grow') as never;
const rows: string[] = []; let cart = 0, cafe = 0, cc = 0, fc = 0, cash = 0, score = 0;
for (let i = 0; i < n; i++) {
  const w = runWeek(o, 1 + i, [...o.menus[0]], pol);
  const c = w.grew?.find((g) => g.tier === 'cart'); const f = w.grew?.find((g) => g.tier === 'cafe');
  if (c) { cart += c.day; cc++; } if (f) { cafe += f.day; fc++; }
  cash += w.finalCash; score += w.score ?? 0;
  rows.push(`${w.seed}: cart d${c?.day ?? '-'} cafe d${f?.day ?? '-'} cash ${w.finalCash} score ${w.score} served ${w.days.map((d) => d.served).join('/')}`);
}
console.log(rows.join('\n'));
console.log(`cart ${cc}/${n} avg d${(cart / (cc || 1)).toFixed(1)}  cafe ${fc}/${n} avg d${(cafe / (fc || 1)).toFixed(1)}  cash ${(cash / n).toFixed(2)} score ${(score / n).toFixed(2)}`);
