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
  espresso: 'Espresso', latte: 'Latte', coldBrew: 'Cold brew', icedLatte: 'Iced latte', mocha: 'Mocha', matcha: 'Matcha', special: 'Maple foam', drip: 'Drip', americano: 'Americano', cappuccino: 'Cappuccino', doppio: 'Doppio', sweetCream: 'Sweet cream', cafeAuLait: 'Au lait', redEye: 'Red-eye', pourOver: 'Pour-over',
};

/**
 * Which step of this drink's recipe comes next, judged only from what I'm holding (display only,
 * mirrors the station chain in live.ts). Null when the held item doesn't belong to this drink.
 */
export function nextStepIndex(drink: DrinkId, holding: ItemKind | null, pods = false, gear = false): number | null {
  const steps = ticketSteps(drink, pods, gear);
  if (holding === drink) return steps.length - 1;
  if (holding === null) return 0;
  if (pods && steps[0] === 'Pod') {
    if (holding === 'espresso') return steps.length > 2 ? 1 : null;
    if (holding === 'latte' && (drink === 'mocha' || drink === 'cappuccino')) return 2;
    return null;
  }
  if (holding === 'grounds') return steps[0] === 'Grind' ? 1 : null;
  if (holding === 'espresso') return steps[1] === 'Pull' && steps.length > 3 ? 2 : null;
  if (holding === 'latte' && (drink === 'mocha' || drink === 'cappuccino')) return 3;
  return null;
}

/** A drink's ticket steps; at a pod-only espresso bar Grind + Pull become one "Pod" step. */
export function ticketSteps(drink: DrinkId, pods = false, gear = false): string[] {
  const base = DRINK_STEPS[drink];
  // Batch/pickup: Gear runs set drinks on the pickup counter instead of handing them over.
  const steps = gear && base.at(-1) === 'Hand off' ? [...base.slice(0, -1), 'Pickup'] : base;
  return pods && steps[0] === 'Grind' && steps[1] === 'Pull' ? ['Pod', ...steps.slice(2)] : steps;
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
  /** Pod-only espresso bar (see ticketSteps). */
  pods?: boolean;
  /** Gear run: the last step is "Pickup", not "Hand off". */
  gear?: boolean;
}

/** ui-3.5.1: a multi-drink ticket's undone count (the ×N badge), or 0 for a one-drink order. */
export function stackCount(t: OrderTicket): number {
  return t.items && t.items.length > 1 ? t.items.filter((it) => !it.done).length : 0;
}

const STACK_NAME = { combo: 'Combo', office: 'Office run' } as const;

/** ui-3.5.1: the stacked ticket's strip: one small cup per drink, ticked once it's been taken. */
function stackStrip(t: OrderTicket): string {
  const items = t.items ?? [];
  const done = items.filter((it) => it.done).length;
  const name = t.order ? STACK_NAME[t.order] : 'Group order';
  return `<div class="stk-list" aria-label="${esc(name)}: ${done} of ${items.length} drinks done">${items
    .map((it) => `<span class="stk-it${it.done ? ' done' : ''}" title="${DRINK_LABEL[it.drink]}${it.done ? ' · done' : ''}">${itemIcon(it.drink, 24)}${it.done ? '<b>✓</b>' : ''}</span>`)
    .join('')}<span class="stk-nm">${esc(name)} · ${done}/${items.length}</span></div>`;
}

const tilt = (id: number) => (((id * 37) % 7) - 3) * 0.3;

/** The order rail's markup (pure, so it's testable without a DOM). Patience bars are patched per tick. */
export function ticketsHtml(orders: readonly OrderTicket[], o: TicketOpts): string {
  if (!orders.length) return `<div class="empty-orders">No one in line yet.<br>${o.pods ? 'Tidy up' : 'Grind some beans'} while it's quiet.</div>`;
  const shown = orders.slice(0, MAX_TICKETS);
  return (
    shown
      .map((t, i) => {
        const open = stepsOpen(o.mode, i, t.id, o.open, o.day);
        const next = open ? nextStepIndex(t.drink, o.holding, o.pods, o.gear) : null;
        const clickable = o.mode === 'click';
        const steps = open
          ? `<div class="steps">${ticketSteps(t.drink, o.pods, o.gear).map((s, k) => `<span class="${k === next ? 'next' : ''}">${s}</span>`).join('')}</div>`
          : clickable ? '<div class="peek">Click for steps</div>' : '';
        const n = stackCount(t);
        const cls = ['ticket', n > 1 ? `stack stack-${Math.min(n, 3)}` : '', t.pickup ? 'rung' : '', t.patience < URGENT ? 'urgent' : '', t.tag ? `kind-${t.tag.tone}` : '', open ? 'open' : '', clickable ? 'tap' : ''].filter(Boolean).join(' ');
        const aria = clickable ? ` role="button" aria-expanded="${open}" aria-label="${DRINK_LABEL[t.drink]}: ${open ? 'hide' : 'show'} steps"` : '';
        return `<div class="${cls}" data-id="${t.id}"${aria} style="--r:${tilt(t.id)}deg">
          ${t.tag ? `<div class="ktag">${esc(t.tag.text)}</div>` : ''}${t.pickup ? '<div class="rungtag">🧾 At pickup</div>' : ''}
          ${n > 1 ? `<div class="stk-badge" aria-label="${n} drinks still to make">×${n}</div>` : ''}<div class="ic">${itemIcon(t.drink, 38)}</div><div class="nm">${DRINK_LABEL[t.drink]}</div>
          <div class="pr">${esc(o.prices[t.drink] ?? '')}</div>
          ${t.items && t.items.length > 1 ? stackStrip(t) : ''}${steps}
          <div class="pat"><i></i></div></div>`;
      })
      .join('') + (orders.length > MAX_TICKETS ? `<div class="more">+${orders.length - MAX_TICKETS} more</div>` : '')
  );
}

/** Rebuild key for the rail: the orders plus anything that changes which steps show or which is next. */
export function ticketsKey(ordersKey: string, o: TicketOpts): string {
  return `${ordersKey}|${o.mode}|${o.day === 1 ? 1 : 0}|${[...o.open].sort((a, b) => a - b).join('.')}|${o.mode === 'off' ? '' : o.holding ?? '-'}|${o.pods ? 'p' : ''}${o.gear ? 'g' : ''}`;
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
