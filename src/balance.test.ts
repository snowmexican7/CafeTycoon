import { describe, it, expect } from 'vitest';
import { applyAdvice, applyLayout, cardValue, main, summarize, type BalanceReport, type Layout, type WeekResult } from '../scripts/balanceCore';
import { catalogueById } from './data/catalogue';
import { zeroDrinks } from './sim/tally';
import { createRun } from './sim/run';
import { ECONOMY } from './data/economy';
import { DRINK_IDS } from './data/drinks';
import { nextTier } from './sim/growth';
import { PRICING } from './sim/pricing';
import { RIVAL } from './sim/rival';
import { CHECKOUT, nextCheckout } from './sim/checkout';
import { EQUIPMENT } from './data/equipment';
import type { Advice } from './sim/bots/planner';
import { restockCost } from './sim/night';

describe('balance tester', () => {
  it('runs one short week through the tester entry point, deterministically', () => {
    // One stand-in and no bots keeps this under a second locally; slow CI runners still get headroom from the timeout.
    const args = ['--weeks', '1', '--seed', '3', '--day', '30', '--humans', '1', '--bots', '0', '--json'];
    const a = main(args);
    expect(a.code).toBe(0);
    const r = JSON.parse(a.output) as BalanceReport;
    expect(r.weeks).toHaveLength(1);
    expect(r.weeks[0].days.length).toBeGreaterThan(0);
    expect(r.weeks[0].days.length).toBeLessThanOrEqual(7);
    expect(r.weeks[0].days.reduce((n, d) => n + d.served, 0)).toBeGreaterThan(0);
    expect(main(args).output).toBe(a.output);
  }, 30_000);
  it('rejects bad options with exit code 2 and warns about an empty café', () => {
    expect(main(['--humans', '3', '--bots', '2']).code).toBe(2);
    expect(main(['--frobnicate']).code).toBe(2);
    expect(main(['--weeks', '1', '--day', '30', '--humans', '0', '--bots', '0']).output).toContain('No baristas');
  });
  it('the smart tester buys, re-rolls and reports a policy summary (B11)', () => {
    const args = ['--weeks', '1', '--seed', '3', '--day', '30', '--humans', '1', '--bots', '0', '--json', '--policy', 'smart'];
    const r = JSON.parse(main(args).output) as BalanceReport;
    const w = r.weeks[0];
    expect(w.policy).toBe('smart');
    expect(typeof w.score).toBe('number');
    expect(w.days.every((d) => typeof d.forecast === 'string')).toBe(true);
    expect(main(args).output).toBe(main(args).output);
    expect(main(['--weeks', '1', '--day', '30', '--humans', '1', '--bots', '0', '--policy', 'nope']).code).toBe(2);
  }, 30_000);
  it('--layout noTrash opens without a bin, and an unknown layout is a usage error', () => {
    const args = ['--weeks', '1', '--seed', '3', '--day', '30', '--humans', '1', '--bots', '1', '--layout', 'noTrash', '--summary'];
    const r = main(args);
    expect(r.code).toBe(0);
    expect(r.output).toContain('smart');
    expect(main(['--weeks', '1', '--layout', 'nope']).code).toBe(2);
    expect(main(['--layout']).code).toBe(2);
  }, 60_000);
  it('--policy planner plays a week from the stand, applying the planner advice (FB1 WP6)', () => {
    const args = ['--weeks', '1', '--seed', '3', '--day', '30', '--humans', '1', '--bots', '1', '--policy', 'planner', '--summary'];
    const r = main(args);
    expect(r.code).toBe(0);
    expect(r.output).toContain('planner');
    expect(main(args).output).toBe(r.output);
    expect(main(['--help']).output).toContain('planner');
  }, 60_000);
  it('applyAdvice mirrors the sim: restock, price, twist, grow, slot, menu', () => {
    const s = createRun({ seed: 1, hostId: 'tester', players: [], tier: 'stand' });
    s.phase = 'night';
    s.cash = 400;
    const beans = s.supplies.beans;
    const cost = restockCost(s, 'beans', 2);
    expect(applyAdvice(s, { id: 'restock:beans', kind: 'restock', text: '', input: { kind: 'restock', supply: 'beans', packs: 2 }, priority: 1 })).toBe(true);
    expect(s.supplies.beans).toBe(beans + 2 * ECONOMY.packs.beans.size);
    expect(s.cash).toBe(Math.round((400 - cost) * 100) / 100);
    applyAdvice(s, { id: 'price:espresso', kind: 'price', text: '', input: { kind: 'price', drink: 'espresso', step: -2 }, priority: 1 });
    expect(s.priceSteps).toEqual({ espresso: -2 });
    applyAdvice(s, { id: 'price:espresso', kind: 'price', text: '', input: { kind: 'price', drink: 'espresso', step: 0 }, priority: 1 });
    expect(s.priceSteps).toBeUndefined();
    applyAdvice(s, { id: 'twist:latte', kind: 'twist', text: '', input: { kind: 'twist', drink: 'latte', twist: 'honey' }, priority: 1 });
    expect(s.twists).toEqual({ latte: 'honey' });
    s.cash = 5;
    expect(applyAdvice(s, { id: 'grow:cart', kind: 'grow', text: '', input: { kind: 'grow', tier: 'cart' }, priority: 1 })).toBe(false);
    s.cash = 900;
    const next = nextTier(s)!;
    expect(applyAdvice(s, { id: `grow:${next}`, kind: 'grow', text: '', input: { kind: 'grow', tier: next }, priority: 1 })).toBe(true);
    expect(s.tier).toBe(next);
    expect(s.tierLog?.at(-1)).toMatchObject({ tier: next, day: s.day, by: 'tester' });
    // the back bar: free a slot, then place the unplaced station again
    const idx = s.slots!.indexOf('steamer');
    s.slots![idx] = null;
    s.equipment = ['steamer'];
    expect(applyAdvice(s, { id: `slot:${idx}`, kind: 'slot', text: '', input: { kind: 'slot', index: idx, station: 'steamer' }, priority: 1 })).toBe(true);
    expect(s.slots![idx]).toBe('steamer');
    expect(s.equipment).toEqual([]);
    // the last drink on the board never goes off
    for (const d of DRINK_IDS) s.menu[d] = d === 'espresso';
    expect(applyAdvice(s, { id: 'menu:espresso', kind: 'menu', text: '', input: { kind: 'menu', drink: 'espresso', on: false }, priority: 1 })).toBe(false);
    expect(s.menu.espresso).toBe(true);
    // a price step beyond the clamp lands on the clamp
    applyAdvice(s, { id: 'price:latte', kind: 'price', text: '', input: { kind: 'price', drink: 'latte', step: 99 }, priority: 1 });
    expect(s.priceSteps?.latte).toBe(PRICING.maxStep);
    // the signature keeps `since` when drink and twist stay the same
    const sig = { name: 'House', drink: 'latte' as const, twist: 'honey' as const, premium: 2 };
    s.day = 3;
    applyAdvice(s, { id: 'signature', kind: 'signature', text: '', input: { kind: 'signature', sig }, priority: 1 });
    expect(s.signature).toMatchObject({ ...sig, since: 3 });
    s.day = 4;
    applyAdvice(s, { id: 'signature', kind: 'signature', text: '', input: { kind: 'signature', sig: { ...sig, premium: 1 } }, priority: 1 });
    expect(s.signature).toMatchObject({ premium: 1, since: 3 });
    // scouting costs the fee, once a night
    s.cash = 100;
    const scout: Advice = { id: 'scout', kind: 'scout', text: '', input: { kind: 'scout' }, priority: 1 };
    expect(applyAdvice(s, scout)).toBe(true);
    expect(s.cash).toBe(100 - RIVAL.scoutCost);
    expect(s.rival?.scouted).toBe(s.day);
    expect(applyAdvice(s, scout)).toBe(false);
    // the next checkout, then an equip into the first empty slot
    s.cash = 500;
    const co = nextCheckout(s)!;
    expect(applyAdvice(s, { id: `checkout:${co}`, kind: 'checkout', text: '', input: { kind: 'checkout', checkout: co }, priority: 1 })).toBe(true);
    expect(s.checkout).toMatchObject({ active: co, since: s.day });
    expect(s.cash).toBe(500 - CHECKOUT[co].cost);
    s.cash = 500;
    s.slots![0] = null;
    expect(applyAdvice(s, { id: 'equip:espresso', kind: 'equip', text: '', input: { kind: 'equip', station: 'espresso' }, priority: 1 })).toBe(true);
    expect(s.slots![0]).toBe('espresso');
    expect(s.cash).toBe(500 - EQUIPMENT.espresso.cost);
    expect(s.equipLog?.at(-1)).toMatchObject({ station: 'espresso', day: s.day, by: 'tester' });
  });
  it('applyLayout rearranges the opening slots', () => {
    const open = (layout: Layout) => {
      const s = createRun({ seed: 1, hostId: 'tester', players: [] });
      applyLayout(s, layout);
      return s;
    };
    expect(open('default').equipment).toEqual([]);
    const twin = open('twinEspresso');
    expect(twin.slots).toEqual(['grinder', 'espresso', 'steamer', 'coldBrewTap', 'trash', 'espresso']);
    expect(twin.stations.map((x) => x.id)).toContain('espresso-2');
    const nc = open('noColdBrew');
    expect(nc.slots).toContain(null);
    expect(nc.equipment).toEqual(['coldBrewTap']);
    expect(nc.stations.some((x) => x.kind === 'coldBrewTap')).toBe(false);
    const nt = open('noTrash');
    expect(nt.equipment).toEqual(['trash']);
    expect(nt.stations.some((x) => x.kind === 'trash')).toBe(false);
  });
  it('values on-path cards and set completions above strays', () => {
    const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
    s.day = 2;
    const tamper = catalogueById.tamperStation;
    const base = cardValue(s, tamper, 'speed');
    expect(base).toBeGreaterThan(cardValue(s, tamper, 'quality'));
    s.owned.push({ itemId: 'shotTimer', effects: catalogueById.shotTimer.effects });
    expect(cardValue(s, tamper, 'speed')).toBeGreaterThan(base);
  });
  it('summarizes weeks per policy with loss by day', () => {
    const week = (policy: 'smart' | 'none', cash: number, lost: number): WeekResult => ({
      seed: 1, menu: [], finalCash: cash, bankrupt: false, drinks: zeroDrinks(), policy, bought: policy === 'smart' ? ['streetSign'] : [], score: cash - 100,
      days: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, cash, served: 10, lost, turnedAway: 0, wasted: 0, botMistakes: 0, events: [], challengesWon: 1 })),
    });
    const sum = summarize([week('smart', 300, 2), week('smart', 200, 4), week('none', 250, 5)]);
    const smart = sum.policies.find((p) => p.policy === 'smart')!;
    expect(smart.weeks).toBe(2);
    expect(smart.meanCash).toBe(250);
    expect(smart.dayLoss).toHaveLength(7);
    expect(smart.dayLoss[0]).toBeCloseTo(6 / 26);
    expect(smart.challengesWon).toBe(7);
    expect(sum.cards[0].id).toBe('streetSign');
  });
});
