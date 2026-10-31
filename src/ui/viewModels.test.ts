import { describe, it, expect } from 'vitest';
import { createRun } from '../sim/run';
import type { RunRecord } from '../sim/types';
import { cleanMeter, EVENT_INTRO, followerBump, forecastViewModel, scrutinyFor, closingViewModel, hudStructureKey, hudViewModel, lobbyViewModel, money, nightStructureKey, nightViewModel, titleViewModel, weekEndViewModel, weekStripViewModel } from './viewModels';
import { weekStripHtml } from './weekEnd';

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
    expect(n.restock[0]).toMatchObject({ supply: 'beans', count: 20, packSize: 10, packCost: '$7.20', affordable: true });
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
    const { awards, awardsText, lostPct, ...w } = weekEndViewModel(after, 'p2');
    expect(lostPct).toBe('20%'); // 4 walked out of 20
    expect(awards.length).toBeGreaterThan(0);
    expect(awardsText).toContain('CafeTycoon');
    expect(w).toEqual({
      score: '$67.50', // $60 profit + street sign at half price
      cash: '$160.00',
      fittings: '$7.50',
      startingCash: '$100.00',
      daysCompleted: 2,
      customersServed: 16,
      bestDay: { day: 2, profit: '$23.00' },
      itemsBought: ['Street sign'],
      seed: 5,
      isHost: false,
      bankrupt: false,
      week: { n: 2, days: [{ day: 1, profit: '$10.00', h: 0.43, neg: false }, { day: 2, profit: '$23.00', h: 1, neg: false }], profit: '$33.00', served: 16 },
      // FB2 C11: weekRating(state) — three silly reviewers + fans
      rating: {
        fans: 0,
        reviewers: [
          { name: 'The Queue Inspector', score: 3 },
          { name: 'Chef Foamington', score: 3 },
          { name: 'Lady Latte', score: 2 },
        ],
      },
    });
  });

  it('P6-3: the week strip covers the last seven days, marks loss days and renders bars', () => {
    const s = run();
    expect(weekStripViewModel(s)).toBeUndefined(); // nothing to compare yet
    s.days = Array.from({ length: 9 }, (_, i) => ({ day: i + 1, served: 10, lost: 0, turnedAway: 0, sales: i === 7 ? 10 : 50, tips: 0, rent: 30 }));
    const w = weekStripViewModel(s)!;
    expect(w.n).toBe(7);
    expect(w.days.map((d) => d.day)).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(w.days[5]).toEqual({ day: 8, profit: '-$20.00', h: 1, neg: true });
    expect(w.profit).toBe('$100.00'); // 6 × $20 − $20
    expect(w.served).toBe(70);
    const html = weekStripHtml(w);
    expect(html).toContain('LAST 7 DAYS');
    expect(html.match(/class="wb[ "]/g)).toHaveLength(7);
    expect(html).toContain('class="wb neg" title="Day 8: -$20.00"');
  });

  it('lists Gear buys as bought this run (B17)', () => {
    const s = run();
    s.gearLog = [
      { gear: 'c1', action: 'buy', day: 1, by: 'K', cash: -5 },
      { gear: 'c1', action: 'sell', day: 2, by: 'K', cash: 0 },
      { gear: 'c2', action: 'buy', day: 3, by: 'S', cash: -25 },
    ];
    expect(weekEndViewModel(s, 'p1').itemsBought).toEqual(['The Hanes Method', 'Mason Jar Army']);
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
    expect(lobbyViewModel({ ...base, status: 'full' }).statusText).toMatch(/full/);
  });
  it('shows the bots setting: host edits before the start, peers read it', () => {
    const host = lobbyViewModel({ code: 'ABCDE', members, isHost: true, status: 'hosting', started: false, bots: { bots: 0, picked: false } });
    expect(host.bots).toEqual({ count: 0, clocking: 0, auto: false, picked: false, editable: true });
    const solo = lobbyViewModel({ code: 'ABCDE', members: members.slice(0, 1), isHost: true, status: 'hosting', started: false, bots: { bots: 'auto', picked: false } });
    expect(solo.bots).toEqual({ count: 2, clocking: 2, auto: true, picked: false, editable: true });
    const peer = lobbyViewModel({ code: 'ABCDE', members, isHost: false, status: 'connected', started: false, bots: { bots: 3, picked: true } });
    expect(peer.bots).toEqual({ count: 3, clocking: 2, auto: false, picked: true, editable: false });
    // Four humans fill every spot behind the counter: the pick stands, but no bot fits.
    const four = [...members, { token: 'T2', name: 'Kim' }, { token: 'T3', name: 'Lou' }];
    expect(lobbyViewModel({ code: 'ABCDE', members: four, isHost: true, status: 'hosting', started: false, bots: { bots: 2, picked: true } }).bots).toMatchObject({ count: 2, clocking: 0 });
    expect(lobbyViewModel({ code: 'ABCDE', members, isHost: true, status: 'hosting', started: true, bots: { bots: 1, picked: true } }).bots!.editable).toBe(false);
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

describe('chaos pack view models (Block 1)', () => {
  it('reads the cleanliness meter: tone and words, failing below the inspector bar', () => {
    expect(cleanMeter(100)).toEqual({ pct: 100, tone: 'good', word: 'Spotless' });
    expect(cleanMeter(80).word).toBe('Tidy');
    expect(cleanMeter(60)).toMatchObject({ tone: 'warn', word: 'Scuffed' });
    expect(cleanMeter(59.4)).toMatchObject({ pct: 59, tone: 'bad' });
    expect(cleanMeter(-5).pct).toBe(0);
    expect(cleanMeter(140).pct).toBe(100);
  });

  it('keeps cleanliness out of the HUD structure key (it is patched in place)', () => {
    const s = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'Ana' }] });
    const a = hudViewModel(s);
    s.cleanliness = 42;
    expect(hudStructureKey(hudViewModel(s))).toBe(hudStructureKey(a));
  });

  it('adds the rogue and wasted receipt lines only when they happened', () => {
    const before = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'Ana' }] });
    const after = structuredClone(before);
    after.days.push({ ...before.today, rogues: 2, wasted: 3, slips: 4 });
    expect(closingViewModel(before, after)).toMatchObject({ rogues: 2, wasted: 3, slips: 4 });
    const quiet = structuredClone(before);
    quiet.days.push({ ...before.today });
    const vm = closingViewModel(before, quiet);
    expect('rogues' in vm).toBe(false);
    expect('wasted' in vm).toBe(false);
  });
});

