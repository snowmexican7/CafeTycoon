import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { validateInput } from './validate';
import { CHECKOUT, applyCheckoutInput, checkoutMorning, checkoutOf, checkoutSpent, nextCheckout } from './checkout';
import { computeModifiers } from './effects';
import { queueCapacity, serveCustomer } from './customers';
import { finishDay } from './closing';
import { fittingsValue } from './score';
import { nightViewModel, profitOf } from '../ui/viewModels';
import { migrateSnapshot } from '../storage/snapshotStore';
import type { CheckoutId, GameState } from './types';

const run = (seed = 1) => {
  const s = createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
  s.phase = 'night';
  return s;
};
const pick = (s: GameState, checkout: CheckoutId) => applyCheckoutInput(s, { kind: 'checkout', playerId: 'p1', checkout });

describe('checkout path (P3 B12)', () => {
  it('walks register → kiosk → Squarely in order, for the right money; switching back is free', () => {
    const s = run();
    s.cash = 500;
    expect(checkoutOf(s)).toEqual({ owned: ['register'], active: 'register' });
    pick(s, 'squarely'); // can't skip the kiosk
    expect(s.checkout).toBeUndefined();
    pick(s, 'kiosk');
    expect(s.cash).toBe(500 - CHECKOUT.kiosk.cost);
    expect(s.checkout).toEqual({ owned: ['register', 'kiosk'], active: 'kiosk', since: s.day, by: 'K' });
    pick(s, 'squarely');
    expect(s.cash).toBe(500 - CHECKOUT.kiosk.cost - CHECKOUT.squarely.cost);
    expect(nextCheckout(s)).toBeNull();
    pick(s, 'register');
    expect(s.checkout!.active).toBe('register');
    expect(s.cash).toBe(500 - CHECKOUT.kiosk.cost - CHECKOUT.squarely.cost);
    expect(checkoutSpent(s)).toBe(CHECKOUT.kiosk.cost + CHECKOUT.squarely.cost);
    const poor = run();
    poor.cash = 10;
    pick(poor, 'kiosk');
    expect(poor.checkout).toBeUndefined();
    const bot = run();
    bot.players[0].bot = {} as never;
    pick(bot, 'kiosk');
    expect(bot.checkout).toBeUndefined();
    expect(pick(startDay(run()), 'kiosk').checkout).toBeUndefined(); // not by day
    expect(validateInput({ kind: 'checkout', playerId: 'p1', checkout: 'abacus' as CheckoutId })).toBeNull();
    expect(validateInput({ kind: 'checkout', playerId: 'p1', checkout: 'kiosk' })).toEqual({ kind: 'checkout', playerId: 'p1', checkout: 'kiosk' });
  });

  it('trades speed, tips and cost: the kiosk adds a queue spot and upsells but kills tips; Squarely lifts tips for a cut', () => {
    const base = computeModifiers(run());
    const k = run();
    k.checkout = { owned: ['register', 'kiosk'], active: 'kiosk' };
    const km = computeModifiers(k);
    expect(queueCapacity(km)).toBe(queueCapacity(base) + 1);
    expect(km.patience).toBeCloseTo(base.patience * CHECKOUT.kiosk.patience);
    expect(km.tipRate).toBeCloseTo(base.tipRate + CHECKOUT.kiosk.tipRate);
    expect(km.price.latte).toBeCloseTo(base.price.latte * CHECKOUT.kiosk.price);
    const q = run();
    q.checkout = { owned: ['register', 'kiosk', 'squarely'], active: 'squarely' };
    const qm = computeModifiers(q);
    expect(queueCapacity(qm)).toBe(queueCapacity(base));
    expect(qm.tipRate).toBeCloseTo(base.tipRate + CHECKOUT.squarely.tipRate);
  });

  it('charges the Squarely cut per sale and the kiosk licence at close, on the receipt and in profit', () => {
    const q = startDay(run(3));
    q.checkout = { owned: ['register', 'kiosk', 'squarely'], active: 'squarely' };
    q.customers.push({ id: 900, drink: 'espresso', patienceLeft: 500, patienceMax: 1000 });
    const cash = q.cash;
    serveCustomer(q, q.customers[q.customers.length - 1], 'espresso', 'p1');
    const take = q.today.sales + q.today.tips;
    expect(q.today.checkoutFees).toBeCloseTo(Math.round(take * CHECKOUT.squarely.fee * 100) / 100);
    expect(q.cash).toBeCloseTo(cash + take - q.today.checkoutFees!);
    const k = startDay(run(3));
    k.checkout = { owned: ['register', 'kiosk'], active: 'kiosk' };
    const kc = k.cash;
    finishDay(k);
    const last = k.days[k.days.length - 1];
    expect(last.checkoutFees).toBe(CHECKOUT.kiosk.daily);
    expect(kc - k.cash).toBeCloseTo(last.rent + CHECKOUT.kiosk.daily);
    expect(profitOf(last)).toBeCloseTo(-last.rent - CHECKOUT.kiosk.daily);
    k.phase = 'night';
    const vm = nightViewModel(k, 'p1');
    expect(vm.takings?.checkoutFees).toBe('$2.00');
    expect(vm.checkout.active.name).toBe(CHECKOUT.kiosk.name);
    expect(vm.checkout.options.find((o) => o.id === 'squarely')!.next).toBe(true);
  });

  it('notes the first morning with a new checkout and counts installs as fittings', () => {
    const s = run();
    s.cash = 300;
    const f0 = fittingsValue(s);
    pick(s, 'kiosk');
    expect(fittingsValue(s)).toBeCloseTo(f0 + CHECKOUT.kiosk.cost * 0.5);
    startDay(s);
    expect(s.morningNotes.some((n) => n.includes('OrderBot kiosk'))).toBe(true);
    s.day += 1;
    expect(checkoutMorning(s)).toBeNull();
  });

  it('migrates v20 saves: the old kiosk and Squarely cards become installed checkouts', () => {
    const s = run();
    s.owned = [{ itemId: 'digitalKiosk', effects: [] }, { itemId: 'squarelyTerminal', effects: [] }, { itemId: 'singleOrigin', effects: [] }];
    s.hand = ['digitalKiosk', 'singleOrigin'];
    const m = migrateSnapshot(20, JSON.parse(JSON.stringify(s)))!;
    expect(m.checkout).toEqual({ owned: ['register', 'kiosk', 'squarely'], active: 'squarely' });
    expect(m.owned.map((o) => o.itemId)).toEqual(['singleOrigin']);
    expect(m.hand).toEqual(['singleOrigin']);
    const k = run();
    k.owned = [{ itemId: 'digitalKiosk', effects: [] }];
    expect(migrateSnapshot(20, JSON.parse(JSON.stringify(k)))!.checkout).toEqual({ owned: ['register', 'kiosk'], active: 'kiosk' });
    expect(migrateSnapshot(20, JSON.parse(JSON.stringify(run())))!.checkout).toBeUndefined();
  });

  it('leaves runs on the register on the same RNG stream and shape', () => {
    let a = startDay(run(31));
    let b = startDay(run(31));
    for (let i = 0; i < 600; i++) {
      a = step(a, []);
      b = step(b, []);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.checkout).toBeUndefined();
    expect(a.today.checkoutFees).toBeUndefined();
  });
});
