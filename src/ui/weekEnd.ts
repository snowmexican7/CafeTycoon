import { esc, hide, onAction, show } from './dom';
import { coin, logoCup } from './icons';
import type { Award } from '../sim/awards';
import type { WeekEndVM } from './viewModels';

const avatar = (name: string) => esc(name.trim().charAt(0).toUpperCase() || '?');

function awardCard(a: Award, i: number): string {
  return `<li class="award ${a.tone}" style="--i:${i}">
    <span class="aw-ic" aria-hidden="true">${a.icon}</span>
    <span class="aw-t"><b>${esc(a.title)}</b><span class="aw-who">${esc(a.winner)}${a.bot ? ' <em>bot</em>' : ''}</span><small>${esc(a.stat)}</small></span>
    <span class="aw-line">${esc(a.line)}</span></li>`;
}

/** The ceremony: the MVP on a podium, then the rest as little trophy cards. */
export function ceremonyHtml(awards: Award[]): string {
  if (awards.length === 0) return '<p class="muted">No awards this week. The trophies are disappointed.</p>';
  const mvp = awards.find((a) => a.id === 'mvp');
  const rest = awards.filter((a) => a !== mvp);
  const podium = mvp
    ? `<div class="mvp" role="group" aria-label="Crew MVP"><span class="crown" aria-hidden="true">🏆</span><span class="av big">${avatar(mvp.winner)}</span>
        <div><small>CREW MVP</small><b>${esc(mvp.winner)}</b><span>${esc(mvp.stat)}</span><em>${esc(mvp.line)}</em></div></div>`
    : '';
  return `${podium}<ul class="awards">${rest.map(awardCard).join('')}</ul>`;
}

export function createWeekEnd(
  container: HTMLElement,
  handlers: { onContinue(): void; onStop(): void; onBackToTitle(): void },
): { render(vm: WeekEndVM, ended: boolean): void; show(): void; hide(): void } {
  onAction(container, (action) => {
    if (action === 'continue') handlers.onContinue();
    else if (action === 'stop') handlers.onStop();
    else if (action === 'title') handlers.onBackToTitle();
    else if (action === 'copyAwards') {
      const btn = container.querySelector<HTMLElement>('[data-action=copyAwards]');
      const done = (ok: boolean) => btn && (btn.textContent = ok ? 'Copied! Paste it in the group chat' : 'Copy failed. Screenshot it instead');
      navigator.clipboard?.writeText(text).then(() => done(true), () => done(false)) ?? done(false);
    }
  });
  let text = '';
  return {
    render(vm, ended) {
      text = vm.awardsText;
      const heading = vm.bankrupt ? "The café couldn't make rent" : ended ? 'Final score' : 'The week is over!';
      const sub = vm.bankrupt ? 'The landlord changed the locks. There is always next week.' : ended ? 'Thanks for running the shop.' : 'Seven days, one café. Keep going or cash out?';
      const items = vm.itemsBought.length ? vm.itemsBought.map((n) => `<span class="chip item">${esc(n)}</span>`).join('') : '<span class="muted">Nothing. Bold.</span>';
      const buttons = ended
        ? '<button class="btn primary big block" data-action="title">Back to title</button>'
        : vm.isHost
          ? '<button class="btn primary big" data-action="continue">Keep going</button><button class="btn big" data-action="stop">See score &amp; stop</button>'
          : '<p class="waiting">Waiting for the host to decide…</p>';
      container.innerHTML = `
        <div class="paper menu weekend ${vm.bankrupt ? 'broke' : ''}" role="dialog" aria-modal="true" aria-labelledby="we-h">
          <div class="we-cols"><div class="we-main">
          <div class="menu-hd"><span class="badge-ic">${logoCup(30)}</span><div><h2 id="we-h">${heading}</h2><p>${sub}</p></div></div>
          <div class="score ${vm.score.startsWith('-') ? 'loss' : ''}">${coin(40)}<span>${vm.score.startsWith('-') ? '' : '+'}${esc(vm.score)}</span><small>${vm.fittings ? 'Profit vs. start, fittings at half price' : 'Profit vs. start'}</small></div>
          <div class="money-split">
            <div><small>CASH IN THE TILL</small><b class="${vm.cash.startsWith('-') ? 'neg' : ''}">${esc(vm.cash)}</b></div>
            ${vm.fittings ? `<div title="What your permanent upgrades would sell for: half their price"><small>FITTINGS</small><b>+${esc(vm.fittings)}</b></div>` : ''}
            <div><small>STARTED WITH</small><b>${esc(vm.startingCash)}</b></div>
          </div>
          ${vm.tab ? `<div class="receipt-lines"><div class="line tab"><span>Hospital tab still owed</span><span>${esc(vm.tab)}</span></div></div>` : ''}
          <div class="tiles">
            <div><b>${vm.daysCompleted}</b><small>DAY${vm.daysCompleted === 1 ? '' : 'S'}</small></div>
            <div><b>${vm.customersServed}</b><small>SERVED</small></div>
            <div><b>${vm.bestDay ? `Day ${vm.bestDay.day}` : '—'}</b><small>${vm.bestDay ? `BEST · ${esc(vm.bestDay.profit)}` : 'BEST DAY'}</small></div>
          </div>
          ${vm.unlocks?.length ? `<div class="unlocks" role="status"><b>🎁 Unlocked for your next run</b>${vm.unlocks.map((u) => `<span>${esc(u)}</span>`).join('')}<small>Pick it under Head start on the title screen.</small></div>` : ''}
          <div class="sec-h">Bought this run</div>
          <div class="items">${items}</div>
          <div class="menu-btns row-btns">${buttons}</div>
          <p class="hint">Seed ${vm.seed}: play it again with the same customers.</p>
          </div>
          <section class="ceremony" aria-labelledby="aw-h">
            <div class="sec-h" id="aw-h">The awards <span class="chip">${vm.lostPct} walked out</span></div>
            ${ceremonyHtml(vm.awards)}
            ${vm.awards.length ? '<button class="btn small ghost copy" data-action="copyAwards">📋 Copy awards for the group chat</button>' : ''}
          </section></div>
        </div>`;
    },
    show: () => show(container),
    hide: () => hide(container),
  };
}
