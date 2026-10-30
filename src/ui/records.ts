/**
 * Lifetime records (B10): a dialog from the title screen's "Records" pill, fed by
 * src/storage/recordsStore.ts. Everything here is local to this browser.
 */
import type { Records } from '../storage/recordsStore';
import { esc } from './dom';
import { SEASON } from '../sim/season';
import { PERK_IDS, PERKS, PERK_TUNING } from '../data/perks';
import type { MetaSave } from '../storage/metaStore';

/** P3 B16: the head starts, earned or not, with progress toward the locked ones. */
export interface PerkRowVM { icon: string; name: string; effect: string; unlocked: boolean; how: string }

export function perkRows(m: MetaSave): PerkRowVM[] {
  const progress: Record<string, string> = {
    nestEgg: 'Finish a week in a Gear run',
    pantry: `Serve ${PERK_TUNING.pantryServed} drinks in Gear runs (${Math.min(m.served, PERK_TUNING.pantryServed)}/${PERK_TUNING.pantryServed})`,
    wordOfMouth: 'Grow a stand into a cart',
  };
  return PERK_IDS.map((id) => ({ icon: PERKS[id].icon, name: PERKS[id].name, effect: PERKS[id].effect, unlocked: m.unlocked.includes(id), how: progress[id] ?? PERKS[id].unlock }));
}

export function perksHtml(rows: PerkRowVM[], discovered: number): string {
  return `<div class="sec-h">Head starts <small>carried between runs · pick one on the title</small></div>
      <ul class="perks">${rows
        .map((r) => `<li class="${r.unlocked ? 'on' : 'locked'}"><span class="ic" aria-hidden="true">${r.unlocked ? r.icon : '🔒'}</span><b>${esc(r.name)}</b><span>${esc(r.effect)}</span><small>${r.unlocked ? 'Unlocked' : esc(r.how)}</small></li>`)
        .join('')}</ul>
      ${discovered ? `<p class="hint">Recipe book: ${discovered} drinks discovered across your Gear runs.</p>` : ''}`;
}

export interface RecordsVM {
  empty: boolean;
  tiles: { label: string; value: string; sub: string; gold?: boolean }[];
  totals: { label: string; value: number }[];
  hall: { name: string; mvp: number; awards: number }[];
  mvps: string[];
  /** G11: the retired v2 bests, shown small under "Classic (retired)". */
  classic: string[];
  /** P4 follow-up: the season board, best first. */
  seasons: { medal: string; title: string; sub: string; live: boolean; weeks: { label: string; made: string; target: string; hit: boolean | null }[] }[];
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
    seasons: (r.seasons ?? []).map((s) => ({
      medal: s.medal === 'gold' ? '🥇' : s.medal === 'silver' ? '🥈' : s.medal === 'bronze' ? '🥉' : '🏁',
      title: `${s.hit} of ${SEASON.weeks - 1} targets · ${money(s.made)} made`,
      sub: `${s.crew.join(', ') || 'Solo'} · ${s.date}${s.done ? '' : ` · in progress (week ${s.weeksPlayed + 2} of ${SEASON.weeks})`}`,
      live: !s.done,
      weeks: (s.weeks ?? []).map((w) => ({
        label: `Week ${w.week}`,
        made: money(w.profit),
        target: w.target === null ? 'sets the bar' : money(w.target),
        hit: w.target === null ? null : w.profit >= w.target,
      })),
    })),
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

export function recordsHtml(vm: RecordsVM, extra = ''): string {
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
      ${vm.seasons.length ? `<div class="sec-h">Season board <small>four-week seasons, best first</small></div><ul class="seasons">${vm.seasons.map((s) => `<li class="${s.live ? 'live' : ''}">${seasonRowHtml(s)}</li>`).join('')}</ul>` : ''}
      <div class="sec-h">Lifetime totals</div>
      <div class="rec-tot">${totals}</div>
      <div class="sec-h">Hall of fame</div>
      ${hall}
      ${vm.mvps.length ? `<p class="hint">Recent MVPs: ${vm.mvps.map(esc).join(' · ')}</p>` : ''}
      ${extra}
      <div class="menu-btns"><button class="btn primary" data-rec="close">Close</button></div>
    </div>`;
}

/** P6: a season row; with week data it opens on tap to a week-by-week table (target vs made). */
export function seasonRowHtml(s: RecordsVM['seasons'][number]): string {
  const head = `<span class="md" aria-hidden="true">${s.medal}</span><b>${esc(s.title)}</b><small>${esc(s.sub)}</small>`;
  if (!s.weeks.length) return `<div class="srow">${head}</div>`;
  const rows = s.weeks
    .map((w) => `<tr class="${w.hit === null ? '' : w.hit ? 'hit' : 'miss'}"><th>${esc(w.label)}</th><td>${esc(w.target)}</td><td>${esc(w.made)}</td><td aria-label="${w.hit === null ? 'no target' : w.hit ? 'hit' : 'missed'}">${w.hit === null ? '—' : w.hit ? '✅' : '✖️'}</td></tr>`)
    .join('');
  return `<details><summary class="srow">${head}</summary><table class="sweeks"><thead><tr><th></th><th>Target</th><th>Made</th><th></th></tr></thead><tbody>${rows}</tbody></table></details>`;
}

export function createRecordsDialog(get: () => Records, getMeta?: () => MetaSave | undefined): { open(): void; close(): void } {
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
      let extra = '';
      try {
        const m = getMeta?.();
        if (m) extra = perksHtml(perkRows(m), m.discovered.length);
      } catch {
        /* a bad meta save only hides this section */
      }
      root.innerHTML = recordsHtml(recordsViewModel(get()), extra);
      root.hidden = false;
      root.querySelector<HTMLElement>('[data-rec=close]')?.focus();
    },
    close,
  };
}
