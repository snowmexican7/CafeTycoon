import { describe, expect, it } from 'vitest';
import { createRun } from '../sim/run';
import { TICK_RATE } from '../sim/constants';
import { nightExtras } from './live';
import { menuCols, nightHtml, type NightUiState } from './night';
import {
  DEFAULT_NIGHT_LENGTH, MAX_BRIEF_ALERTS, RELAXED_FALLBACK_SEC, migrateNightLength, nightBriefVM, nightLengthChoice,
  nightLengthForSim, nightStructureKey, nightTimerVM, nightViewModel,
} from './viewModels';

const run = () => createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
const ui = (over: Partial<NightUiState> = {}): NightUiState => ({ tab: 'tonight', spend: 'cards', drawer: null, sig: null, pitch: { kind: 'craft', text: '' }, ...over } as NightUiState);
/** Visible words in an HTML fragment: tags (and their title text) stripped, tokens with a letter or digit. */
export const words = (html: string) =>
  html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const between = (html: string, a: string, b: string) => html.slice(html.indexOf(a), b ? html.indexOf(b) : undefined);

describe('FB1 WP1 night length', () => {
  it('defaults to two minutes and sends Relaxed to the sim as 0', () => {
    expect(DEFAULT_NIGHT_LENGTH).toBe(120);
    expect(nightLengthForSim(120)).toBe(120);
    expect(nightLengthForSim(0)).toBe(0);
    expect(nightLengthChoice(0)).toBe(0);
    expect(nightLengthChoice(180)).toBe(180);
  });
  it('moves the old 60 s default up once and leaves other picks alone', () => {
    expect(migrateNightLength(60)).toBe(120);
    expect(migrateNightLength(180)).toBe(180);
    expect(migrateNightLength(RELAXED_FALLBACK_SEC)).toBe(0);
    // A browser that already ran step 1 keeps a later 1:00 pick, but still loses the 600 s stand-in.
    expect(migrateNightLength(60, 1)).toBe(60);
    expect(migrateNightLength(RELAXED_FALLBACK_SEC, 1)).toBe(0);
    expect(migrateNightLength(RELAXED_FALLBACK_SEC, 2)).toBe(RELAXED_FALLBACK_SEC);
  });
  it('a relaxed night has no clock until last call', () => {
    const s = run();
    expect(nightTimerVM(s)).toMatchObject({ relaxed: false, lastCall: false });
    s.settings.nightLengthSec = 0;
    expect(nightTimerVM(s)).toMatchObject({ relaxed: true, lastCall: false });
    s.lastCall = 29 * TICK_RATE;
    expect(nightTimerVM(s)).toMatchObject({ relaxed: true, lastCall: true, lastCallClock: '0:29' });
  });
  it('last call flipping does not rebuild the board, relaxed vs timed does', () => {
    const s = run();
    s.settings.nightLengthSec = 0;
    const a = nightStructureKey(nightViewModel(s, 'p1'));
    s.lastCall = 10 * TICK_RATE;
    expect(nightStructureKey(nightViewModel(s, 'p1'))).toBe(a);
    s.settings.nightLengthSec = 120;
    expect(nightStructureKey(nightViewModel(s, 'p1'))).not.toBe(a);
  });
});

describe('FB1 WP1 night brief', () => {
  it('caps alerts at three, worst first, with a one-click restock fix', () => {
    const s = run();
    s.cash = 30;
    s.supplies.milk = 0;
    s.supplies.beans = 0;
    s.supplies.concentrate = 0;
    const b = nightViewModel(s, 'p1').brief;
    expect(b.alerts.length).toBeLessThanOrEqual(MAX_BRIEF_ALERTS);
    const order = { danger: 0, warn: 1, info: 2, good: 3 } as const;
    const sev = b.alerts.map((a) => order[a.severity]);
    expect([...sev].sort()).toEqual(sev);
    const milk = b.alerts.find((a) => a.id.startsWith('stock:milk'));
    expect(milk?.fix).toMatchObject({ action: 'fix', data: { fix: 'stock:milk:out' }, input: { kind: 'restock', supply: 'milk' } });
    expect(milk?.fix?.label).toMatch(/^\+\d+ · \$\d/);
  });
  it('a calm night has a headline and no alerts', () => {
    const s = run();
    s.cash = 500;
    const b = nightViewModel(s, 'p1').brief;
    expect(b.headline?.sub).toMatch(/walk-ins/);
    // (a single player can pour about 21 cups, so the forecast leaves a milk to go off: an info line, no more)
    expect(b.alerts.filter((a) => a.severity !== 'good' && a.id !== 'spoil')).toEqual([]);
  });
  it('grow and checkout fixes jump to their own Spend views', () => {
    const s = run();
    s.cash = 2000;
    const vm = nightViewModel(s, 'p1');
    s.days.push({ ...s.today }); // grow and checkout nudges wait for a finished day
    const { brief: _b, tips: _t, ...rest } = vm;
    const subs = nightBriefVM(rest, s).alerts.flatMap((a) => (a.fix?.action === 'goto' ? [a.fix.data.sub] : []));
    for (const sub of subs) expect(['grow', 'checkout', 'ads', 'pitch', 'cards', undefined]).toContain(sub);
  });
});

describe('FB1 WP1 night board html', () => {
  const html = (over: Partial<NightUiState> = {}, prep?: (s: ReturnType<typeof run>) => void) => {
    const s = run();
    prep?.(s);
    return nightHtml(nightViewModel(s, 'p1'), nightExtras(s, 'p1'), null, ui(over));
  };
  it('has exactly three tabs: Tonight, Menu, Spend', () => {
    const h = html();
    expect(h.match(/data-action="tab"/g)?.length).toBe(3);
    expect(h).toMatch(/Tonight/);
    expect(h).toMatch(/Menu/);
    expect(h).toMatch(/Spend/);
  });
  it('keeps each tab to about 120 visible words', () => {
    const t = html({ tab: 'tonight' }, (s) => { s.supplies.milk = 0; s.cash = 30; });
    expect(words(between(t, 'data-pane="tonight"', 'data-pane="menu"'))).toBeLessThanOrEqual(120);
    expect(words(between(t, 'data-pane="menu"', 'data-pane="spend"'))).toBeLessThanOrEqual(120);
    for (const v of ['cards', 'ads', 'pitch', 'grow', 'checkout']) {
      const h = html({ tab: 'spend', spend: v as NightUiState['spend'] });
      const start = h.indexOf(`data-sv-pane="${v}"`);
      const end = h.indexOf('data-sv-pane=', start + 20);
      const pane = h.slice(start, end > 0 ? end : h.indexOf('<div class="foot">'));
      expect(words(pane), v).toBeLessThanOrEqual(120);
    }
  });
  it('a relaxed night shows Relaxed instead of a ring', () => {
    const h = html({}, (s) => { s.settings.nightLengthSec = 0; });
    expect(h).toMatch(/pill timer relaxed/);
    expect(h).not.toMatch(/class="ring"/);
    expect(h).toMatch(/Relaxed night: opens when you are ready/);
  });
  it('menu drink cards carry −/+ price buttons and a big price', () => {
    const h = html({ tab: 'menu' });
    expect(h.match(/class="dcard/g)!.length).toBeGreaterThan(1);
    expect(h).toMatch(/class="dc-p"/);
    expect(h.match(/pr-btn/g)!.length).toBeGreaterThanOrEqual(2);
  });
});

describe('menu grid columns (fb1 menu polish)', () => {
  it('lays four drinks out 2×2, five or six three across, more four across', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(menuCols)).toEqual([1, 2, 3, 2, 3, 3, 4, 4]);
  });
});
