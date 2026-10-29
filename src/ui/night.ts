import { catalogueById } from '../data/catalogue';
import { describeEffects } from '../sim/describe';
import { DRINK_INFO } from '../data/drinks';
import { ECONOMY } from '../data/economy';
import type { DrinkId, SupplyId } from '../sim/types';
import { cardArt, CATEGORY_LABEL, CATEGORY_TINT } from './cardArt';
import { esc, hide, onAction, show } from './dom';
import { coin, itemIcon, jar, moon, sun, SUPPLY_COLOR } from './icons';
import { categoryOf, nightExtrasKey, type NightExtras } from './live';
import type { NightWarning } from './nightWarnings';
import { nightStructureKey, type ForecastVM, type FreshDrinkVM, type HandCardVM, type NightVM } from './viewModels';

const SUPPLY_LABEL = { beans: 'Beans', milk: 'Milk', concentrate: 'Cold brew', flavour: 'Flavours' } as const;
const LOW_AT = 5;
const RING = 2 * Math.PI * 14;
const parseMoney = (s: string) => Number(s.replace(/[^0-9.-]/g, '')) || 0;
const tilt = (i: number) => [-1.5, 1, -0.6, 1.4, -1, 0.8, -1.2][i % 7];

function needText(cost: number, cash: number): string {
  const need = cost - cash;
  return need > 0 ? `Need $${need.toFixed(2)} more` : '';
}

const PATH_LABEL = { speed: '⚡ Speed', quality: '★ Quality', reach: '📣 Reach' } as const;

/** A card's set: owned / needed, the bonus, and a nudge when this card would complete it. */
function setLine(s: NonNullable<HandCardVM['set']>): string {
  const state = s.active ? 'on' : s.completes ? 'completes' : '';
  const head = s.active ? `${s.name} ✓ bonus on` : s.completes ? `Completes ${s.name}!` : `${s.name} set ${s.have}/${s.need}`;
  return `<span class="set ${state}" title="Own ${s.need} ${s.name} cards: ${esc(s.bonus)}"><b>${esc(head)}</b><small>${s.need} owned: ${esc(s.bonus)}</small></span>`;
}

function handCard(c: HandCardVM, i: number, cash: number): string {
  const cat = categoryOf(c.itemId);
  const cost = parseMoney(c.cost);
  return `<button class="icard ${c.affordable ? '' : 'poor'}" style="--r:${tilt(i)}deg" data-action="buy" data-item="${esc(c.itemId)}" data-cost="${cost}"
      ${c.affordable ? '' : 'disabled'} aria-label="Buy ${esc(c.name)} for ${esc(c.cost)}">
    <span class="art" style="background:${CATEGORY_TINT[cat]}">${cardArt(cat)}<span class="cat">${CATEGORY_LABEL[cat]}</span></span>
    <span class="price">${esc(c.cost.replace('.00', ''))}</span>
    <span class="rib ${c.rarity}">${c.rarity.toUpperCase()}</span>
    <span class="body"><span class="tags"><span class="path ${c.path}">${PATH_LABEL[c.path]}</span>${c.spicy ? '<span class="spicy" title="Spicy: a real downside">🌶 Spicy</span>' : ''}</span>
      <h4>${esc(c.name)}</h4>${c.ups ? `<span class="eff">${esc(c.ups)}</span>` : ''}${c.downs ? `<span class="eff down">▼ ${esc(c.downs)}</span>` : ''}
      ${c.set ? setLine(c.set) : ''}<span class="flav">${esc(c.flavor)}</span>
      <span class="dur ${c.duration === 'permanent' ? 'perm' : 'tmrw'}">${c.duration === 'permanent' ? 'PERMANENT' : 'TOMORROW ONLY'}</span></span>
    ${c.affordable ? '' : `<span class="need">${needText(cost, cash)}</span>`}
    ${c.affordable && c.cutsRent ? '<span class="rent-risk" title="Buying this leaves less than tomorrow\'s rent">Cuts into rent</span>' : ''}
  </button>`;
}

