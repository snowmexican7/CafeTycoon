import { esc, hide, onAction, show } from './dom';
import { coin, moon, stars } from './icons';
import type { ClosingVM } from './viewModels';

const rep = (s: string) => Number.parseFloat(s) || 0;

/** End-of-day results: a receipt for the day, then on to the night shop. */
export function createClosing(container: HTMLElement): { render(vm: ClosingVM): void; show(): void; hide(): void } {
  onAction(container, (action) => {
    if (action === 'continue') hide(container);
  });
  return {
    render(vm) {
      const loss = vm.profit.startsWith('-');
      const before = rep(vm.reputationBefore);
      const after = rep(vm.reputationAfter);
      const repTrend = after > before ? 'up' : after < before ? 'down' : 'same';
      container.innerHTML = `
        <div class="paper menu results" role="dialog" aria-modal="true" aria-labelledby="res-h">
          <div class="menu-hd"><span class="badge-ic night">${moon(26)}</span><div><h2 id="res-h">${esc(vm.dayLabel)} closed</h2><p>Lights off, chairs up. Here's how it went.</p></div></div>
          <div class="profit ${loss ? 'loss' : ''}">${coin(34)}<span>${loss ? '' : '+'}${esc(vm.profit)}</span><small>today's profit</small></div>
          <div class="tiles">
            <div><b>${vm.served}</b><small>SERVED</small></div>
            <div class="${vm.lost ? 'bad' : ''}"><b>${vm.lost}</b><small>STORMED OUT</small></div>
            <div class="${vm.turnedAway ? 'bad' : ''}"><b>${vm.turnedAway}</b><small>TURNED AWAY</small></div>
          </div>
          <div class="receipt-lines">
            <div class="line"><span>Sales</span><span>${esc(vm.sales)}</span></div>
            <div class="line"><span>Tips</span><span>${esc(vm.tips)}</span></div>
            <div class="line"><span>Rent</span><span class="neg">−${esc(vm.rent)}</span></div>
            ${vm.events ? `<div class="line chaos"><span>Today: ${esc(vm.events.join(', '))}</span><span></span></div>` : ''}
            ${vm.inspection ? `<div class="line inspection ${vm.inspection}"><span>Health inspection</span><span>${vm.inspection === 'pass' ? 'PASSED' : `FAILED${vm.fines ? ` −${esc(vm.fines)}` : ''}`}</span></div>` : ''}
            ${vm.bonus ? `<div class="line"><span>Influencer bonus</span><span class="pos">+${esc(vm.bonus)}</span></div>` : ''}
            ${vm.wasted ? `<div class="line chaos"><span>Drinks wasted (spilled or stale)</span><span>${vm.wasted}</span></div>` : ''}
            ${vm.slips ? `<div class="line chaos"><span>Pratfalls on the floor</span><span>${vm.slips}</span></div>` : ''}
            ${vm.rogues ? `<div class="line chaos rogue"><span>${vm.rogues === 1 ? 'A customer went rogue (DIY)' : `${vm.rogues} customers went rogue (DIY)`}</span><span title="Their review">★★☆☆☆</span></div>` : ''}
            ${vm.tabPaid ? `<div class="line"><span>Hospital tab paid</span><span class="neg">−${esc(vm.tabPaid)}</span></div>` : ''}
            ${vm.ambulance ? `<div class="line ambulance"><span>Ambulance ride: −${esc(vm.ambulance)}. Worth it?</span><span class="neg">on the tab</span></div>` : ''}
            ${vm.tab ? `<div class="line tab"><span>Hospital tab left</span><span>${esc(vm.tab)}</span></div>` : ''}
          </div>
          <div class="money-split">
            <div><small>CASH IN THE TILL</small><b class="${vm.cash.startsWith('-') ? 'neg' : ''}">${esc(vm.cash)}</b></div>
            <div><small>PROFIT VS. START</small><b class="${vm.profitVsStart.startsWith('-') ? 'neg' : 'pos'}">${vm.profitVsStart.startsWith('-') ? '' : '+'}${esc(vm.profitVsStart)}</b><em>started with ${esc(vm.startingCash)}</em></div>
          </div>
          <div class="rep ${repTrend}"><span class="lbl">Reputation</span><span class="st">${stars(before)}</span><span class="arrow">→</span><span class="st">${stars(after)}</span>
            <b>${esc(vm.reputationAfter)}</b></div>
          <button class="btn primary big block" data-action="continue">On to the night shop</button>
        </div>`;
      container.querySelector<HTMLElement>('[data-action=continue]')?.focus({ preventScroll: true });
    },
    show: () => show(container),
    hide: () => hide(container),
  };
}
