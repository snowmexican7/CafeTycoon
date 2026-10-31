import { describe, it, expect } from 'vitest';
import { createRun, startDay } from '../sim/run';
import { serveCustomer } from '../sim/customers';
import { reportViewModel } from './report';
import { nightViewModel } from './viewModels';
import { nightHtml } from './night';
import type { DayStats, GameState } from '../sim/types';

const run = (): GameState => createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'Kay' }, { id: 'p2', name: 'Lou' }], settings: { bots: 0 } });
const day = (v: Partial<DayStats>): DayStats => ({ day: 1, served: 0, lost: 0, turnedAway: 0, sales: 0, tips: 0, rent: 25, ...v });

describe('manager report (P4 B3)', () => {
  it('tallies wait, takings per drink and who served at the hand-off', () => {
    const s = startDay(run());
    const c = { id: 1, drink: 'latte' as const, patienceLeft: 600, patienceMax: 1200 };
    serveCustomer(s, c, 'latte', 'p2');
    serveCustomer(s, { ...c, id: 2, patienceLeft: 1200 }, 'latte', 'p2');
    expect(s.today.waitTicks).toBe(600);
    expect(s.today.byPlayer?.p2?.serves).toBe(2);
    expect(s.today.takingsByDrink?.latte).toBeCloseTo(s.today.sales + s.today.tips, 2);
    expect(s.today.byPlayer?.p2?.takings).toBeCloseTo(s.today.sales + s.today.tips, 2);
  });

  it('builds the report from the last day, with a wait trend, ranked drinks and crew, and notes', () => {
    const s = run();
    s.days = [
      day({ day: 1, served: 20, waitTicks: 20 * 10 * 60 }),
      day({
        day: 2, served: 30, lost: 10, sales: 100, tips: 20, wages: 50, waitTicks: 30 * 18 * 60,
        drinks: { latte: 20, espresso: 10 } as DayStats['drinks'], takingsByDrink: { latte: 90, espresso: 30 },
        byPlayer: { p1: { serves: 10, takings: 40 }, p2: { serves: 20, takings: 80 } },
      }),
    ];
    const r = reportViewModel(s)!;
    expect(r.day).toBe(2);
    expect(r.takings).toBe(120);
    expect(r.walkedPct).toBe(25);
    expect([r.waitSec, r.waitDelta]).toEqual([18, 8]);
    expect(r.wagePct).toBe(42);
    expect(r.drinks.map((d) => [d.drink, d.pct])).toEqual([['latte', 75], ['espresso', 25]]);
    expect(r.crew.map((c) => c.name)).toEqual(['Lou', 'Kay']);
    expect(r.notes).toHaveLength(2);
    expect(r.notes[0]).toMatch(/25% of walk-ins/);
    expect(r.notes[1]).toMatch(/Wages took 42%/);
  });

  it('handles old saves (no tallies) and the first night (no report)', () => {
    const s = run();
    expect(reportViewModel(s)).toBeNull();
    s.days = [day({ day: 1, served: 12, sales: 50, tips: 5, drinks: { latte: 12 } as DayStats['drinks'] })];
    const r = reportViewModel(s)!;
    expect(r.waitSec).toBeNull();
    expect(r.waitDelta).toBeNull();
    expect(r.crew).toEqual([]);
    expect(r.drinks[0]).toMatchObject({ drink: 'latte', cups: 12, takings: 0 });
    expect(r.notes).toEqual(['A tidy day. Same again tomorrow?']);
  });

  it('shows a Report button and drawer on the night screen', () => {
    const s = run();
    s.days = [day({ day: 1, served: 12, sales: 50, tips: 5 })];
    s.day = 2;
    s.phase = 'night';
    const vm = nightViewModel(s, 'p1');
    expect(vm.report?.day).toBe(1);
    const ui = { tab: 'tonight', spend: 'cards', drawer: 'report', sig: null, pitch: { kind: 'promo', text: '' } } as Parameters<typeof nightHtml>[3];
    const html = nightHtml(vm, undefined, null, ui);
    expect(html).toContain('data-d="report"');
    expect(html).toMatch(/Manager(&#39;|'|&#x27;)s report · Day 1/);
  });
});