/** Tomorrow's neighbourhood forecast as a folded local paper across the top of the hand. */
function newspaper(f: ForecastVM | undefined): string {
  if (!f) return '';
  const iced = 100 - f.hotPct;
  return `<article class="paper-news" aria-label="Tomorrow's forecast: ${esc(f.name)}">
    <header class="pn-mast"><span>THE DAILY GRIND</span><small>${esc(f.edition)} edition · neighbourhood forecast</small></header>
    <h2 class="pn-head">${esc(f.headline)}</h2>
    <div class="pn-cols">
      <div class="pn-story"><div class="pn-name"><span class="pn-ic" aria-hidden="true">${f.icon}</span>${esc(f.name)}</div>
        <p>${esc(f.blurb)}</p><p class="pn-plan"><b>Crew tip:</b> ${esc(f.plan)}</p></div>
      <div class="pn-facts">
        <div class="pn-row"><b>~${f.customers}</b><small>walk-ins expected</small></div>
        <div class="pn-split" title="Hot vs iced orders tomorrow"><span class="hot" style="flex:${f.hotPct}">${f.hotPct >= 18 ? `☕ ${f.hotPct}%` : ''}</span><span class="iced" style="flex:${iced}">${iced >= 18 ? `🧊 ${iced}%` : ''}</span></div>
        ${f.effects ? `<div class="pn-eff">${esc(f.effects)}</div>` : ''}
        ${f.eventNote ? `<div class="pn-ev">⚠ ${esc(f.eventNote)}</div>` : ''}
        ${f.radio ? `<div class="pn-radio" title="Weather radio: tomorrow's events">📻 <b>Radio:</b> ${esc(f.radio)}</div>` : ''}
        <div class="pn-later">Day after: ${f.later.icon} ${esc(f.later.name)} <small>(rumour)</small></div>
      </div>
    </div>
  </article>`;
}

/** A recipe ticket: the stations in order, as chips with arrows. */
function ticketChips(steps: string[]): string {
  return `<span class="rt">${steps.map((s) => `<span>${esc(s)}</span>`).join('<i aria-hidden="true">→</i>')}<span class="hand-off">Counter</span></span>`;
}

/** "New on the menu": the drinks that joined tonight, each with its recipe ticket. */
function freshBanner(fresh: FreshDrinkVM[] | undefined): string {
  if (!fresh?.length) return '';
  return `<section class="fresh-menu" aria-label="New on the menu">
    <header><span class="fm-star" aria-hidden="true">★</span>NEW ON THE MENU<small>tomorrow customers can order ${fresh.length === 1 ? 'it' : 'them'}</small></header>
    ${fresh
      .map(
        (f) => `<div class="fm-drink" data-drink="${f.drink}">${itemIcon(f.drink, 44)}
        <div class="fm-txt"><b>${esc(f.name)} <em>${esc(f.price)}</em></b><small>${esc(f.blurb)}</small>${ticketChips(f.ticket)}
        ${f.flavour ? '<small class="fm-note">Uses the flavours jar: restock it below.</small>' : ''}</div></div>`,
      )
      .join('')}
  </section>`;
}

/** The menu board: every known drink, its ticket, and an on/off switch. */
function menuBoard(menu: { drink: DrinkId; on: boolean }[] | undefined): string {
  if (!menu?.length) return '';
  const onCount = menu.filter((m) => m.on).length;
  return `<div class="sec">Menu board</div><div class="menu-board">${menu
    .map((m) => {
      const info = DRINK_INFO[m.drink];
      const last = m.on && onCount === 1;
      return `<div class="mb-row ${m.on ? '' : 'off'}">${itemIcon(m.drink, 26)}<div class="mb-txt"><b>${esc(info.name)}</b>${ticketChips(info.ticket)}</div>
        <span class="mb-price">$${ECONOMY.prices[m.drink].toFixed(2)}</span>
        <button class="btn mini" data-action="menu" data-drink="${m.drink}" data-on="${m.on ? '0' : '1'}" ${last ? 'disabled title="Keep at least one drink on"' : ''} aria-pressed="${m.on}">${m.on ? 'On' : 'Off'}</button></div>`;
    })
    .join('')}</div>`;
}

