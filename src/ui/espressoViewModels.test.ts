import { describe, expect, it } from 'vitest';
import { createRun } from '../sim/run';
import { closingViewModel, nightStructureKey, nightViewModel } from './viewModels';
import { createClosing } from './closing';

const run = () => createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }] });

describe('espresso Easter egg on the receipts', () => {
  it('shows the ambulance ride and the tab on the results and night screens', () => {
    const before = run();
    before.today = { day: 1, served: 7, lost: 0, turnedAway: 0, sales: 30, tips: 5, rent: 0, ambulance: 150 };
    const after = run();
    after.day = 2;
    after.days = [{ ...before.today, rent: 25 }];
    after.debt = 150;
    const c = closingViewModel(before, after);
    expect(c.ambulance).toBe('$150.00');
    expect(c.tab).toBe('$150.00');
    expect(c.tabPaid).toBeUndefined();
    const n = nightViewModel(after, 'p1');
    expect(n.takings!.ambulance).toBe('$150.00');
    expect(n.tab).toBe('$150.00');
    // static all night: the structure key doesn't churn with the clock
    const later = { ...n, clock: '0:10' };
    expect(nightStructureKey(later)).toBe(nightStructureKey(n));
  });

  it('a normal day has no espresso lines', () => {
    const before = run();
    before.today = { day: 1, served: 7, lost: 0, turnedAway: 0, sales: 30, tips: 5, rent: 0 };
    const after = run();
    after.days = [{ ...before.today, rent: 25 }];
    const c = closingViewModel(before, after);
    expect('ambulance' in c || 'tab' in c || 'tabPaid' in c).toBe(false);
  });

  it('renders "Ambulance ride: -$150. Worth it?"', () => {
    const el = { innerHTML: '', hidden: true, addEventListener() {}, querySelector: () => null } as unknown as HTMLElement;
    const closing = createClosing(el);
    const before = run();
    before.today = { day: 1, served: 7, lost: 0, turnedAway: 0, sales: 30, tips: 5, rent: 0, ambulance: 150, debtPaid: 12.5 };
    const after = run();
    after.days = [{ ...before.today, rent: 25 }];
    after.debt = 287.5;
    closing.render(closingViewModel(before, after));
    expect(el.innerHTML).toContain('Ambulance ride: −$150.00. Worth it?');
    expect(el.innerHTML).toContain('Hospital tab paid');
    expect(el.innerHTML).toContain('$287.50');
  });
});
