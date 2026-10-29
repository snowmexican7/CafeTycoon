import { catalogueById } from '../data/catalogue';
import { describeEffects } from '../sim/describe';
import type { SupplyId } from '../sim/types';
import { cardArt, CATEGORY_LABEL, CATEGORY_TINT } from './cardArt';
import { esc, hide, onAction, show } from './dom';
import { coin, jar, moon, sun, SUPPLY_COLOR } from './icons';
import { categoryOf, nightExtrasKey, type NightExtras } from './live';
import { nightStructureKey, type HandCardVM, type NightVM } from './viewModels';

const SUPPLY_LABEL = { beans: 'Beans', milk: 'Milk', concentrate: 'Cold brew' } as const;
const LOW_AT = 5;
const RING = 2 * Math.PI * 14;
const parseMoney = (s: string) => Number(s.replace(/[^0-9.-]/g, '')) || 0;
const tilt = (i: number) => [-1.5, 1, -0.6, 1.4, -1, 0.8, -1.2][i % 7];

function needText(cost: number, cash: number): string {
  const need = cost - cash;
  return need > 0 ? `Need $${need.toFixed(2)} more` : '';
}

function handCard(c: HandCardVM, i: number, cash: number): string {
  const cat = categoryOf(c.itemId);
  const cost = parseMoney(c.cost);
  return `<button class="icard ${c.affordable ? '' : 'poor'}" style="--r:${tilt(i)}deg" data-action="buy" data-item="${esc(c.itemId)}" data-cost="${cost}"
      ${c.affordable ? '' : 'disabled'} aria-label="Buy ${esc(c.name)} for ${esc(c.cost)}">
    <span class="art" style="background:${CATEGORY_TINT[cat]}">${cardArt(cat)}<span class="cat">${CATEGORY_LABEL[cat]}</span></span>
    <span class="price">${esc(c.cost.replace('.00', ''))}</span>
    <span class="body"><h4>${esc(c.name)}</h4><span class="eff">${esc(c.effect)}</span><span class="flav">${esc(c.flavor)}</span>
      <span class="dur ${c.duration === 'permanent' ? 'perm' : 'tmrw'}">${c.duration === 'permanent' ? 'PERMANENT' : 'TOMORROW ONLY'}</span></span>
    ${c.affordable ? '' : `<span class="need">${needText(cost, cash)}</span>`}
  </button>`;
}

function boughtCard(itemId: string, i: number): string {
  const item = catalogueById[itemId];
  if (!item) return '';
  const cat = item.category;
  return `<div class="icard sold" style="--r:${tilt(i)}deg">
    <span class="art" style="background:${CATEGORY_TINT[cat]}">${cardArt(cat)}<span class="cat">${CATEGORY_LABEL[cat]}</span></span>
    <span class="body"><h4>${esc(item.name)}</h4><span class="eff">${esc(describeEffects(item.effects))}</span><span class="flav">${esc(item.flavor)}</span></span>
    <span class="stamp">BOUGHT</span></div>`;
}

/**
 * The night shop (docs/mockups/night.png): yesterday's receipt and restock on the left, tonight's
 * hand of index cards on the right, the ready row at the bottom. Rebuilt only on structure changes;
 * the clock, cash, timer ring and "need $X more" tags are patched in place.
 */
