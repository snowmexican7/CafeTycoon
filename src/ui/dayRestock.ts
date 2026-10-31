/**
 * ui-3.7.1 (Round 4 f follow-up): the day HUD's Restock button and panel. A rush delivery in the day or the closing
 * phase costs `rushCost` (RESTOCK.rushMul times the night price) and arrives at once; a condiment box costs
 * CONDIMENTS.boxCost × RESTOCK.rushMul ($7.50). Pure view model + HTML here, the DOM wiring in `mountDayRestock`.
 */
import { ECONOMY, RESTOCK } from '../data/economy';
import { CONDIMENTS } from '../sim/condiments';
import { packsThatFit } from '../sim/fridge';
import { rushCost } from '../sim/night';
import type { GameState, PlayerId, SimEvent, SupplyId } from '../sim/types';
import { neededSupplies } from '../sim/unlocks';
import { esc } from './dom';

export const RESTOCK_LOW_AT = 5;
const LABEL: Record<SupplyId, string> = { beans: 'Beans', milk: 'Milk', concentrate: 'Cold brew', flavour: 'Flavours', pastry: 'Pastries' };
const UNIT: Record<SupplyId, string> = { beans: 'shots', milk: 'steams', concentrate: 'pours', flavour: 'pumps', pastry: 'pastries' };
const ICON: Record<SupplyId | 'condiments', string> = { beans: '🫘', milk: '🥛', concentrate: '🧊', flavour: '🍯', pastry: '🥐', condiments: '🧂' };

export interface DayRestockRow {
  id: SupplyId | 'condiments';
  icon: string;
  label: string;
  /** "8 shots left", "2 boxes waiting · 12 servings in the bar". */
  stock: string;
  /** What one press brings: "+10 shots", "+1 box". */
  gets: string;
  cost: number;
  low: boolean;
  /** Why the button is off, or null when it can be bought. */
  blocked: string | null;
}
export interface DayRestockVM {
  rows: DayRestockRow[];
  cash: number;
  /** Something the shop uses is under RESTOCK_LOW_AT: the button wears a "stock is low" chip. */
  low: boolean;
}

const money = (n: number) => `$${n.toFixed(2)}`;

/** The panel's rows in the day or the closing phase, else null (the button is hidden at night: the night has its tab). */
export function dayRestockVM(state: GameState): DayRestockVM | null {
  if (state.phase !== 'day' && state.phase !== 'closing') return null;
  const rows: DayRestockRow[] = neededSupplies(state).map((id) => {
    const have = state.supplies[id] ?? 0;
    const size = ECONOMY.packs[id].size;
    const cost = rushCost(state, id, 1);
    // Pastries are an optional side (P3 B4), never "low"; same rule as the pantry card.
    const low = id !== 'pastry' && have < RESTOCK_LOW_AT;
    const blocked = packsThatFit(state, id, 1) < 1 ? 'Fridge full' : state.cash < cost ? `Need ${money(cost - state.cash)}` : null;
    return { id, icon: ICON[id], label: LABEL[id], stock: have === 0 ? 'all out!' : `${have} ${UNIT[id]} left`, gets: `+${size} ${UNIT[id]}`, cost, low, blocked };
  });
  if (state.gear === true && state.condiments) {
    const boxes = state.condimentBoxes ?? 0;
    const servings = state.condiments.servings ?? 0;
    const cost = Math.round(CONDIMENTS.boxCost * RESTOCK.rushMul * 100) / 100;
    const blocked = boxes >= CONDIMENTS.maxBoxes ? 'Corner full' : state.cash < cost ? `Need ${money(cost - state.cash)}` : null;
    rows.push({
      id: 'condiments', icon: ICON.condiments, label: 'Cream & sugar',
      stock: `${servings} servings in the bar${boxes ? ` · ${boxes} ${boxes === 1 ? 'box' : 'boxes'} waiting` : ''}`,
      gets: `+1 box (${CONDIMENTS.servings} servings)`, cost, low: servings < RESTOCK_LOW_AT && boxes === 0, blocked,
    });
  }
  return { rows, cash: state.cash, low: rows.some((r) => r.low) };
}

/** The pill button's inner HTML: the label, the key, and the "stock is low" chip when something runs low. */
export function restockButtonHtml(vm: DayRestockVM, open: boolean): string {
  return `<span aria-hidden="true">📦</span><span>Restock</span><span class="key">B</span>${vm.low && !open ? '<span class="rs-low">stock is low</span>' : ''}`;
}