/** The heads-up card above the receipt: a friendly paper note, never a blocker. */
function warningCard(ws: NightWarning[]): string {
  if (ws.length === 0) return '';
  const danger = ws.some((w) => w.level === 'danger');
  const anySupply = ws.some((w) => w.kind === 'supply');
  const items = ws
    .map((w) => `<li class="${w.level}" data-wid="${esc(w.id)}"><b>${esc(w.title)}</b><span>${esc(w.detail)}</span></li>`)
    .join('');
  return `<div class="warn-card ${danger ? 'danger' : 'low'}" role="status" aria-live="polite">
    <div class="wc-hd"><span class="wc-ic" aria-hidden="true">!</span>Heads up before you open</div>
    <ul>${items}</ul>
    ${anySupply ? '<button class="btn wc-jump" data-action="jump-restock">Go to restock ↓</button>' : ''}
  </div>`;
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
  handlers: { onBuy(itemId: string): void; onRestock(supply: SupplyId): void; onReady(): void; onMenu?(drink: DrinkId, on: boolean): void; onReroll?(): void },
): { render(vm: NightVM, extras?: NightExtras, room?: string | null): void; show(): void; hide(): void } {
  onAction(container, (action, el) => {
    if (action === 'buy') handlers.onBuy(el.dataset.item!);
    else if (action === 'reroll') handlers.onReroll?.();
    else if (action === 'restock') handlers.onRestock(el.dataset.supply as SupplyId);
    else if (action === 'ready') handlers.onReady();
    else if (action === 'menu') handlers.onMenu?.(el.dataset.drink as DrinkId, el.dataset.on === '1');
    else if (action === 'jump-restock') jumpToRestock();
    else if (action === 'jump-warn') flash(container.querySelector<HTMLElement>('.warn-card'));
  });
  function flash(el: HTMLElement | null): void {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    el.classList.remove('flash');
    void el.offsetWidth; // restart the animation
    el.classList.add('flash');
  }
  function jumpToRestock(): void {
    const sec = container.querySelector<HTMLElement>('.restocks');
    if (!sec) return;
    sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const flagged = container.querySelectorAll<HTMLElement>('.restock.warned');
    flagged.forEach((el) => {
      el.classList.remove('flash');
      void el.offsetWidth; // restart the animation
      el.classList.add('flash');
    });
    if (flagged.length === 0) return;
    (flagged[0]?.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? null)?.focus({ preventScroll: true });
  }
  let lastKey = '';

  function patch(vm: NightVM, extras?: NightExtras): void {
    container.querySelector('.night-head .clock')!.textContent = vm.clock;
    container.querySelector('.night-head .cash')!.textContent = vm.cash;
    const ring = container.querySelector<SVGCircleElement>('.night-head .ring .arc');
    if (ring && extras) ring.setAttribute('stroke-dasharray', `${(extras.left * RING).toFixed(1)} ${RING.toFixed(1)}`);
    for (const w of vm.warnings) {
      const li = container.querySelector<HTMLElement>(`.warn-card li[data-wid="${w.id}"]`);
      if (!li) continue;
      li.querySelector('b')!.textContent = w.title;
      li.querySelector('span')!.textContent = w.detail;
    }
    const fw = container.querySelector('.foot-warn .fw-t');
    if (fw && vm.warnings[0]) fw.textContent = vm.warnings[0].title;
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
           ${t.bonus ? `<div class="line"><span>Bonuses</span><span class="pos">+${esc(t.bonus)}</span></div>` : ''}
           ${t.fines ? `<div class="line"><span>Fines</span><span class="neg">−${esc(t.fines)}</span></div>` : ''}
           ${t.tabPaid ? `<div class="line"><span>Hospital tab paid</span><span class="neg">−${esc(t.tabPaid)}</span></div>` : ''}
           ${t.ambulance ? `<div class="line ambulance"><span>Ambulance ride. Worth it?</span><span class="neg">−${esc(t.ambulance)}</span></div>` : ''}
           <div class="line total ${t.profit.startsWith('-') ? 'loss' : ''}"><span>Profit</span><span>${t.profit.startsWith('-') ? esc(t.profit) : `+${esc(t.profit)}`}</span></div>
           ${vm.tab ? `<div class="line tab"><span>Hospital tab (half of each day's profit pays it off)</span><span>${esc(vm.tab)}</span></div>` : ''}`
        : `<h3>OPENING NIGHT</h3><p class="first">No sales yet. Spend a little on the shop, keep enough for stock, and open at dawn.</p>
           <div class="line total"><span>In the till</span><span>${esc(vm.cash)}</span></div>`;
      const stats = extras
        ? `<div class="stats"><div>${extras.served}<small>SERVED</small></div><div class="${extras.lost ? 'neg' : ''}">${extras.lost}<small>WALKED</small></div><div>${extras.reputation.toFixed(1)}★<small>RATING</small></div></div>`
        : '';
      const warned = new Map(vm.warnings.filter((w) => w.supply).map((w) => [w.supply!, w]));
      const restock = vm.restock
        .map(
          (r) => `<div class="restock ${r.count < LOW_AT || warned.has(r.supply) ? 'low' : ''} ${warned.has(r.supply) ? `warned ${warned.get(r.supply)!.level}` : ''}" data-supply="${r.supply}">${jar(Math.min(1, r.count / 30), SUPPLY_COLOR[r.supply], 26)}
            <div class="lab">${SUPPLY_LABEL[r.supply]}<small>${r.count} left${r.count <= 0 && warned.has(r.supply) ? ' · out!' : r.count < LOW_AT || warned.has(r.supply) ? ' · low!' : ''}</small></div>
            <button class="btn" data-action="restock" data-supply="${r.supply}" ${r.affordable ? '' : 'disabled'}>+${r.packSize} for ${esc(r.packCost)}</button></div>`,
        )
        .join('');
      const bought = extras?.bought ?? [];
      const cards =
        vm.hand.map((c, i) => handCard(c, i, cash)).join('') + bought.map((b, i) => boughtCard(b.itemId, vm.hand.length + i)).join('');
      const hand = newspaper(vm.forecast) + freshBanner(vm.fresh) + (cards || '<p class="empty">Nothing left to buy tonight. Restock, then open up.</p>');
      const colors = new Map((extras?.crew ?? []).map((c) => [c.id, c]));
      const ready = vm.ready
        .map((p) => {
          const c = colors.get(p.id);
          return `<span class="rp"><span class="av" style="background:${c?.color ?? '#c9b294'}">${esc(c?.initial ?? p.name[0] ?? '?')}</span>${esc(p.name)}${c?.me ? ' <em>(you)</em>' : ''}
            ${p.ready ? '<span class="ok">✓ ready</span>' : '<span class="wait">browsing…</span>'}</span>`;
        })
        .join('');
      const solo = vm.ready.length <= 1;
      const w0 = vm.warnings[0];
      const footWarn = w0
        ? `<button class="foot-warn ${vm.warnings.some((w) => w.level === 'danger') ? 'danger' : 'low'}" data-action="${vm.warnings.some((w) => w.kind === 'supply') ? 'jump-restock' : 'jump-warn'}" title="${esc(vm.warnings.map((w) => w.title).join(' · '))}"><span aria-hidden="true">⚠</span> <span class="fw-t">${esc(w0.title)}</span>${vm.warnings.length > 1 ? ` <small>+${vm.warnings.length - 1} more</small>` : ''}</button>`
        : '';
      container.innerHTML = `
        <div class="night-shade"></div>
        <div class="night-head">${moon(36)}<h1>${title} <small>${esc(sub)}</small></h1><div class="spacer"></div>
          <div class="pill timer" role="timer" aria-label="Night time left"><svg class="ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="none" stroke="#ffffff22" stroke-width="5"/><circle class="arc" cx="18" cy="18" r="14" fill="none" stroke="#ffcf7a" stroke-width="5" stroke-linecap="round" stroke-dasharray="${RING} ${RING}" transform="rotate(-90 18 18)"/></svg><span class="clock">${esc(vm.clock)}</span></div>
          <div class="pill">${coin(24)}<span class="cash">${esc(vm.cash)}</span></div>
          ${room ? `<div class="pill room"><small>ROOM</small><b>${esc(room)}</b></div>` : ''}
        </div>
        <div class="board">
          <div class="receipt">
            ${warningCard(vm.warnings)}
            <div class="paper">${receipt}${stats}</div>
            <div class="sec">Restock</div>
            <div class="restocks">${restock}</div>
            ${menuBoard(vm.menu)}
          </div>
          <div class="tabs" role="tablist"><span class="tab on" role="tab" aria-selected="true">Tonight's hand · ${vm.hand.length}</span>
            <button class="btn reroll" data-action="reroll" ${vm.reroll.affordable ? '' : 'disabled'} title="Swap the cards on the table for a fresh deal">🎲 Re-roll · ${esc(vm.reroll.cost.replace('.00', ''))}</button>
            ${vm.sets.length ? `<span class="sets-on" title="Set bonuses switched on">${vm.sets.map((n) => `<span>✓ ${esc(n)}</span>`).join('')}</span>` : ''}</div>
          <div class="hand">${hand}</div>
          <div class="foot">
            <div class="ready">${ready}</div>
            <div class="spacer"></div>
            ${footWarn}
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
