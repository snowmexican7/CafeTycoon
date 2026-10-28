import { describe, it, expect } from 'vitest';
import { availableDrinks, spawnCustomers } from './customers';
import { createRun, startDay } from './run';
import { step } from './step';
import type { PlayerInput } from './types';
import { validateInput } from './validate';

const opts = {
  seed: 5,
  hostId: 'p1',
  players: [
    { id: 'p1', name: 'K' },
    { id: 'p2', name: 'J' },
  ],
  settings: { bots: 0 as const },
};
const menu = (playerId: string, drink: string, on: boolean) => ({ kind: 'menu', playerId, drink, on }) as PlayerInput;

describe('night menu', () => {
  it('switches a drink off at night and customers stop ordering it', () => {
    let s = step(createRun(opts), [menu('p2', 'latte', false)]);
    expect(s.menu.latte).toBe(false);
    s = startDay(s);
    expect(availableDrinks(s)).toEqual(['espresso', 'coldBrew']);
    for (let i = 0; i < 60 * 300; i++) {
      spawnCustomers(s);
      s.customers.length = Math.min(s.customers.length, 5);
    }
    expect(s.customers.some((c) => c.drink === 'latte')).toBe(false);
  });

  it('switches a drink back on', () => {
    let s = step(createRun(opts), [menu('p1', 'latte', false)]);
    s = step(s, [menu('p1', 'latte', true)]);
    expect(s.menu.latte).toBe(true);
  });

  it('never switches off the last drink', () => {
    const s = step(createRun(opts), [menu('p1', 'espresso', false), menu('p1', 'latte', false), menu('p1', 'coldBrew', false)]);
    expect(s.menu).toEqual({ espresso: false, latte: false, coldBrew: true });
  });

  it('ignores menu inputs by day, from unknown or disconnected players, and malformed ones', () => {
    const night = createRun(opts);
    const day = startDay(structuredClone(night));
    expect(step(day, [menu('p1', 'latte', false)]).menu.latte).toBe(true);
    expect(step(night, [menu('ghost', 'latte', false)]).menu.latte).toBe(true);
    const gone = structuredClone(night);
    gone.players[1].connected = false;
    expect(step(gone, [menu('p2', 'latte', false)]).menu.latte).toBe(true);
    const bot = structuredClone(night);
    bot.players[1].bot = {} as never;
    expect(step(bot, [menu('p2', 'latte', false)]).menu.latte).toBe(true);
    expect(validateInput(menu('p1', 'tea', false))).toBeNull();
    expect(validateInput({ kind: 'menu', playerId: 'p1', drink: 'latte', on: 'yes' } as unknown as PlayerInput)).toBeNull();
    expect(validateInput(menu('p1', 'latte', false))).toEqual(menu('p1', 'latte', false));
  });
});
