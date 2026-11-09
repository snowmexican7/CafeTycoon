import { describe, expect, it } from 'vitest';
import { createRun } from '../sim/run';
import { nightHtml, nightTabs, type NightUiState } from './night';
import { nightViewModel } from './viewModels';

const run = (gear: boolean) => createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], tier: 'stand', gear });
const ui = (over: Partial<NightUiState> = {}): NightUiState => ({ tab: 'tonight', spend: 'cards', drawer: null, sig: null, pitch: { kind: 'promo', text: '' }, ...over });

describe('G4f: one clear night order in Gear runs', () => {
  it('classic keeps Tonight · Menu · Spend; Gear is Restock → Menu → Gear shop → Extras (pick night: Restock, then Pick gear)', () => {
    expect(nightTabs(undefined).map((t) => t.id)).toEqual(['tonight', 'menu', 'spend']);
    const s = run(true);
    const pick = nightViewModel(s, 'p1').gear!;
    expect(nightTabs(pick).map((t) => t.label)).toEqual(['Restock', 'Pick gear', 'Menu', 'Extras']);
    s.day = 2;
    expect(nightTabs(nightViewModel(s, 'p1').gear).map((t) => t.label)).toEqual(['Restock', 'Menu', 'Gear shop', 'Extras']);
  });
  it('the Gear shop is its own tab (not under Spend), steps are numbered, and Next walks the order', () => {
    const s = run(true);
    s.day = 2;
    const vm = nightViewModel(s, 'p1');
    const h = nightHtml(vm, undefined, null, ui());
    expect(h).toContain('data-pane="gear"');
    expect(h).not.toContain('data-sv="stations"');
    expect(h).toMatch(/class="step-n"[^>]*>1<\/span>📦 Restock/);
    expect(h).toMatch(/next-step" data-action="tab" data-tab="menu"[^>]*>Next: 2 ☕ Menu ▸/);
    expect(nightHtml(vm, undefined, null, ui({ tab: 'spend' }))).toMatch(/next-step"[^>]*hidden/);
    expect(h).toContain('tn-grid flow');
  });
  it('classic boards: no gear tab, no next button, and no Stations board any more (ui-3.7.1)', () => {
    const vm = nightViewModel(run(false), 'p1');
    const h = nightHtml(vm, undefined, null, ui());
    expect(h).not.toContain('data-pane="gear"');
    expect(h).not.toContain('next-step');
    expect(h).not.toContain('data-sv="stations"');
  });
});

describe('Gear polish: night board wording', () => {
  const title = (h: string) => /<h1[^>]*>([^<]*)/.exec(h)?.[1] ?? h;
  it('Campaign\'s first night opens on Restock and does not say to pick your gear', () => {
    const s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'Sam' }], tier: 'cart', gear: true, mode: 'campaign' });
    const vm = nightViewModel(s, 'p1');
    expect(nightTabs(vm.gear).map((t) => t.label)).toEqual(['Restock', 'Menu', 'Gear shop', 'Extras']);
    expect(vm.gear?.pickNight).toBe(false);
    const restock = nightHtml(vm, undefined, null, ui({ tab: 'tonight' }));
    expect(restock).toContain('The pot is on the cart');
    expect(restock).toContain('Drip is what you can sell');
    expect(restock).not.toContain('Pick your gear');
    expect(restock).not.toContain('empty counter');
    expect(restock).toMatch(/Playing with 2/);
    const shop = nightHtml(vm, undefined, null, ui({ tab: 'gear' }));
    expect(shop).toContain('Thrift Store Special');
    expect(shop).not.toContain('Pick your gear');
  });
  it('the title says "Pick your gear" only on the gear tab of the first night', () => {
    const vm = nightViewModel(run(true), 'p1');
    expect(nightHtml(vm, undefined, null, ui({ tab: 'gear' }))).toContain('Pick your gear');
    const restock = nightHtml(vm, undefined, null, ui({ tab: 'tonight' }));
    expect(title(restock)).not.toContain('Pick your gear');
  });
  it('an empty Gear counter does not paint every jar red', () => {
    const vm = nightViewModel(run(true), 'p1');
    const h = nightHtml(vm, undefined, null, ui({ tab: 'tonight' }));
    expect(h).not.toMatch(/class="restock danger"/);
  });
  it('classic still flags an empty jar, but not the optional pastries', () => {
    const s = run(false);
    s.supplies.milk = 0;
    s.supplies.pastry = 0;
    const h = nightHtml(nightViewModel(s, 'p1'), undefined, null, ui());
    expect(h).toMatch(/class="restock danger" data-supply="milk"/);
    expect(h).not.toMatch(/class="restock danger" data-supply="pastry"/);
  });
});
