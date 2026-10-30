/**
 * Lifetime records (B10): a dialog from the title screen's "Records" pill, fed by
 * src/storage/recordsStore.ts. Everything here is local to this browser.
 */
import type { Records } from '../storage/recordsStore';
import { esc } from './dom';

export interface RecordsVM {
  empty: boolean;
  tiles: { label: string; value: string; sub: string; gold?: boolean }[];
  totals: { label: string; value: number }[];
  hall: { name: string; mvp: number; awards: number }[];
  mvps: string[];
  /** G11: the retired v2 bests, shown small under "Classic (retired)". */
  classic: string[];
}

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

export function recordsViewModel(r: Records): RecordsVM {
  const hall = Object.entries(r.hall)
    .map(([name, h]) => ({ name, ...h }))
    .sort((a, b) => b.mvp * 3 + b.awards - (a.mvp * 3 + a.awards) || a.name.localeCompare(b.name))
    .slice(0, 8);
  const t = r.totals;
  return {
    empty: r.weeks === 0,
    tiles: [
      { label: 'Best week', value: r.bestWeek ? money(r.bestWeek.score) : '—', sub: r.bestWeek ? `${r.bestWeek.crew.join(', ') || 'Solo'} · seed ${r.bestWeek.seed}` : 'Finish a week', gold: true },
      { label: 'Busiest day', value: r.bestDay ? `${r.bestDay.served} served` : '—', sub: r.bestDay ? `Day ${r.bestDay.day} · ${r.bestDay.date}` : 'Most customers in a day' },
      { label: 'Best day', value: r.bestDayProfit ? money(r.bestDayProfit.profit) : '—', sub: r.bestDayProfit ? `Day ${r.bestDayProfit.day} · ${r.bestDayProfit.date}` : 'Biggest day profit' },
      { label: 'Weeks run', value: String(r.weeks), sub: `${t.days} days in total` },
      { label: 'Longest run', value: r.longestRun ? `${r.longestRun.days} days` : '—', sub: r.longestRun ? `seed ${r.longestRun.seed}` : 'Keep going past day 7' },
      { label: 'Walked out', value: t.served + t.lost ? `${Math.round((100 * t.lost) / (t.served + t.lost))}%` : '—', sub: `${t.lost} customers lost, ever` },
    ],
    totals: [
      { label: 'customers served', value: t.served },
      { label: 'perfect serves', value: t.perfect },
      { label: 'slips', value: t.slips },
      { label: 'espressos drunk', value: t.espressos },
      { label: 'messes mopped', value: t.mopped },
    ],
    hall,
    mvps: r.mvps.map((m) => `${m.name} (${m.date})`),
    classic: r.classic
      ? [
          r.classic.bestWeek ? `Best week ${money(r.classic.bestWeek.score)}` : '',
          r.classic.bestDay ? `Busiest day ${r.classic.bestDay.served} served` : '',
          r.classic.bestDayProfit ? `Best day ${money(r.classic.bestDayProfit.profit)}` : '',
          r.classic.longestRun ? `Longest run ${r.classic.longestRun.days} days` : '',
        ].filter(Boolean)
      : [],
  };
}

export function recordsHtml(vm: RecordsVM): string {
  const tiles = vm.tiles
    .map((t) => `<div class="rec ${t.gold ? 'gold' : ''}"><small>${esc(t.label)}</small><b>${esc(t.value)}</b><span>${esc(t.sub)}</span></div>`)
    .join('');
  const totals = vm.totals.map((t) => `<span><b>${t.value.toLocaleString('en-US')}</b> ${esc(t.label)}</span>`).join('');
  const hall = vm.hall.length
    ? `<ul class="hall">${vm.hall
        .map((h) => `<li><span class="av">${esc(h.name.charAt(0).toUpperCase())}</span>${esc(h.name)}<span class="n">${h.mvp ? `🏆×${h.mvp} · ` : ''}${h.awards} award${h.awards === 1 ? '' : 's'}</span></li>`)
        .join('')}</ul>`
    : '<p class="muted">Win an award at the end of a week to get on the wall.</p>';
  return `
    <div class="paper menu" role="dialog" aria-modal="true" aria-labelledby="rec-h">
      <div class="menu-hd"><span class="badge-ic" aria-hidden="true" style="font-size:28px">🏆</span><div><h2 id="rec-h">Café records</h2>
        <p>${vm.empty ? 'No finished weeks yet. Records fill in at the end of each week.' : 'Kept in this browser. Bragging rights only.'}</p></div></div>
      <div class="rec-grid">${tiles}</div>
      ${vm.classic.length ? `<p class="hint rec-classic"><b>Classic (retired):</b> ${vm.classic.map(esc).join(' · ')}</p>` : ''}
      <div class="sec-h">Lifetime totals</div>
      <div class="rec-tot">${totals}</div>
      <div class="sec-h">Hall of fame</div>
      ${hall}
      ${vm.mvps.length ? `<p class="hint">Recent MVPs: ${vm.mvps.map(esc).join(' · ')}</p>` : ''}
      <div class="menu-btns"><button class="btn primary" data-rec="close">Close</button></div>
    </div>`;
}

export function createRecordsDialog(get: () => Records): { open(): void; close(): void } {
  const root = document.createElement('div');
  root.id = 'records';
  root.hidden = true;
  document.body.appendChild(root);
  let back: HTMLElement | null = null;
  const close = () => {
    root.hidden = true;
    back?.focus();
  };
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === root || t.closest('[data-rec=close]')) close();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  });
  return {
    open() {
      back = document.activeElement as HTMLElement | null;
      root.innerHTML = recordsHtml(recordsViewModel(get()));
      root.hidden = false;
      root.querySelector<HTMLElement>('[data-rec=close]')?.focus();
    },
    close,
  };
}
