import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../../data/economy';
import { createRun, startDay } from '../run';
import { step } from '../step';
import type { GameState, Player } from '../types';
import { chainFor } from './brain';

/** One human p1 who never moves, `bots` bot baristas, no arrivals, and a long day. */
function cafe(bots: number): GameState {
  const s = createRun({ seed: 2, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots, dayLengthSec: 600 } });
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  return startDay(s);
}

function runUntil(state: GameState, done: (s: GameState) => boolean, maxTicks: number): GameState {
  let s = state;
  for (let i = 0; i < maxTicks; i++) {
    if (done(s)) return s;
    s = step(s, []);
  }
  if (done(s)) return s;
  throw new Error(`condition not met within ${maxTicks} ticks`);
}

const bot = (s: GameState, id = 'bot-1'): Player => s.players.find((p) => p.id === id)!;
const huge = { patienceLeft: 10_000, patienceMax: 10_000 };

describe('bot brain', () => {
  it('chains each drink through its stations, finishing at the counter', () => {
    const ids = (d: Parameters<typeof chainFor>[0], f: 'serve' | 'put') =>
      chainFor(d, f).map((x) => (x.kind === 'use' ? `${x.station}:${x.action}` : 'idle'));
    expect(ids('espresso', 'serve')).toEqual(['grinder:insert', 'grinder:take', 'espresso:insert', 'espresso:take', 'counter:serve']);
    expect(ids('latte', 'serve')).toEqual([
      'grinder:insert', 'grinder:take', 'espresso:insert', 'espresso:take', 'steamer:insert', 'steamer:take', 'counter:serve',
    ]);
    expect(ids('coldBrew', 'put')).toEqual(['coldBrewTap:insert', 'coldBrewTap:take', 'counter:put']);
  });

  it('a bot makes and serves an espresso on its own', () => {
    let s = cafe(1);
    s.customers = [{ id: 900, drink: 'espresso', ...huge }];
    const served = s.today.served;
    s = runUntil(s, (x) => !x.customers.some((c) => c.id === 900), 60 * 30);
    expect(s.today.served).toBe(served + 1);
    expect(s.today.drinks!.espresso).toBeGreaterThan(0);
  });

  it('a latte goes through the steamer; a cold brew through the tap', () => {
    let s = cafe(1);
    s.customers = [{ id: 901, drink: 'latte', ...huge }, { id: 902, drink: 'coldBrew', ...huge }];
    const served = s.today.served;
    const milk = s.supplies.milk;
    s = runUntil(s, (x) => x.customers.length === 0, 60 * 60);
    expect(s.today.served).toBe(served + 2);
    expect(s.today.drinks!.latte).toBe(1);
    expect(s.today.drinks!.coldBrew).toBe(1);
    expect(s.supplies.milk).toBe(milk - 1);
  });

  it('two bots claim different customers', () => {
    let s = cafe(2);
    s.customers = [{ id: 910, drink: 'latte', ...huge }, { id: 911, drink: 'latte', ...huge }];
    for (let i = 0; i < 12; i++) s = step(s, []);
    const claims = [bot(s, 'bot-1').bot!.claim, bot(s, 'bot-2').bot!.claim];
    expect([...claims].sort()).toEqual([910, 911]);
    expect(claims[0]).not.toBe(claims[1]);
  });

  it('Review Focus 1: when the claimed customer is served by someone else the bot puts its drink on the pass', () => {
    let s = cafe(1);
    s.customers = [{ id: 900, drink: 'espresso', ...huge }];
    s = runUntil(s, (x) => bot(x).holding === 'espresso', 60 * 30);
    expect(bot(s).bot!.claim).toBe(900);
    s.customers = [];
    const wasted = s.today.wasted ?? 0;
    s = runUntil(
      s,
      (x) => bot(x).holding === null && bot(x).bot!.claim === null && (x.pass.some((i) => i.item === 'espresso') || (x.today.wasted ?? 0) > wasted),
      600,
    );
    expect(s.pass.some((i) => i.item === 'espresso')).toBe(true);
  });

  it('a drink orphaned in a machine by a departed customer is collected, not left blocking it', () => {
    let s = cafe(1);
    s.menu.coldBrew = false; // no pass prep, so the bot's next think goes straight to the orphaned drink
    s.customers = [{ id: 900, drink: 'espresso', ...huge }];
    const machine = (x: GameState) => x.stations.find((st) => st.id === 'espresso')!;
    s = runUntil(s, (x) => machine(x).busyTicksLeft > 0 || machine(x).output === 'espresso', 60 * 30);
    expect(bot(s).bot!.claim).toBe(900);
    s.customers = [];
    s = runUntil(s, (x) => machine(x).output === null && machine(x).busyTicksLeft === 0 && bot(x).holding === null && x.pass.some((i) => i.item === 'espresso'), 600);
    expect(bot(s).bot!.claim).toBeNull();
  });

  it('Review Focus 2: a bot does not wait forever at a blocked machine', () => {
    let s = cafe(1);
    s.customers = [{ id: 900, drink: 'espresso', ...huge }];
    s = runUntil(s, (x) => bot(x).holding === 'grounds', 60 * 30);
    // A leftover the bot cannot use while holding grounds; placed now, mid-chain, so the orphan rule does not collect it first.
    s.stations.find((x) => x.id === 'espresso')!.output = 'latte';
    s = runUntil(s, (x) => bot(x).bot!.waitTicks > 0, 60 * 5); // stuck at the machine with grounds in hand
    s = runUntil(
      s,
      (x) => {
        const b = bot(x);
        const first = b.bot!.plan[0];
        const atEspresso = first?.kind === 'use' && first.station === 'espresso' && first.action === 'insert';
        return b.holding === null && b.bot!.plan.length > 0 && !atEspresso && b.bot!.waitTicks === 0;
      },
      60 * 15,
    );
    expect(bot(s).holding).toBeNull();
    expect(bot(s).bot!.plan[0]).toEqual({ kind: 'use', station: 'espresso', action: 'take' }); // now collects the leftover
  });

  it('bots prep cold brew for the pass when nothing is waiting, up to two', () => {
    let s = cafe(1);
    expect(bot(s).bot!.personality).toBe('steady');
    expect(ECONOMY.bots.personalities.steady.preps).toBe(true);
    const coldOnPass = (x: GameState) => x.pass.filter((i) => i.item === 'coldBrew').length;
    let reached = false;
    for (let i = 0; i < 60 * 30; i++) {
      s = step(s, []);
      expect(coldOnPass(s)).toBeLessThanOrEqual(2);
      if (coldOnPass(s) === 2) reached = true;
    }
    expect(reached).toBe(true);
    expect(coldOnPass(s)).toBe(2);
    expect(s.pass.length).toBe(2);
  });

  it('bots never make a drink that is off the menu', () => {
    let s = cafe(1);
    s.menu.espresso = false;
    s.customers = [{ id: 900, drink: 'espresso', ...huge }];
    const beans = s.supplies.beans;
    for (let i = 0; i < 600; i++) {
      s = step(s, []);
      expect(s.supplies.beans).toBe(beans);
    }
    expect(s.stations.find((x) => x.id === 'grinder')!.busyTicksLeft).toBe(0);
  });

  it('a day with bots is deterministic and JSON-safe', () => {
    const script = () => {
      let s = startDay(createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 2 } }));
      for (let i = 0; i < 1200; i++) s = step(s, []);
      return s;
    };
    const a = script();
    expect(a.today.served + a.customers.length).toBeGreaterThan(0);
    expect(script()).toEqual(a);
    const round = JSON.parse(JSON.stringify(a)) as GameState;
    let x = a;
    let y = round;
    for (let i = 0; i < 300; i++) {
      x = step(x, []);
      y = step(y, []);
    }
    expect(y).toEqual(x);
  });
});