describe('event view models (Block 2)', () => {
  const day = () => {
    const s = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'Ana' }] });
    s.phase = 'day';
    return s;
  };

  it('has an intro card for every event', () => {
    for (const k of ['rushHour', 'powerFlicker', 'healthInspector', 'influencerVisit'] as const) {
      expect(EVENT_INTRO[k].title.length).toBeGreaterThan(3);
      expect(EVENT_INTRO[k].line.length).toBeGreaterThan(10);
    }
  });

  it("reads the inspector's scrutiny only while they are in", () => {
    const s = day();
    expect(scrutinyFor(s)).toBeUndefined();
    expect(hudViewModel(s).scrutiny).toBeUndefined();
    s.events = [{ kind: 'healthInspector', ticksLeft: 600 }];
    expect(scrutinyFor(s)).toMatchObject({ wasted: 0, wastedLimit: 4, clean: 100, cleanMin: 60, verdict: 'ok' });
    s.today.wasted = 3;
    expect(scrutinyFor(s)?.verdict).toBe('risky');
    s.today.wasted = 0;
    s.cleanliness = 65;
    expect(scrutinyFor(s)?.verdict).toBe('risky');
    s.cleanliness = 59;
    expect(scrutinyFor(s)?.verdict).toBe('fail');
    s.cleanliness = 100;
    s.today.wasted = 4;
    expect(scrutinyFor(s)?.verdict).toBe('fail');
  });

  it("patches the scrutiny numbers and outcomes in place (only the meter's presence is structure)", () => {
    const s = day();
    s.events = [{ kind: 'healthInspector', ticksLeft: 600 }];
    const k = hudStructureKey(hudViewModel(s));
    s.today.wasted = 2;
    s.cleanliness = 70;
    s.today.inspection = 'pass';
    expect(hudStructureKey(hudViewModel(s))).toBe(k);
    s.events = [];
    expect(hudStructureKey(hudViewModel(s))).not.toBe(k);
  });

  it('reports outcomes and a stable follower bump', () => {
    const s = day();
    expect(hudViewModel(s).results).toMatchObject({ inspection: null, influencer: null });
    s.today.influencer = 'served';
    expect(hudViewModel(s).results?.influencer).toBe('served');
    expect(followerBump(3, 2)).toBe(followerBump(3, 2));
    expect(followerBump(3, 2)).toMatch(/^\+\d/);
  });
});

