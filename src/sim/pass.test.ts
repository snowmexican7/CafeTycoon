import { describe, it, expect } from 'vitest';
import { counterInteract, stepPass } from './pass';
import { createRun, startDay } from './run';
import { interact } from './stations';
import { step } from './step';
import type { GameState } from './types';

const fresh = (): GameState => {
  const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
  const d = startDay(s);
  d.players[0].pos = { x: 6, y: 5 };
  return d;
};

describe('pass', () => {
  it('puts an unwanted drink on the pass with its stale timer', () => {
    const s = fresh();
    const p = s.players[0];
    p.holding = 'espresso';
    counterInteract(s, 'p1');
    expect(s.pass).toEqual([{ item: 'espresso', ticksLeft: 2700 }]);
    expect(p.holding).toBeNull();
    expect(s.log.at(-1)).toMatchObject({ kind: 'pass.put', data: { item: 'espresso' } });
  });

  it('keeps the drink when the pass is full', () => {
    const s = fresh();
    s.pass = [
      { item: 'espresso', ticksLeft: 10 },
      { item: 'espresso', ticksLeft: 20 },
      { item: 'coldBrew', ticksLeft: 30 },
    ];
    s.players[0].holding = 'latte';
    counterInteract(s, 'p1');
    expect(s.players[0].holding).toBe('latte');
    expect(s.pass).toHaveLength(3);
  });

  it('serves a matching customer before using the pass', () => {
    const s = fresh();
    s.customers = [{ id: 1, drink: 'latte', patienceLeft: 500, patienceMax: 1500 }];
    s.players[0].holding = 'latte';
    counterInteract(s, 'p1');
    expect(s.customers).toEqual([]);
    expect(s.pass).toEqual([]);
    expect(s.today.served).toBe(1);
  });

  it('serves the most impatient matching customer from the pass, oldest pass item first', () => {
    const s = fresh();
    s.pass = [{ item: 'latte', ticksLeft: 900 }, { item: 'latte', ticksLeft: 100 }];
    s.customers = [
      { id: 1, drink: 'latte', patienceLeft: 500, patienceMax: 1500 },
      { id: 2, drink: 'latte', patienceLeft: 200, patienceMax: 1500 },
    ];
    counterInteract(s, 'p1');
    expect(s.customers.map((c) => c.id)).toEqual([1]);
    expect(s.pass).toEqual([{ item: 'latte', ticksLeft: 900 }]);
    expect(s.today.served).toBe(1);
    expect(s.today.drinks!.latte).toBe(1);
    expect(s.log.at(-1)).toMatchObject({ kind: 'pass.serve' });
  });

  it('picks up the stalest pass drink when nobody wants one', () => {
    const s = fresh();
    s.pass = [{ item: 'coldBrew', ticksLeft: 3000 }, { item: 'espresso', ticksLeft: 50 }];
    counterInteract(s, 'p1');
    expect(s.players[0].holding).toBe('espresso');
    expect(s.pass).toEqual([{ item: 'coldBrew', ticksLeft: 3000 }]);
    expect(s.log.at(-1)).toMatchObject({ kind: 'pass.take' });
  });

  it('does nothing with empty hands and an empty pass', () => {
    const s = fresh();
    counterInteract(s, 'p1');
    expect(s.players[0].holding).toBeNull();
    expect(s.pass).toEqual([]);
  });

  it('grounds never go on the pass', () => {
    const s = fresh();
    s.players[0].holding = 'grounds';
    counterInteract(s, 'p1');
    expect(s.pass).toEqual([]);
    expect(s.players[0].holding).toBe('grounds');
  });

  it('stale drinks vanish and count as waste; day end clears without waste', () => {
    let s = fresh();
    s.pass = [{ item: 'espresso', ticksLeft: 1 }];
    stepPass(s);
    expect(s.pass).toEqual([]);
    expect(s.today.wasted).toBe(1);
    expect(s.log.at(-1)).toMatchObject({ kind: 'pass.stale' });
    s.pass = [{ item: 'coldBrew', ticksLeft: 999 }];
    s.phase = 'closing';
    s.phaseTicksLeft = 1;
    s = step(s, []);
    expect(s.pass).toEqual([]);
    expect(s.days.at(-1)!.wasted).toBe(1);
  });

  it('binning a drink counts as waste, binning grounds does not', () => {
    const s = fresh();
    s.players[0].pos = { x: 10, y: 2 };
    s.players[0].holding = 'latte';
    interact(s, 'p1');
    expect(s.players[0].holding).toBeNull();
    expect(s.today.wasted).toBe(1);
    expect(s.log.at(-1)).toMatchObject({ kind: 'trash', data: { item: 'latte' } });
    s.players[0].holding = 'grounds';
    interact(s, 'p1');
    expect(s.players[0].holding).toBeNull();
    expect(s.today.wasted).toBe(1);
  });
});
