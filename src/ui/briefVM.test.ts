import { describe, expect, it } from 'vitest';
import { createRun } from '../sim/run';
import { nightBrief } from '../sim/brief';
import { nightViewModel } from './viewModels';

const run = () => createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });

describe('Tonight alerts come from the sim brief (FB1)', () => {
  it('shows the sim alerts by id, with the restock fix the sim worked out', () => {
    const s = run();
    s.cash = 200;
    s.supplies.milk = 0;
    const sim = nightBrief(s).alerts;
    const b = nightViewModel(s, 'p1').brief;
    const milk = b.alerts.find((a) => a.id === 'stock:milk:out')!;
    expect(milk.text).toBe(sim.find((a) => a.id === 'stock:milk:out')!.text);
    expect(milk.fix?.input).toEqual(sim.find((a) => a.id === 'stock:milk:out')!.fix);
    expect(milk.icon).toBe('🥛');
  });

  it('carries the sold-out note from yesterday with a restock fix', () => {
    const s = run();
    s.cash = 200;
    s.days.push({ ...s.today, soldOutWalkouts: 3 } as never);
    const a = nightViewModel(s, 'p1').brief.alerts.find((x) => x.id === 'soldOut');
    expect(a?.text).toMatch(/3 people walked away/);
    expect(a?.icon).toBe('🪧');
  });

  it('waits for a finished day before the grow and checkout nudges', () => {
    const s = run();
    s.cash = 2000;
    expect(nightViewModel(s, 'p1').brief.alerts.some((a) => a.id === 'grow' || a.id === 'checkout')).toBe(false);
    s.days.push({ ...s.today });
    const ids = nightViewModel(s, 'p1').brief.alerts.map((a) => a.id);
    expect(ids.some((id) => id === 'grow' || id === 'checkout')).toBe(true);
  });
});

describe('night clock pill ready count (FB1)', () => {
  it('reports readied humans against those needed', async () => {
    const { nightTimerVM } = await import('./viewModels');
    const s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'J' }], settings: { bots: 0 } });
    s.ready = ['p1'];
    expect(nightTimerVM(s)).toMatchObject({ ready: 1, needed: 2 });
  });
});
