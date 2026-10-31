import { describe, expect, it } from 'vitest';
import { barSkin, isOutdoor, leaseLines, tierLook } from '../render/tierLook';
import { createRun } from '../sim/run';
import type { GameState } from '../sim/types';
import { gainedCardHtml } from './growFx';
import { detectGrow, gainedDiff, growNudge, growSeen } from './growModel';
import { canShow, hintsStatus, hintTriggers, markSeen, NEW_HINTS, parseHints, pickHint, resetHints, setOff, snooze, SNOOZE_MS } from './hintsModel';
import { nightHtml, type NightUiState } from './night';
import { tipsField } from './pause';
import { nightViewModel } from './viewModels';

const run = (tier: 'stand' | 'cart' | 'cafe', gear = true): GameState =>
  createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier, gear });
const ui = (over: Partial<NightUiState> = {}): NightUiState => ({ tab: 'tonight', spend: 'cards', drawer: null, sig: null, pitch: { kind: 'promo', text: '' }, slotSel: null, ...over });

describe('ui-3.4.0 tier looks', () => {
  it('each tier picks its own scene; the café stays the indoor default', () => {
    expect(tierLook('stand')).toBe('stand');
    expect(tierLook('cart')).toBe('cart');
    expect(tierLook('cafe')).toBe('cafe');
    expect(tierLook(undefined)).toBe('cafe');
    expect([isOutdoor('stand'), isOutdoor('cart'), isOutdoor('cafe')]).toEqual([true, true, false]);
    expect([barSkin('stand'), barSkin('cart'), barSkin('cafe')]).toEqual(['table', 'cart', 'cabinet']);
  });
  it('the FOR LEASE sign names the next size and its price, and goes away at the café', () => {
    expect(leaseLines('cafe')).toBeNull();
    expect(leaseLines(undefined)).toBeNull();
    const stand = leaseLines('stand')!;
    expect(stand.narrow).toBe(false);
    expect(stand.lines.join(' ')).toMatch(/cart.*\$70/);
    const cart = leaseLines('cart')!;
    expect(cart.narrow).toBe(true);
    expect(cart.lines.join(' ')).toMatch(/café.*\$150/);
  });
});

describe('ui-3.4.0 grow transition', () => {
  it('detects a grow only within the same run and only upward', () => {
    expect(detectGrow(null, { seed: 1, tier: 'cart' })).toBeNull();
    expect(detectGrow({ seed: 1, tier: 'stand' }, { seed: 1, tier: 'cart' })).toEqual({ from: 'stand', to: 'cart' });
    expect(detectGrow({ seed: 1, tier: 'cart' }, { seed: 1, tier: 'cafe' })).toEqual({ from: 'cart', to: 'cafe' });
    expect(detectGrow({ seed: 1, tier: 'stand' }, { seed: 2, tier: 'cart' })).toBeNull();
    expect(detectGrow({ seed: 1, tier: 'cart' }, { seed: 1, tier: 'cart' })).toBeNull();
    expect(detectGrow({ seed: 1, tier: 'cafe' }, { seed: 1, tier: 'stand' })).toBeNull();
    expect(growSeen({ seed: 3, tier: undefined } as never)).toEqual({ seed: 3, tier: 'cafe' });
  });
  it('"What you gained" compares line, prices, traffic and rent, and lists unlocks', () => {
    const g = gainedDiff('stand', 'cart');
    expect(g.from.name).toBe('Kerbside stand');
    expect(g.to.name).toBe('Coffee cart');
    const by = Object.fromEntries(g.rows.map((r) => [r.label, r]));
    expect(by['Line holds']).toMatchObject({ from: '3 people', to: '5 people', tone: 'good' });
    expect(by['Prices you can charge']).toMatchObject({ tone: 'good' });
    expect(by['Prices you can charge']!.from).toMatch(/75%/);
    expect(by['People walking by']).toMatchObject({ tone: 'good' });
    expect(by['Rent a day']).toMatchObject({ tone: 'bad' });
    expect(g.unlocks.some((u) => /more tiles/.test(u))).toBe(true);
    expect(g.unlocks.some((u) => /Pairs/.test(u))).toBe(true);
    expect(g.crowd.to).toMatch(/pairs/i);
    const html = gainedCardHtml(g);
    expect(html).toContain('What you gained');
    expect(html).toContain('data-gained-close');
    expect(html).toContain('Coffee cart');
  });
  it('classic runs list new stations and drinks instead of gear slots', () => {
    const g = gainedDiff('stand', 'cart', false);
    expect(g.unlocks.join(' ')).toMatch(/New drinks?:/);
    expect(g.unlocks.join(' ')).not.toMatch(/back-bar/);
  });
});

