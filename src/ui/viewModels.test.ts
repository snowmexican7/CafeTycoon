import { describe, it, expect } from 'vitest';
import { createRun } from '../sim/run';
import type { RunRecord } from '../sim/types';
import { closingViewModel, hudStructureKey, hudViewModel, lobbyViewModel, money, nightStructureKey, nightViewModel, titleViewModel, weekEndViewModel } from './viewModels';

const run = () => createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }] });

describe('view models', () => {
  it('formats money and the hud', () => {
    expect(money(1234.5)).toBe('$1,234.50');
    expect(money(-20)).toBe('-$20.00');
    const s = run();
    s.phaseTicksLeft = 61 * 60;
    s.cash = 84.5;
    s.reputation = 2.7;
    s.supplies.milk = 0;
    const h = hudViewModel(s);
    expect(h.dayLabel).toBe('Day 1');
    expect(h.clock).toBe('1:01');
    expect(h.cash).toBe('$84.50');
    expect(h.reputation).toBe('2.7★');
    expect(h.seed).toBe(5);
    expect(h.menu.find((m) => m.id === 'latte')!.available).toBe(false);
    s.day = 9;
    expect(hudViewModel(s).dayLabel).toBe('Day 9 (week 2)');
  });

  it('builds the night screen', () => {
    const s = run();
    s.cash = 50;
    s.hand = ['dualBoiler', 'streetSign'];
    s.ready = ['p2'];
    const n = nightViewModel(s, 'p1');
    expect(n.takings).toBeNull();
    expect(n.hand.map((c) => c.affordable)).toEqual([false, true]);
    expect(n.hand[1]).toMatchObject({ name: 'Street sign', cost: '$15.00', effect: '+5% customers', duration: 'permanent' });
    expect(n.ready).toEqual([
      { id: 'p1', name: 'K', ready: false },
      { id: 'p2', name: 'S', ready: true },
    ]);
    expect(n.meReady).toBe(false);
    expect(n.restock[0]).toMatchObject({ supply: 'beans', count: 20, packSize: 10, packCost: '$8.00', affordable: true });
    s.day = 2;
    s.days = [{ day: 1, served: 7, lost: 3, turnedAway: 0, sales: 30, tips: 5, rent: 25 }];
    expect(nightViewModel(s, 'p1').takings).toEqual({ sales: '$30.00', tips: '$5.00', rent: '$25.00', profit: '$10.00' });
  });

  it('builds closing and week-end screens', () => {
    const before = run();
    before.today = { day: 1, served: 7, lost: 3, turnedAway: 1, sales: 30, tips: 5, rent: 0 };
    before.reputation = 2.5;
    const after = run();
    after.days = [{ ...before.today, rent: 25 }];
    after.reputation = 2.7;
    expect(closingViewModel(before, after)).toEqual({
      dayLabel: 'Day 1',
      served: 7,
      lost: 3,
      turnedAway: 1,
      sales: '$30.00',
      tips: '$5.00',
      rent: '$25.00',
      profit: '$10.00',
      reputationBefore: '2.5★',
      reputationAfter: '2.7★',
      cash: '$100.00',
      profitVsStart: '$0.00',
      startingCash: '$100.00',
    });
    after.cash = 160;
    after.days.push({ day: 2, served: 9, lost: 1, turnedAway: 0, sales: 40, tips: 8, rent: 25 });
    after.owned = [{ itemId: 'streetSign', effects: [] }];
    const w = weekEndViewModel(after, 'p2');
    expect(w).toEqual({
      score: '$60.00',
      cash: '$160.00',
      startingCash: '$100.00',
      daysCompleted: 2,
      customersServed: 16,
      bestDay: { day: 2, profit: '$23.00' },
      itemsBought: ['Street sign'],
      seed: 5,
      isHost: false,
      bankrupt: false,
    });
  });

  it('builds the title screen', () => {
    const rec: RunRecord = { date: '2026-10-28', seed: 1, scenario: 'rainyWeek', players: ['K', 'S'], daysCompleted: 7, score: 412.25, itemsBought: [] };
    const t = titleViewModel([rec], null);
    expect(t.canResume).toBe(false);
    expect(t.history[0]).toEqual({ date: '2026-10-28', score: '$412.25', days: 7, scenario: 'Rainy week', players: 'K, S' });
    expect(titleViewModel([], run()).canResume).toBe(true);
    const ended = run();
    ended.phase = 'ended';
    expect(titleViewModel([], ended).canResume).toBe(false);
  });
});