/** The panel: one big row per supply with its stock, what a press brings, the rush price and a numbered button. */
export function dayRestockHtml(vm: DayRestockVM): string {
  const rows = vm.rows
    .map((r, i) => {
      const n = i + 1;
      const label = `Buy ${r.gets.replace(/^\+/, '')} of ${r.label} for ${money(r.cost)}`;
      return `<li class="rs-row ${r.low ? 'low' : ''}" data-supply="${r.id}">
        <span class="rs-ic" aria-hidden="true">${r.icon}</span>
        <span class="rs-t"><b>${esc(r.label)}</b><small>${esc(r.stock)}</small></span>
        <button class="btn ${r.blocked ? 'ghost' : 'primary'}" type="button" tabindex="-1" data-buy="${r.id}" ${r.blocked ? 'disabled' : ''} aria-label="${esc(label)}${n <= 9 ? ` (key ${n})` : ''}">
          ${n <= 9 ? `<span class="key">${n}</span>` : ''}<span class="rs-g">${esc(r.gets)}</span><b class="rs-c">${r.blocked ? esc(r.blocked) : money(r.cost)}</b></button></li>`;
    })
    .join('');
  return `<div class="rs-h"><b>Rush delivery</b><small>Arrives right away. Costs ${Math.round((RESTOCK.rushMul - 1) * 100)}% more than the night shop.</small></div>
    <ul class="rs-list">${rows}</ul>
    <div class="rs-f"><span>Press a number to buy · <span class="key">B</span> or <span class="key">Esc</span> to close</span><b>You have ${money(vm.cash)}</b></div>`;
}

/** A change key, so the panel only rebuilds when a row's text or state changes. */
export function dayRestockKey(vm: DayRestockVM | null): string {
  return vm ? JSON.stringify(vm.rows.map((r) => [r.id, r.stock, r.cost, r.blocked, r.low])) + `|${vm.cash.toFixed(2)}` : '';
}

/** The toast line for `restock.rush { by, supply, packs, cost }` ("Ana rush-ordered 10 beans for $9.00"). */
export function rushToast(e: Pick<SimEvent, 'data'>, nameOf: (id: PlayerId) => string, me?: PlayerId): string {
  const d = e.data as { by?: string; supply?: SupplyId | 'condiments'; packs?: number; cost?: number };
  const who = d.by && d.by === me ? 'You' : nameOf(d.by ?? '') || 'Someone';
  const packs = d.packs ?? 1;
  const what =
    d.supply === 'condiments'
      ? `${packs} ${packs === 1 ? 'box' : 'boxes'} of cream & sugar`
      : d.supply
        ? `${packs * ECONOMY.packs[d.supply].size} ${LABEL[d.supply].toLowerCase()}`
        : 'supplies';
  return `📦 ${who} rush-ordered ${what} for ${money(d.cost ?? 0)}`;
}

export interface DayRestockHandle {
  render(vm: DayRestockVM | null): void;
  isOpen(): boolean;
  toggle(): void;
  close(): void;
  /** Keys while the panel is open: 1-9 buy a row, B / Esc close. True when the key was used. */
  handleKey(ev: Pick<KeyboardEvent, 'code' | 'key'>): boolean;
}

/** Wire the button and the (non-modal) panel; `onBuy` gets a row id. */
export function mountDayRestock(button: HTMLButtonElement, panel: HTMLElement, onBuy: (id: SupplyId | 'condiments') => void): DayRestockHandle {
  let vm: DayRestockVM | null = null;
  let open = false;
  let lastKey = '';
  let lastBtn = '';
  const paint = () => {
    button.hidden = !vm;
    if (!vm) { open = false; panel.hidden = true; lastKey = ''; lastBtn = ''; return; }
    const b = restockButtonHtml(vm, open);
    if (b !== lastBtn) { lastBtn = b; button.innerHTML = b; }
    button.classList.toggle('low', vm.low);
    button.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    if (!open) return;
    const k = dayRestockKey(vm);
    if (k !== lastKey) { lastKey = k; panel.innerHTML = dayRestockHtml(vm); }
  };
  const buy = (id: SupplyId | 'condiments') => {
    const row = vm?.rows.find((r) => r.id === id);
    if (row && !row.blocked) onBuy(id);
  };
  button.addEventListener('click', (ev) => {
    (ev.currentTarget as HTMLElement).blur();
    open = !open;
    paint();
  });
  panel.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-buy]');
    if (!b) return;
    b.blur();
    buy(b.dataset.buy as SupplyId | 'condiments');
  });
  return {
    render(next) { vm = next; paint(); },
    isOpen: () => open && !!vm,
    toggle() { if (!vm) return; open = !open; paint(); },
    close() { if (!open) return; open = false; paint(); },
    handleKey(ev) {
      if (!open || !vm) return false;
      if (ev.code === 'Escape' || ev.code === 'KeyB') { open = false; paint(); return true; }
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(ev.code);
      if (!m) return false;
      const row = vm.rows[Number(m[1]) - 1];
      if (row) buy(row.id);
      return true;
    },
  };
}
