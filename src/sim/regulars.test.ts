import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../data/economy';
import { finishDay } from './closing';
import { addCustomer, loseCustomer, serveCustomer } from './customers';
import { LOYALTY, fairness, regularTipFactor, regularsViewModel } from './regulars';
import { createRun, startDay } from './run';
import type { GameState, Regular } from './types';
import { menuLines } from '../ui/viewModels';

const run2 = () => createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }], settings: { bots: 0 } });
const withAda = (s: GameState, loyalty?: number): Regular => {
  const r: Regular = { name: 'Ada', drink: 'latte', visits: 0, lost: 0, ...(loyalty ? { loyalty } : {}) };
  s.regulars = [r];
  return r;
};
const asAda = (s: GameState) => {
  const c = addCustomer(s, 'normal')!;
  Object.assign(c, { kind: 'regular', name: 'Ada', drink: 'latte' });
  delete c.extra;
  return c;
};
const serveAda = (s: GameState) => {
  const c = asAda(s);
  const tips = s.today.tips;
  serveCustomer(s, c, c.drink, 'p1');
  return s.today.tips - tips;
};

describe('regulars with favourites (P3 B3)', () => {
  it('gain loyalty on fair serves, up to the cap, and tip more as they do', () => {
    const s = run2();
    startDay(s);
    const r = withAda(s);
    const first = serveAda(s);
    expect(r.loyalty).toBe(1);
    for (let i = 0; i < 8; i++) serveAda(s);
    expect(r.loyalty).toBe(LOYALTY.max);
    expect(regularTipFactor(s, r)).toBeCloseTo(1 + LOYALTY.tipPerPoint * LOYALTY.max, 5);
    expect(serveAda(s)).toBeGreaterThan(first);
  });

  it('tip less and lose loyalty when their favourite is overpriced', () => {
    const s = run2();
    s.priceSteps = { latte: 6 }; // +$1.50 on $4.75 ≈ ×1.32
    startDay(s);
    const r = withAda(s, 3);
    expect(fairness(s, 'latte')).toBe(LOYALTY.gougeTip);
    serveAda(s);
    expect(r.loyalty).toBe(2);
    s.priceSteps = { latte: 1 }; // ×1.053: still fair (up to ×1.06)
    expect(fairness(s, 'latte')).toBe(1);
  });

  it('lose a heart when they storm out, and when their favourite is off the menu all day', () => {
    const s = run2();
    startDay(s);
    const r = withAda(s, 2);
    const c = asAda(s);
    s.customers = s.customers.filter((x) => x !== c);
    loseCustomer(s, c);
    expect(r.loyalty).toBe(1);
    s.menu.latte = false;
    finishDay(s);
    expect(r.loyalty).toBeUndefined();
  });

  it('shows the regulars and the fans of each drink at night', () => {
    const s = run2();
    withAda(s, 2);
    expect(regularsViewModel(s)).toEqual([{ name: 'Ada', drink: 'latte', drinkName: 'Latte', loyalty: 2, max: 5, status: 'ok' }]);
    s.menu.latte = false;
    expect(regularsViewModel(s)[0].status).toBe('off');
    s.menu.latte = true;
    s.priceSteps = { latte: 4 };
    expect(regularsViewModel(s)[0].status).toBe('pricey');
    expect(menuLines(s).find((l) => l.drink === 'latte')!.fans).toEqual(['Ada']);
    expect(ECONOMY.customers.regular.max).toBe(3);
  });
});