describe('ui-3.4.0 night nudge', () => {
  it('shows when the next size is affordable at night, not on the Gear pick night, not at the café', () => {
    const s = run('stand');
    s.phase = 'night';
    s.day = 2;
    s.cash = 69;
    expect(growNudge(s)).toBeNull();
    s.cash = 70;
    expect(growNudge(s)).toMatchObject({ tier: 'cart', cost: 70 });
    s.day = 1;
    expect(growNudge(s)).toBeNull();
    s.day = 3;
    s.phase = 'day';
    expect(growNudge(s)).toBeNull();
    const c = run('cafe');
    c.phase = 'night';
    c.day = 2;
    c.cash = 9999;
    expect(growNudge(c)).toBeNull();
  });
  it('renders a chip that jumps to Extras ▸ Shopfront', () => {
    const s = run('stand');
    s.phase = 'night';
    s.day = 2;
    s.cash = 200;
    const h = nightHtml(nightViewModel(s, 'p1'), undefined, null, ui());
    expect(h).toMatch(/data-nudge data-action="goto" data-tab="spend" data-sub="grow"/);
    expect(h).toContain('You can afford a cart!');
    s.cash = 10;
    expect(nightHtml(nightViewModel(s, 'p1'), undefined, null, ui())).not.toContain('data-nudge');
  });
});

describe('ui-3.4.0 new-player tips', () => {
  it('each tip shows once', () => {
    let st = NEW_HINTS;
    expect(canShow(st, 'till', 0)).toBe(true);
    st = markSeen(st, 'till');
    expect(canShow(st, 'till', 0)).toBe(false);
    expect(canShow(st, 'pickup', 0)).toBe(true);
    expect(markSeen(st, 'till')).toBe(st);
  });
  it('snooze hides every tip for 15 minutes, then they come back', () => {
    const st = snooze(NEW_HINTS, 1000);
    expect(canShow(st, 'till', 1000 + SNOOZE_MS - 1)).toBe(false);
    expect(canShow(st, 'till', 1000 + SNOOZE_MS)).toBe(true);
    expect(hintsStatus(st, 1000)).toMatch(/Snoozed for 15 min/);
  });
  it('off hides them until switched back on; reset forgets what was seen', () => {
    const off = setOff(markSeen(NEW_HINTS, 'sink'), true);
    expect(canShow(off, 'till', 0)).toBe(false);
    expect(hintsStatus(off, 0)).toBe('Off');
    const on = setOff(off, false);
    expect(canShow(on, 'till', 0)).toBe(true);
    expect(canShow(on, 'sink', 0)).toBe(false);
    expect(resetHints(on).seen).toEqual([]);
  });
  it('parses saved state defensively', () => {
    expect(parseHints(null)).toEqual({ seen: [] });
    expect(parseHints('not json')).toEqual({ seen: [] });
    expect(parseHints('{"seen":["till","bogus","till"],"off":true,"snoozedUntil":5}')).toEqual({ seen: ['till'], off: true, snoozedUntil: 5 });
  });
  it('picks the right tip for the moment', () => {
    const s = run('stand');
    s.phase = 'day';
    s.customers = [];
    expect(hintTriggers(s, 'p1')).toEqual([]);
    s.customers = [{ stage: 'order' } as never];
    expect(hintTriggers(s, 'p1')).toEqual(['till', 'standPrice']);
    expect(pickHint(markSeen(NEW_HINTS, 'till'), s, 'p1', 0)).toBe('standPrice');
    s.phase = 'night';
    s.day = 2;
    s.cash = 100;
    expect(hintTriggers(s, 'p1')).toEqual(['shopfront', 'restock']);
    expect(pickHint(setOff(NEW_HINTS, true), s, 'p1', 0)).toBeNull();
  });
  it('the pause menu offers snooze, off, and show again', () => {
    const h = tipsField({ status: 'On · 6 still to show', off: false, snoozed: false });
    expect(h).toContain('data-action="tips-snooze"');
    expect(h).toContain('data-action="tips-off"');
    expect(h).toContain('data-action="tips-reset"');
    expect(tipsField({ status: 'Off', off: true, snoozed: false })).toContain('data-action="tips-on"');
  });
});
