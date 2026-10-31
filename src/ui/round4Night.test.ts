import { describe, expect, it } from 'vitest';
import { createRun } from '../sim/run';
import { CONDIMENTS } from '../sim/condiments';
import { nightHtml, notebookBody, type NightUiState } from './night';
import { nightViewModel } from './viewModels';
import { stationsFromSlots } from '../sim/slots';
import { GEAR, type GearId } from '../data/gear';

function withGear(ids: GearId[]) {
  const s = run();
  const slots = [...s.slots!];
  const slotGear = [...s.slotGear!];
  ids.forEach((id, i) => { slots[i] = GEAR[id].station; slotGear[i] = id; });
  s.slots = slots; s.slotGear = slotGear;
  s.stations = stationsFromSlots(s.tier, slots, slotGear);
  return s;
}

const run = (gear = true) => createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear });
const ui = (over: Partial<NightUiState> = {}): NightUiState => ({ tab: 'tonight', spend: 'cards', drawer: null, sig: null, pitch: { kind: 'promo', text: '' }, slotSel: null, ...over });

describe('ui-3.5.1: condiment box card on the Restock tab', () => {
  it('shows the price, the corner boxes and the bar servings, with a +1 box button', () => {
    const s = run();
    s.day = 2;
    s.condimentBoxes = 2;
    s.condiments!.servings = 7;
    const vm = nightViewModel(s, 'p1');
    expect(vm.condiments).toMatchObject({ boxes: 2, servings: 7, cost: CONDIMENTS.boxCost });
    const h = nightHtml(vm, undefined, null, ui());
    expect(h).toContain(`Condiment box · $${CONDIMENTS.boxCost}`);
    expect(h).toContain('2 in the corner');
    expect(h).toContain(`7/${CONDIMENTS.servings} in the bar`);
    expect(h).toMatch(/data-action="condiment-box"(?![^>]*disabled)/);
  });
  it('the button is off when you cannot afford a box or the corner is full', () => {
    const s = run();
    s.day = 2;
    s.cash = CONDIMENTS.boxCost - 1;
    expect(nightHtml(nightViewModel(s, 'p1'), undefined, null, ui())).toMatch(/data-action="condiment-box"[^>]*disabled/);
    s.cash = 500;
    s.condimentBoxes = CONDIMENTS.maxBoxes;
    const h = nightHtml(nightViewModel(s, 'p1'), undefined, null, ui());
    expect(h).toMatch(/data-action="condiment-box"[^>]*disabled/);
    expect(h).toContain('The corner is full');
  });
  it('classic runs have no condiment card', () => {
    expect(nightHtml(nightViewModel(run(false), 'p1'), undefined, null, ui())).not.toContain('condiment-box');
  });
  it('the brief\'s cream-and-sugar warning gets a buy button', () => {
    const s = withGear(['e1', 'c1', 'd1']);
    s.cash = 100;
    s.supplies.concentrate = 10;
    s.condiments = { servings: 2 };
    s.condimentBoxes = 0;
    const vm = nightViewModel(s, 'p1');
    const a = vm.brief.alerts.find((x) => x.id === 'condiments')!;
    expect(a).toBeDefined();
    expect(a.fix?.label).toMatch(/^Buy (a box|\d+ boxes) · \$\d+$/);
    expect(a.fix?.input).toMatchObject({ kind: 'condimentBox' });
  });
});

describe('ui-3.5.1: decluttered Restock tab', () => {
  it('stock warnings sit on their jar, not again under Heads up', () => {
    const s = withGear(['e1', 'c1', 'd1']);
    s.cash = 500;
    s.supplies.beans = 1;
    s.condiments = { servings: 2 };
    const vm = nightViewModel(s, 'p1');
    const stock = vm.brief.alerts.filter((a) => (a.id.startsWith('stock:') && a.fix) || a.id === 'condiments');
    expect(stock.length).toBeGreaterThan(0);
    const h = nightHtml(vm, undefined, null, ui());
    const heads = h.split('al-card')[1]?.split('tn-more')[0] ?? '';
    for (const a of stock) {
      expect(heads).not.toContain(`data-wid="${a.id}"`);
      expect(h).toContain(`data-wid="${a.id}"`);
    }
  });
  it('crew roles and the street notebook live behind "More" drawers', () => {
    const s = run();
    s.day = 2;
    const vm = nightViewModel(s, 'p1');
    expect(nightHtml(vm, undefined, null, ui())).toContain('tn-more');
    expect(nightHtml(vm, undefined, null, ui({ drawer: 'crew' }))).toContain('Crew roles');
    expect(typeof notebookBody(vm.gear!)).toBe('string');
  });
});
