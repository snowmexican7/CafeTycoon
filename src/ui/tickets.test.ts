import { describe, expect, it } from 'vitest';
import type { OrderTicket } from './live';
import { recipeHintsField } from './pause';
import {
  loadRecipeHints, MAX_TICKETS, nextStepIndex, stackCount, pruneOpen, saveRecipeHints, stepsOpen, ticketsHtml, ticketsKey, toggleTicket, type TicketOpts,
} from './tickets';

const orders = (n: number): OrderTicket[] =>
  Array.from({ length: n }, (_, i) => ({ id: 10 + i, drink: i % 2 ? 'latte' : 'espresso', patience: 0.9 }) as OrderTicket);
const opts = (p: Partial<TicketOpts> = {}): TicketOpts => ({ mode: 'click', open: new Set(), day: 3, holding: null, prices: { espresso: '$3', latte: '$5' }, ...p });
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe('FB1 WP2 order tickets', () => {
  it('shows at most four tickets, then "+N more"', () => {
    const html = ticketsHtml(orders(6), opts());
    expect(count(html, /class="ticket /g)).toBe(MAX_TICKETS);
    expect(html).toContain('+2 more');
    expect(ticketsHtml(orders(4), opts())).not.toContain('more');
    expect(ticketsHtml([], opts())).toContain('No one in line');
  });

  it('hides steps by default and shows them for toggled ids only', () => {
    const open = new Set<number>();
    expect(count(ticketsHtml(orders(3), opts({ open })), /class="steps"/g)).toBe(0);
    expect(ticketsHtml(orders(3), opts({ open }))).toContain('aria-expanded="false"');
    toggleTicket(open, 11, false);
    const html = ticketsHtml(orders(3), opts({ open }));
    expect(count(html, /class="steps"/g)).toBe(1);
    expect(html).toMatch(/data-id="11" role="button" aria-expanded="true"/);
    toggleTicket(open, 11, true);
    expect(open.size).toBe(0);
  });

  it('"always" and "off" modes, and day 1 opens the first ticket (which can be shut)', () => {
    expect(count(ticketsHtml(orders(3), opts({ mode: 'always' })), /class="steps"/g)).toBe(3);
    const off = ticketsHtml(orders(3), opts({ mode: 'off', day: 1 }));
    expect(off).not.toContain('class="steps"');
    expect(off).not.toContain('role="button"');
    const open = new Set<number>();
    expect(stepsOpen('click', 0, 10, open, 1)).toBe(true);
    expect(stepsOpen('click', 1, 11, open, 1)).toBe(false);
    toggleTicket(open, 10, true);
    expect(stepsOpen('click', 0, 10, open, 1)).toBe(false);
    toggleTicket(open, 10, false);
    expect(stepsOpen('click', 0, 10, open, 1)).toBe(true);
  });

  it('highlights the next step from what I hold', () => {
    expect(nextStepIndex('latte', null)).toBe(0);
    expect(nextStepIndex('latte', 'grounds')).toBe(1);
    expect(nextStepIndex('latte', 'espresso')).toBe(2);
    expect(nextStepIndex('latte', 'latte')).toBe(3);
    expect(nextStepIndex('espresso', 'espresso')).toBe(2);
    expect(nextStepIndex('mocha', 'latte')).toBe(3);
    expect(nextStepIndex('coldBrew', 'grounds')).toBeNull();
    const html = ticketsHtml(orders(2), opts({ mode: 'always', holding: 'grounds' }));
    expect(html).toContain('<span class="next">Pull</span>');
  });

  it('rebuild key changes on toggle, mode and hand, never on patience', () => {
    const open = new Set<number>();
    const k = ticketsKey('a', opts({ open }));
    expect(ticketsKey('a', opts({ open: new Set() }))).toBe(k);
    toggleTicket(open, 10, false);
    expect(ticketsKey('a', opts({ open }))).not.toBe(k);
    expect(ticketsKey('a', opts({ mode: 'always' }))).not.toBe(k);
    expect(ticketsKey('a', opts({ holding: 'grounds' }))).not.toBe(k);
    expect(ticketsKey('a', opts({ mode: 'off', holding: 'grounds' }))).toBe(ticketsKey('a', opts({ mode: 'off' })));
  });

  it('prunes toggles for customers who left', () => {
    const open = new Set([10, 11, -13, -15]);
    pruneOpen(open, [11, 12]);
    expect([...open]).toEqual([11, -13]); // -13 marks id 12 (still here); -15 marks id 14 (gone)
  });

  it('stores the preference per browser with a click default', () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(loadRecipeHints(store)).toBe('click');
    saveRecipeHints(store, 'always');
    expect(loadRecipeHints(store)).toBe('always');
    m.set('cafetycoon.recipeHints', 'junk');
    expect(loadRecipeHints(store)).toBe('click');
    expect(loadRecipeHints(undefined)).toBe('click');
    expect(recipeHintsField('off')).toMatch(/value="off" selected/);
  });
});

describe('ui-3.5.1: stacked multi-drink tickets', () => {
  const opts = { mode: 'off' as const, open: new Set<number>(), day: 3, holding: null, prices: {} };
  const combo = { id: 7, drink: 'latte', patience: 0.9, order: 'office', items: [{ drink: 'espresso', done: true }, { drink: 'latte', done: false }, { drink: 'drip', done: false }] } as OrderTicket;
  it('one ticket fans out with a ×N badge for the drinks still to make, and ticks the done ones', () => {
    const h = ticketsHtml([combo], opts);
    expect(stackCount(combo)).toBe(2);
    expect(h).toContain('stack stack-2');
    expect(h).toContain('>×2<');
    expect(h).toContain('Office run · 1/3');
    expect(h.match(/class="stk-it/g)?.length).toBe(3);
    expect(h.match(/stk-it done/g)?.length).toBe(1);
  });
  it('a one-drink order has no badge or strip', () => {
    const h = ticketsHtml(orders(1), opts);
    expect(h).not.toContain('stk-');
    expect(stackCount(orders(1)[0]!)).toBe(0);
  });
});
