import { describe, expect, it } from 'vitest';
import { CONDIMENTS } from '../sim/condiments';
import { TIERS } from '../sim/growth';
import { rushCost } from '../sim/night';
import { createRun } from '../sim/run';
import type { GameState, SimEvent } from '../sim/types';
import { dayRestockHtml, dayRestockVM, mountDayRestock, rushToast } from './dayRestock';
import { growOffer, growOfferHtml } from './growOffer';
import { freshEvents, logToastLines, strategistMenuLine, TOAST_KINDS } from './logToasts';
import { nightHtml, type NightUiState } from './night';
import { closingViewModel, nightViewModel } from './viewModels';

const run = (tier: 'stand' | 'cart' | 'cafe', gear = true): GameState =>
  createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'Kennedy' }, { id: 'p2', name: 'Ana' }], settings: { bots: 0 }, tier, gear });
const ui = (over: Partial<NightUiState> = {}): NightUiState => ({ tab: 'tonight', spend: 'cards', drawer: null, sig: null, pitch: { kind: 'promo', text: '' }, ...over });
const ev = (seq: number, kind: SimEvent['kind'], data: SimEvent['data']): SimEvent => ({ seq, tick: 0, kind, data });
const names = (id: string) => ({ p1: 'Kennedy', p2: 'Ana' })[id] ?? id;

describe('ui-3.7.1 day-HUD Restock', () => {
  it('only by day or at closing; one row per supply at the rush price', () => {
    const s = run('cart');
    s.phase = 'night';
    expect(dayRestockVM(s)).toBeNull();
    s.phase = 'day';
    s.cash = 100;
    const vm = dayRestockVM(s)!;
    expect(vm.rows.length).toBeGreaterThan(0);
    for (const r of vm.rows.filter((r) => r.id !== 'condiments')) expect(r.cost).toBe(rushCost(s, r.id as never, 1));
    s.phase = 'closing';
    expect(dayRestockVM(s)).not.toBeNull();
  });
  it('cream & sugar comes by the box at $7.50 on Gear runs', () => {
    const s = run('cafe');
    s.phase = 'day';
    s.cash = 100;
    s.condiments ??= { servings: 3 };
    const row = dayRestockVM(s)!.rows.find((r) => r.id === 'condiments')!;
    expect(row.cost).toBe(7.5);
    expect(row.cost).toBe(CONDIMENTS.boxCost * 1.25);
    expect(row.label).toBe('Cream & sugar');
  });
  it('low stock wears a chip; no cash reads "Need $X"; the panel is plain English', () => {
    const s = run('cart');
    s.phase = 'day';
    s.supplies.beans = 2;
    s.cash = 1;
    const vm = dayRestockVM(s)!;
    expect(vm.low).toBe(true);
    const beans = vm.rows.find((r) => r.id === 'beans')!;
    expect(beans.blocked).toMatch(/^Need \$/);
    const h = dayRestockHtml(vm);
    expect(h).toContain('Rush delivery');
    expect(h).toContain('Costs 25% more');
    expect(h).not.toMatch(/\btap\b/i);
  });
  it('the toast names who bought what, "You" for me, and boxes of cream & sugar', () => {
    expect(rushToast(ev(1, 'restock.rush', { by: 'p2', supply: 'beans', packs: 1, cost: 9 }), names, 'p1')).toBe('📦 Ana rush-ordered 10 beans for $9.00');
    expect(rushToast(ev(1, 'restock.rush', { by: 'p1', supply: 'condiments', packs: 2, cost: 15 }), names, 'p1')).toBe('📦 You rush-ordered 2 boxes of cream & sugar for $15.00');
  });
  it('keys: B opens, a number buys, Esc closes; nothing while closed', () => {
    const s = run('cart');
    s.phase = 'day';
    s.cash = 100;
    const bought: string[] = [];
    // No DOM in these tests: a tiny stand-in element is enough for the mount's bookkeeping.
    const fake = () => ({ hidden: true, innerHTML: '', classList: { toggle() {} }, setAttribute() {}, addEventListener() {} });
    const btn = fake();
    const panel = fake();
    const h = mountDayRestock(btn as never, panel as never, (id) => bought.push(id));
    const vm = dayRestockVM(s)!;
    h.render(vm);
    expect(btn.hidden).toBe(false);
    expect(h.handleKey({ code: 'Digit1', key: '1' })).toBe(false);
    h.toggle();
    expect(panel.hidden).toBe(false);
    expect(h.handleKey({ code: 'Digit1', key: '1' })).toBe(true);
    expect(bought).toEqual([vm.rows[0].id]);
    expect(h.handleKey({ code: 'Escape', key: 'Escape' })).toBe(true);
    expect(panel.hidden).toBe(true);
    h.render(null);
    expect(btn.hidden).toBe(true);
  });
});