export function createNight(
  container: HTMLElement,
  handlers: { onBuy(itemId: string): void; onRestock(supply: SupplyId): void; onReady(): void },
): { render(vm: NightVM, extras?: NightExtras, room?: string | null): void; show(): void; hide(): void } {
  onAction(container, (action, el) => {
    if (action === 'buy') handlers.onBuy(el.dataset.item!);
    else if (action === 'restock') handlers.onRestock(el.dataset.supply as SupplyId);
    else if (action === 'ready') handlers.onReady();
  });
  let lastKey = '';

  function patch(vm: NightVM, extras?: NightExtras): void {
    container.querySelector('.night-head .clock')!.textContent = vm.clock;
    container.querySelector('.night-head .cash')!.textContent = vm.cash;
    const ring = container.querySelector<SVGCircleElement>('.night-head .ring .arc');
    if (ring && extras) ring.setAttribute('stroke-dasharray', `${(extras.left * RING).toFixed(1)} ${RING.toFixed(1)}`);
    const cash = parseMoney(vm.cash);
    container.querySelectorAll<HTMLElement>('.icard.poor').forEach((card) => {
      const need = card.querySelector('.need');
      if (need) need.textContent = needText(Number(card.dataset.cost), cash);
    });
  }

  return {
    render(vm, extras, room) {
      const key = `${nightStructureKey(vm)}#${extras ? nightExtrasKey(extras) : ''}#${room ?? ''}`;
      if (key === lastKey) return patch(vm, extras);
      lastKey = key;
      const cash = parseMoney(vm.cash);
      const day = extras?.day ?? 1;
      const title = day <= 1 ? 'Opening night' : `Night ${day - 1}`;
      const sub = extras ? `· plan ${extras.weekday}, Day ${day}` : '· plan tomorrow';
      const t = vm.takings;
      const receipt = t
        ? `<h3>YESTERDAY · DAY ${day - 1}</h3>
           <div class="line"><span>Sales</span><span>${esc(t.sales)}</span></div>
           <div class="line"><span>Tips</span><span>${esc(t.tips)}</span></div>
           <div class="line"><span>Rent</span><span class="neg">−${esc(t.rent)}</span></div>
           ${t.tabPaid ? `<div class="line"><span>Hospital tab paid</span><span class="neg">−${esc(t.tabPaid)}</span></div>` : ''}
           ${t.ambulance ? `<div class="line ambulance"><span>Ambulance ride. Worth it?</span><span class="neg">−${esc(t.ambulance)}</span></div>` : ''}
           <div class="line total ${t.profit.startsWith('-') ? 'loss' : ''}"><span>Profit</span><span>${t.profit.startsWith('-') ? esc(t.profit) : `+${esc(t.profit)}`}</span></div>
           ${vm.tab ? `<div class="line tab"><span>Hospital tab (half of each day's profit pays it off)</span><span>${esc(vm.tab)}</span></div>` : ''}`
        : `<h3>OPENING NIGHT</h3><p class="first">No sales yet. Spend a little on the shop, keep enough for stock, and open at dawn.</p>
           <div class="line total"><span>In the till</span><span>${esc(vm.cash)}</span></div>`;
      const stats = extras
        ? `<div class="stats"><div>${extras.served}<small>SERVED</small></div><div class="${extras.lost ? 'neg' : ''}">${extras.lost}<small>WALKED</small></div><div>${extras.reputation.toFixed(1)}★<small>RATING</small></div></div>`
        : '';
      const restock = vm.restock
        .map(
          (r) => `<div class="restock ${r.count < LOW_AT ? 'low' : ''}">${jar(Math.min(1, r.count / 30), SUPPLY_COLOR[r.supply], 26)}
            <div class="lab">${SUPPLY_LABEL[r.supply]}<small>${r.count} left${r.count < LOW_AT ? ' · low!' : ''}</small></div>
            <button class="btn" data-action="restock" data-supply="${r.supply}" ${r.affordable ? '' : 'disabled'}>+${r.packSize} for ${esc(r.packCost)}</button></div>`,
        )
        .join('');
      const bought = extras?.bought ?? [];
      const cards =
        vm.hand.map((c, i) => handCard(c, i, cash)).join('') + bought.map((b, i) => boughtCard(b.itemId, vm.hand.length + i)).join('');
      const hand = cards || '<p class="empty">Nothing left to buy tonight. Restock, then open up.</p>';
      const colors = new Map((extras?.crew ?? []).map((c) => [c.id, c]));
      const ready = vm.ready
        .map((p) => {
          const c = colors.get(p.id);
          return `<span class="rp"><span class="av" style="background:${c?.color ?? '#c9b294'}">${esc(c?.initial ?? p.name[0] ?? '?')}</span>${esc(p.name)}${c?.me ? ' <em>(you)</em>' : ''}
            ${p.ready ? '<span class="ok">✓ ready</span>' : '<span class="wait">browsing…</span>'}</span>`;
        })
        .join('');
      const solo = vm.ready.length <= 1;
      container.innerHTML = `
        <div class="night-shade"></div>
        <div class="night-head">${moon(36)}<h1>${title} <small>${esc(sub)}</small></h1><div class="spacer"></div>
          <div class="pill timer" role="timer" aria-label="Night time left"><svg class="ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="none" stroke="#ffffff22" stroke-width="5"/><circle class="arc" cx="18" cy="18" r="14" fill="none" stroke="#ffcf7a" stroke-width="5" stroke-linecap="round" stroke-dasharray="${RING} ${RING}" transform="rotate(-90 18 18)"/></svg><span class="clock">${esc(vm.clock)}</span></div>
          <div class="pill">${coin(24)}<span class="cash">${esc(vm.cash)}</span></div>
          ${room ? `<div class="pill room"><small>ROOM</small><b>${esc(room)}</b></div>` : ''}
        </div>
        <div class="board">
          <div class="receipt">
            <div class="paper">${receipt}${stats}</div>
            <div class="sec">Restock</div>
            <div class="restocks">${restock}</div>
          </div>
          <div class="tabs" role="tablist"><span class="tab on" role="tab" aria-selected="true">Tonight's hand · ${vm.hand.length}</span>
            <span class="tab locked" title="Coming in a later phase">Upgrades <span class="chip">Soon</span></span>
            <span class="tab locked" title="Coming in a later phase">Ads <span class="chip">Soon</span></span></div>
          <div class="hand">${hand}</div>
          <div class="foot">
            <div class="ready">${ready}</div>
            <div class="spacer"></div>
            <span class="foot-note">${solo ? 'The shop opens when you are ready, or when the timer ends' : 'Shop opens when everyone is ready, or when the timer ends'}</span>
            <button class="btn primary big" data-action="ready" ${vm.meReady ? 'disabled' : ''}>${vm.meReady ? 'Ready ✓ waiting for the crew' : `${sun(24).replaceAll('#f6c35b', '#fff4e2')}Open the shop`}</button>
          </div>
        </div>`;
      patch(vm, extras);
    },
    show: () => show(container),
    hide: () => hide(container),
  };
}
