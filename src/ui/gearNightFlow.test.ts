import { describe, expect, it } from 'vitest';
import { createRun } from '../sim/run';
import { nightHtml, nightTabs, type NightUiState } from './night';
import { nightViewModel } from './viewModels';

const run = (gear: boolean) => createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear });
const ui = (over: Partial<NightUiState> = {}): NightUiState => ({ tab: 'tonight', spend: 'cards', drawer: null, sig: null, pitch: { kind: 'promo', text: '' }, slotSel: null, ...over });

describe('G4f: one clear night order in Gear runs', () => {
  it('classic keeps Tonight · Menu · Spend; Gear is Restock → Gear shop → Menu → Extras (pick night: gear first)', () => {
    expect(nightTabs(undefined).map((t) => t.id)).toEqual(['tonight', 'menu', 'spend']);
    const s = run(true);
    const pick = nightViewModel(s, 'p1').gear!;
    expect(nightTabs(pick).map((t) => t.label)).toEqual(['Pick gear', 'Restock', 'Menu', 'Extras']);
    s.day = 2;
    expect(nightTabs(nightViewModel(s, 'p1').gear).map((t) => t.label)).toEqual(['Restock', 'Gear shop', 'Menu', 'Extras']);
  });
  it('the Gear shop is its own tab (not under Spend), steps are numbered, and Next walks the order', () => {
    const s = run(true);
    s.day = 2;
    const vm = nightViewModel(s, 'p1');
    const h = nightHtml(vm, undefined, null, ui());
    expect(h).toContain('data-pane="gear"');
    expect(h).not.toContain('data-sv="stations"');
    expect(h).toMatch(/class="step-n"[^>]*>1<\/span>📦 Restock/);
    expect(h).toMatch(/next-step" data-action="tab" data-tab="gear"[^>]*>Next: 2 ⚙️ Gear shop ▸/);
    expect(nightHtml(vm, undefined, null, ui({ tab: 'spend' }))).toMatch(/next-step"[^>]*hidden/);
    expect(h).toContain('tn-grid flow');
  });
  it('classic boards are unchanged: no gear tab, no next button', () => {
    const vm = nightViewModel(run(false), 'p1');
    const h = nightHtml(vm, undefined, null, ui());
    expect(h).not.toContain('data-pane="gear"');
    expect(h).not.toContain('next-step');
    expect(h).toContain('data-sv="stations"');
  });
});
