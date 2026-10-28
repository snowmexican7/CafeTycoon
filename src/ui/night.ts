import type { SupplyId } from '../sim/types';
import { esc, hide, onAction, show } from './dom';
import type { NightVM } from './viewModels';

const SUPPLY_LABEL = { beans: 'Beans', milk: 'Milk', concentrate: 'Cold brew concentrate' } as const;

export function createNight(
  container: HTMLElement,
  handlers: { onBuy(itemId: string): void; onRestock(supply: SupplyId): void; onReady(): void },
): { render(vm: NightVM): void; show(): void; hide(): void } {
  onAction(container, (action, el) => {
    if (action === 'buy') handlers.onBuy(el.dataset.item!);
    else if (action === 'restock') handlers.onRestock(el.dataset.supply as SupplyId);
    else if (action === 'ready') handlers.onReady();
  });
  return {
    render(vm) {
      const takings = vm.takings
        ? `<div class="takings">Yesterday: sales ${esc(vm.takings.sales)} · tips ${esc(vm.takings.tips)} · rent ${esc(vm.takings.rent)} · <b>profit ${esc(vm.takings.profit)}</b></div>`
        : '<div class="takings muted">First night. Spend wisely, or don\'t.</div>';
      const cards = vm.hand.length
        ? vm.hand
            .map(
              (c) => `
          <button class="card ${c.affordable ? '' : 'poor'} ${c.duration}" data-action="buy" data-item="${esc(c.itemId)}" ${c.affordable ? '' : 'disabled'}>
            <div class="card-top"><span class="name">${esc(c.name)}</span><span class="cost">${esc(c.cost)}</span></div>
            <div class="effect">${esc(c.effect)}</div>
            <div class="flavor">${esc(c.flavor)}</div>
            <div class="tag">${c.duration === 'tomorrow' ? 'tomorrow only' : 'permanent'}</div>
          </button>`,
            )
            .join('')
        : '<p class="muted">Nothing left to buy tonight.</p>';
      const restock = vm.restock
        .map(
          (r) => `
          <button class="restock" data-action="restock" data-supply="${r.supply}" ${r.affordable ? '' : 'disabled'}>
            ${SUPPLY_LABEL[r.supply]}: <b>${r.count}</b> · +${r.packSize} for ${esc(r.packCost)}
          </button>`,
        )
        .join('');
      const ready = vm.ready.map((p) => `<span class="pill ${p.ready ? 'on' : ''}">${esc(p.name)}${p.ready ? ' ✓' : ''}</span>`).join('');
      container.innerHTML = `
        <div class="panel wide">
          <div class="night-head"><h2>Night</h2><span class="clock big">${esc(vm.clock)}</span><span class="cash big">${esc(vm.cash)}</span></div>
          ${takings}
          <h3>Tonight's hand</h3>
          <div class="hand">${cards}</div>
          <h3>Restock</h3>
          <div class="row">${restock}</div>
          <div class="row ready-row">
            <div class="pills">${ready}</div>
            <button class="primary" data-action="ready" ${vm.meReady ? 'disabled' : ''}>${vm.meReady ? 'Ready ✓' : 'Open the shop'}</button>
          </div>
        </div>`;
    },
    show: () => show(container),
    hide: () => hide(container),
  };
}
