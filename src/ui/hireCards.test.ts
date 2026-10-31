import { describe, expect, it } from 'vitest';
import { createRun } from '../sim/run';
import { nightViewModel, staffViewModel } from './viewModels';
import { nightHtml, type NightUiState } from './night';

const ui = (over: Partial<NightUiState> = {}): NightUiState => ({
  tab: 'tonight', spend: 'cards', drawer: null, sig: null, pitch: { kind: 'promo', text: '' }, ...over,
});

describe('Round 3 hire cards (Strategist / Marketer)', () => {
  it('staffViewModel exposes hire wages and hired flags', () => {
    const s = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, gear: true });
    const vm = staffViewModel(s)!;
    expect(vm.hires.strategist.hired).toBe(false);
    expect(vm.hires.marketer.hired).toBe(false);
    expect(vm.hires.strategist.wage).toMatch(/^\$/);
    expect(vm.hires.marketer.blurb).toMatch(/walk-ins/i);
    s.staff = { strategist: true };
    expect(staffViewModel(s)!.hires.strategist.hired).toBe(true);
  });

  it('night HTML shows hire buttons with data-role, and Let go when hired', () => {
    const s = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, gear: true });
    const html = nightHtml(nightViewModel(s, 'p1'), undefined, null, ui());
    expect(html).toContain('hire-row');
    expect(html).toContain('data-role="strategist"');
    expect(html).toContain('data-role="marketer"');
    expect(html).toMatch(/Hire · \$/);
    s.staff = { strategist: true, marketer: true };
    const hired = nightHtml(nightViewModel(s, 'p1'), undefined, null, ui());
    expect(hired).toContain('Let go');
    expect(hired).toMatch(/On · \$/);
  });
});
