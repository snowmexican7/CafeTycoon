import type { DrinkId, ItemKind } from '../sim/types';
import { esc } from './dom';
import { itemIcon } from './icons';
import { DRINK_STEPS, type OrderTicket } from './live';

/** FB1 WP2: how recipe steps show on order tickets. A per-browser preference, like sound. */
export type RecipeHints = 'click' | 'always' | 'off';
export const RECIPE_HINTS: readonly { id: RecipeHints; label: string }[] = [
  { id: 'click', label: 'On click · default' },
  { id: 'always', label: 'Always' },
  { id: 'off', label: 'Off' },
];
export const RECIPE_HINTS_KEY = 'cafetycoon.recipeHints';
export const MAX_TICKETS = 4;
export const URGENT = 0.28;

type KV = Pick<Storage, 'getItem' | 'setItem'>;
export function loadRecipeHints(store: KV | undefined): RecipeHints {
  try {
    const v = store?.getItem(RECIPE_HINTS_KEY);
    return v === 'always' || v === 'off' || v === 'click' ? v : 'click';
  } catch {
    return 'click';
  }
}
export function saveRecipeHints(store: KV | undefined, v: RecipeHints): void {
  try {
    store?.setItem(RECIPE_HINTS_KEY, v);
  } catch {
    /* private mode: keep it for this session only */
  }
}

export const DRINK_LABEL: Record<DrinkId, string> = {
  espresso: 'Espresso', latte: 'Latte', coldBrew: 'Cold brew', icedLatte: 'Iced latte', mocha: 'Mocha', matcha: 'Matcha', special: 'Maple foam', drip: 'Drip',
};

/**
 * Which step of this drink's recipe comes next, judged only from what I'm holding (display only,
 * mirrors the station chain in live.ts). Null when the held item doesn't belong to this drink.
 */
export function nextStepIndex(drink: DrinkId, holding: ItemKind | null): number | null {
  const steps = DRINK_STEPS[drink];
  if (holding === drink) return steps.length - 1;
  if (holding === null) return 0;
  if (holding === 'grounds') return steps[0] === 'Grind' ? 1 : null;
  if (holding === 'espresso') return steps[1] === 'Pull' && steps.length > 3 ? 2 : null;
  if (holding === 'latte' && drink === 'mocha') return 3;
  return null;
}

/** Are this ticket's steps showing? Day 1 of a run opens the first ticket so new players see one recipe. */
export function stepsOpen(mode: RecipeHints, index: number, id: number, open: ReadonlySet<number>, day: number): boolean {
  if (mode === 'off') return false;
  if (mode === 'always') return true;
  return open.has(id) || (day === 1 && index === 0 && !open.has(-id - 1));
}

export interface TicketOpts {
  mode: RecipeHints;
  /** Customer ids toggled open (or, as -id-1, toggled shut on day 1's auto-open ticket). */
  open: ReadonlySet<number>;
  day: number;
  holding: ItemKind | null;
  prices: Partial<Record<DrinkId, string>>;
}

const tilt = (id: number) => (((id * 37) % 7) - 3) * 0.3;

/** The order rail's markup (pure, so it's testable without a DOM). Patience bars are patched per tick. */
export function ticketsHtml(orders: readonly OrderTicket[], o: TicketOpts): string {
  if (!orders.length) return '<div class="empty-orders">No one in line yet.<br>Grind some beans while it\'s quiet.</div>';
  const shown = orders.slice(0, MAX_TICKETS);
  return (
    shown
      .map((t, i) => {
        const open = stepsOpen(o.mode, i, t.id, o.open, o.day);
        const next = open ? nextStepIndex(t.drink, o.holding) : null;
        const clickable = o.mode === 'click';
        const steps = open
          ? `<div class="steps">${DRINK_STEPS[t.drink].map((s, k) => `<span class="${k === next ? 'next' : ''}">${s}</span>`).join('')}</div>`
          : clickable ? '<div class="peek">Tap for steps</div>' : '';
        const cls = ['ticket', t.patience < URGENT ? 'urgent' : '', t.tag ? `kind-${t.tag.tone}` : '', open ? 'open' : '', clickable ? 'tap' : ''].filter(Boolean).join(' ');
        const aria = clickable ? ` role="button" aria-expanded="${open}" aria-label="${DRINK_LABEL[t.drink]}: ${open ? 'hide' : 'show'} steps"` : '';
        return `<div class="${cls}" data-id="${t.id}"${aria} style="--r:${tilt(t.id)}deg">
          ${t.tag ? `<div class="ktag">${esc(t.tag.text)}</div>` : ''}
          <div class="ic">${itemIcon(t.drink, 38)}</div><div class="nm">${DRINK_LABEL[t.drink]}</div>
          <div class="pr">${esc(o.prices[t.drink] ?? '')}</div>
          ${steps}
          <div class="pat"><i></i></div></div>`;
      })
      .join('') + (orders.length > MAX_TICKETS ? `<div class="more">+${orders.length - MAX_TICKETS} more</div>` : '')
  );
}

/** Rebuild key for the rail: the orders plus anything that changes which steps show or which is next. */
export function ticketsKey(ordersKey: string, o: TicketOpts): string {
  return `${ordersKey}|${o.mode}|${o.day === 1 ? 1 : 0}|${[...o.open].sort((a, b) => a - b).join('.')}|${o.mode === 'off' ? '' : o.holding ?? '-'}`;
}

/** Toggle a ticket's steps. Day 1's auto-open first ticket records a "shut" marker instead. */
export function toggleTicket(open: Set<number>, id: number, wasOpen: boolean): void {
  if (wasOpen) {
    if (open.has(id)) open.delete(id);
    else open.add(-id - 1);
  } else {
    open.delete(-id - 1);
    open.add(id);
  }
}

/** Forget toggles for customers who have gone (ids are never reused within a run). */
export function pruneOpen(open: Set<number>, ids: readonly number[]): void {
  const live = new Set(ids);
  for (const k of [...open]) if (!live.has(k < 0 ? -k - 1 : k)) open.delete(k);
}