describe('overlay structure keys', () => {
  it('ignores clock and cash but notices hand, affordability, ready, and takings changes', () => {
    const s = run();
    s.cash = 80; // comfortably above rent, so no night warning flips between 80 and 79
    s.hand = ['dualBoiler', 'streetSign'];
    const a = nightStructureKey(nightViewModel(s, 'p1'));
    s.phaseTicksLeft -= 60;
    s.cash = 79;
    expect(nightStructureKey(nightViewModel(s, 'p1'))).toBe(a);
    s.cash = 10; // streetSign no longer affordable
    expect(nightStructureKey(nightViewModel(s, 'p1'))).not.toBe(a);
    s.cash = 80;
    s.ready = ['p2'];
    expect(nightStructureKey(nightViewModel(s, 'p1'))).not.toBe(a);
    s.ready = [];
    s.hand = ['streetSign'];
    expect(nightStructureKey(nightViewModel(s, 'p1'))).not.toBe(a);
  });

  it('keys the hud by everything except the clock and cash', () => {
    const s = run();
    const a = hudStructureKey(hudViewModel(s));
    s.phaseTicksLeft -= 60;
    s.cash += 3;
    expect(hudStructureKey(hudViewModel(s))).toBe(a);
    s.supplies.milk = 0;
    expect(hudStructureKey(hudViewModel(s))).not.toBe(a);
  });

  it('shows the doors-locked banner while closing: presence is structure, the count is patched', () => {
    const s = run();
    s.phase = 'day';
    expect(hudViewModel(s).closing).toBeUndefined();
    const open = hudStructureKey(hudViewModel(s));
    s.phase = 'closing';
    s.customers = [1, 2, 3].map((id) => ({ id, drink: 'latte' as const, patienceLeft: 100, patienceMax: 100 }));
    const vm = hudViewModel(s);
    expect(vm.closing).toEqual({ left: 3 });
    const closing = hudStructureKey(vm);
    expect(closing).not.toBe(open);
    s.customers.pop();
    expect(hudViewModel(s).closing).toEqual({ left: 2 });
    expect(hudStructureKey(hudViewModel(s))).toBe(closing);
  });
});

describe('lobby view model', () => {
  const members = [
    { token: 'H', name: 'Host' },
    { token: 'T1', name: 'Sam' },
  ];
  it('describes the host lobby before and after start', () => {
    expect(lobbyViewModel({ code: 'ABCDE', members, isHost: true, status: 'hosting', started: false })).toEqual({
      code: 'ABCDE',
      members: ['Host', 'Sam'],
      isHost: true,
      canStart: true,
      statusText: 'Share the code. Start when everyone is in.',
    });
    expect(lobbyViewModel({ code: 'ABCDE', members, isHost: true, status: 'hosting', started: true }).canStart).toBe(false);
  });
  it('describes every peer status', () => {
    const base = { code: 'ABCDE', members, isHost: false, started: false } as const;
    expect(lobbyViewModel({ ...base, status: 'connecting' }).statusText).toBe('Finding the host…');
    expect(lobbyViewModel({ ...base, status: 'connected' }).statusText).toBe('Waiting for the host to start…');
    expect(lobbyViewModel({ ...base, status: 'connected', started: true }).statusText).toBe('');
    expect(lobbyViewModel({ ...base, status: 'hostAway', started: true }).statusText).toBe('Waiting for the host to come back…');
    expect(lobbyViewModel({ ...base, status: 'failed' }).canStart).toBe(false);
  });
  it('offers rejoin on the title when the room store says peer', () => {
    expect(titleViewModel([], null, { code: 'ABCDE', role: 'peer' }).rejoinCode).toBe('ABCDE');
    expect(titleViewModel([], null, { code: 'ABCDE', role: 'host' }).rejoinCode).toBeNull();
    expect(titleViewModel([], null, null).rejoinCode).toBeNull();
  });
});

describe('phase 1 polish: cash vs score', () => {
  it('closing and week-end screens show cash and profit vs. start separately', () => {
    const before = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
    const after = structuredClone(before);
    after.cash = -10.22;
    after.days.push({ ...after.today, sales: 10, tips: 0, rent: 25 });
    const c = closingViewModel(before, after);
    expect(c.cash).toBe('-$10.22');
    expect(c.profitVsStart).toBe('-$110.22');
    expect(c.startingCash).toBe('$100.00');
    const w = weekEndViewModel(after, 'p1');
    expect(w.cash).toBe(hudViewModel(after).cash);
    expect(w.score).toBe('-$110.22');
    expect(w.tab).toBeUndefined();
    after.debt = 75;
    expect(weekEndViewModel(after, 'p1').tab).toBe('$75.00');
  });
});
