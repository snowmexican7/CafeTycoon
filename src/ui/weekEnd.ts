import { esc, hide, onAction, show } from './dom';
import { coin, logoCup } from './icons';
import type { WeekEndVM } from './viewModels';

export function createWeekEnd(
  container: HTMLElement,
  handlers: { onContinue(): void; onStop(): void; onBackToTitle(): void },
): { render(vm: WeekEndVM, ended: boolean): void; show(): void; hide(): void } {
  onAction(container, (action) => {
    if (action === 'continue') handlers.onContinue();
    else if (action === 'stop') handlers.onStop();
    else if (action === 'title') handlers.onBackToTitle();
  });
  return {
    render(vm, ended) {
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
          <div class="menu-hd"><span class="badge-ic">${logoCup(30)}</span><div><h2 id="we-h">${heading}</h2><p>${sub}</p></div></div>
          <div class="score">${coin(40)}<span>${esc(vm.score)}</span></div>
          <div class="tiles">
            <div><b>${vm.daysCompleted}</b><small>DAY${vm.daysCompleted === 1 ? '' : 'S'}</small></div>
            <div><b>${vm.customersServed}</b><small>SERVED</small></div>
            <div><b>${vm.bestDay ? `Day ${vm.bestDay.day}` : '—'}</b><small>${vm.bestDay ? `BEST · ${esc(vm.bestDay.profit)}` : 'BEST DAY'}</small></div>
          </div>
          <div class="sec-h">Bought this run</div>
          <div class="items">${items}</div>
          <div class="menu-btns row-btns">${buttons}</div>
          <p class="hint">Seed ${vm.seed}: play it again with the same customers.</p>
        </div>`;
    },
    show: () => show(container),
    hide: () => hide(container),
  };
}