describe('event receipt lines (Block 2)', () => {
  it('lists the day\'s events, the inspection verdict, fines and the influencer bonus only when they happened', () => {
    const before = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'Ana' }] });
    const after = structuredClone(before);
    after.days.push({ ...before.today, events: ['rushHour', 'healthInspector'], inspection: 'fail', fines: 15, bonus: 10 });
    expect(closingViewModel(before, after)).toMatchObject({ events: ['Rush hour', 'Health inspector'], inspection: 'fail', fines: '$15.00', bonus: '$10.00' });
    const quiet = structuredClone(before);
    quiet.days.push({ ...before.today, events: [], inspection: null });
    const vm = closingViewModel(before, quiet);
    for (const k of ['events', 'inspection', 'fines', 'bonus']) expect(k in vm, k).toBe(false);
  });
});

describe('the receipt adds up (fines and bonuses in the net)', () => {
  it('profitOf includes the influencer bonus, inspector fines and hospital tab paid', async () => {
    const { profitOf } = await import('./viewModels');
    const d = { day: 2, served: 5, lost: 0, turnedAway: 0, sales: 30, tips: 5, rent: 25, fines: 15, bonus: 10, debtPaid: 2 };
    expect(profitOf(d)).toBe(3);
    expect(profitOf({ ...d, fines: undefined, bonus: undefined, debtPaid: undefined })).toBe(10);
  });
});

describe('forecast view models', () => {
  it('prints tomorrow’s paper with a hot/iced split and a rumour for the day after', () => {
    const s = run();
    s.forecast = 'heatWave';
    s.day = 3;
    const f = forecastViewModel(s);
    expect(f.edition).toBe('Wednesday');
    expect(f.name).toBe('Heat wave');
    expect(f.eventNote).toContain('power flicker');
    expect(f.hotPct).toBeLessThan(50);
    s.forecast = 'rainy';
    const wet = forecastViewModel(s);
    expect(wet.name).toBe('Rainy Wednesday');
    expect(wet.hotPct).toBeGreaterThan(f.hotPct);
    expect(wet.later.name.length).toBeGreaterThan(0);
    s.forecast = 'officeClosed';
    const quiet = forecastViewModel(s).customers;
    s.forecast = 'market';
    expect(forecastViewModel(s).customers).toBeGreaterThan(quiet);
    expect(nightViewModel(s, 'p1').forecast?.headline).toBe(forecastViewModel(s).headline);
  });

  it('shows today’s forecast as a hud chip', () => {
    const s = run();
    expect(hudViewModel(s).forecast?.name).toBe('Grand opening');
    s.forecast = 'payday';
    s.day = 5;
    expect(hudViewModel(s).forecast?.name).toBe('Payday Friday');
  });
});

describe('sold-out HUD (FB1 WP4)', () => {
  it('flags sold out while open and rewrites the rush-hour chip', async () => {
    const { createRun } = await import('../sim/run');
    const { hudViewModel, hudStructureKey, SOLD_OUT_RUSH } = await import('./viewModels');
    const s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'Ana' }] });
    s.phase = 'day';
    expect(hudViewModel(s).soldOut).toBeUndefined();
    const before = hudStructureKey(hudViewModel(s));
    for (const k of Object.keys(s.supplies) as (keyof typeof s.supplies)[]) s.supplies[k] = 0;
    s.events = [{ kind: 'rushHour', ticksLeft: 600 } as (typeof s.events)[number]];
    const vm = hudViewModel(s);
    expect(vm.soldOut).toBe(true);
    expect(vm.events?.[0]?.label).toBe(SOLD_OUT_RUSH.label);
    expect(hudStructureKey(vm)).not.toBe(before);
    s.phase = 'night';
    expect(hudViewModel(s).soldOut).toBeUndefined();
  });
});

describe('HUD menu board: off menu is not sold out (FB1 RC)', () => {
  it('marks a drink the crew took off the menu as offMenu, not just unavailable', async () => {
    const { createRun } = await import('../sim/run');
    const { hudViewModel } = await import('./viewModels');
    const s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'Ana' }] });
    s.phase = 'day';
    s.menu.espresso = false;
    const row = hudViewModel(s).menu.find((m) => m.id === 'espresso')!;
    expect(row).toMatchObject({ available: false, offMenu: true });
    expect(hudViewModel(s).menu.find((m) => m.id === 'coldBrew')?.offMenu).toBeUndefined();
  });
});