describe('ui-3.7.1 log toasts', () => {
  it('only fresh events of the toast kinds; a new run resets', () => {
    const st = { log: [ev(1, 'served', {}), ev(2, 'restock.rush', { by: 'p2', supply: 'milk', packs: 1, cost: 8.75 }), ev(3, 'strategist.menu', { drink: 'latte', on: true })], nextLogSeq: 4 };
    const a = freshEvents(st, 1, TOAST_KINDS);
    expect(a.events.map((e) => e.seq)).toEqual([2, 3]);
    expect(freshEvents(st, a.seen, TOAST_KINDS).events).toEqual([]);
    expect(freshEvents({ log: [ev(0, 'strategist.menu', { drink: 'mocha', on: false })], nextLogSeq: 1 }, 3, TOAST_KINDS).events).toHaveLength(1);
  });
  it('Strategist lines use the drink name; long bursts fold into "and N more"', () => {
    expect(strategistMenuLine(ev(1, 'strategist.menu', { drink: 'latte', on: true }))).toBe('🧠 Your Strategist added Latte to the menu');
    expect(strategistMenuLine(ev(1, 'strategist.menu', { drink: 'mocha', on: false }))).toBe('🧠 Your Strategist took Mocha off the menu');
    const many = Array.from({ length: 6 }, (_, i) => ev(i, 'strategist.menu', { drink: 'latte', on: true }));
    const lines = logToastLines(many, names);
    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe('…and 3 more changes');
  });
});

describe('ui-3.7.1 Strategist on the night Menu', () => {
  it('the Menu tab steps back with a note when a Strategist is hired', () => {
    const s = run('cafe');
    s.phase = 'night';
    s.day = 3;
    expect(nightHtml(nightViewModel(s, 'p1'), undefined, null, ui({ tab: 'menu' }))).not.toContain('Your Strategist sets the menu');
    s.staff = { strategist: true };
    const h = nightHtml(nightViewModel(s, 'p1'), undefined, null, ui({ tab: 'menu' }));
    expect(h).toContain('Your Strategist sets the menu</b>; you can still override until next night');
    expect(h).toMatch(/class="tab ntab on\s+quiet"/);
  });
});

describe('ui-3.7.1 Grow on the receipt', () => {
  it('offers the next tier with its cost and whether you can afford it', () => {
    const s = run('stand');
    s.phase = 'night';
    s.cash = TIERS.cart.cost - 5;
    const poor = growOffer(s)!;
    expect(poor).toMatchObject({ tier: 'cart', cost: TIERS.cart.cost, affordable: false, short: 5 });
    expect(growOfferHtml(poor)).toContain('Need $5 more');
    expect(growOfferHtml(poor)).not.toContain('data-action="grow"');
    s.cash = TIERS.cart.cost;
    const h = growOfferHtml(growOffer(s));
    expect(h).toContain(`data-action="grow" data-tier="cart"`);
    expect(h).toContain(`Grow · $${TIERS.cart.cost}`);
    const c = run('cafe');
    expect(growOffer(c)).toBeNull();
  });
  it('sits on the closing receipt (heading into the night) and in the night Receipt drawer', () => {
    const before = run('stand');
    before.phase = 'closing';
    before.cash = 200;
    const after = structuredClone(before);
    after.phase = 'night';
    after.days.push({ ...before.today });
    expect(closingViewModel(before, after).grow?.tier).toBe('cart');
    after.phase = 'weekEnd';
    expect(closingViewModel(before, after).grow).toBeUndefined();
    const n = run('stand');
    n.phase = 'night';
    n.day = 2;
    n.cash = 200;
    n.days.push({ ...n.today, day: 1 });
    expect(nightHtml(nightViewModel(n, 'p1'), undefined, null, ui({ drawer: 'receipt' }))).toContain('data-action="grow" data-tier="cart"');
  });
  it('the night board has no crew roles, card re-roll, Stations board or grow board', () => {
    const s = run('stand', false);
    s.phase = 'night';
    s.day = 2;
    s.cash = 500;
    for (const tab of ['tonight', 'menu', 'spend'] as const) {
      const h = nightHtml(nightViewModel(s, 'p1'), undefined, null, ui({ tab }));
      expect(h).not.toContain('data-action="role"');
      expect(h).not.toContain('data-action="reroll"');
      expect(h).not.toContain('data-sv="stations"');
      expect(h).not.toContain('data-sub="grow"');
      expect(h).not.toContain('Re-roll');
    }
  });
});
