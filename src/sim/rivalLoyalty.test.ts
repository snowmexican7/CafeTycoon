import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { validateInput } from './validate';
import { applyStampCardInput, isPromoDay, loyaltyLive, RIVAL } from './rival';
import { computeModifiers } from './effects';
import { nightBrief } from './brief';
import { nightViewModel } from '../ui/viewModels';
import { step } from './step';
import type { GameState } from './types';

const run = (gear = true): GameState => {
  const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
  if (gear) s.gear = true;
  s.phase = 'night';
  s.cash = 200;
  return s;
};
const quietDay = (s: GameState, from: number) => [0, 1, 2, 3, 4, 5, 6].map((k) => from + k).find((d) => !isPromoDay(s, d))!;

describe('rival loyalty card and our stamp card (P4 F2)', () => {
  it('starts on day 15 of a Gear run only, announced the night before with a Stamp card fix', () => {
    const s = run();
    expect([loyaltyLive(s, 14), loyaltyLive(s, 15), loyaltyLive(s, 40)]).toEqual([false, true, true]);
    expect(loyaltyLive(run(false), 20)).toBe(false);
    s.day = 14;
    expect(nightBrief(s).alerts.find((a) => a.id === 'rival:loyalty')).toBeUndefined();
    s.day = RIVAL.loyaltyDay;
    const a = nightBrief(s).alerts.find((x) => x.id === 'rival:loyalty')!;
    expect(a).toMatchObject({ severity: 'warn', fix: { kind: 'stampCard' } });
    expect(a.text).toMatch(/launches a loyalty card tomorrow/);
    const row = nightViewModel(s, 'p1').brief.alerts.find((x) => x.id === 'rival:loyalty')!;
    expect(row.fix).toMatchObject({ label: `Stamp card · $${RIVAL.stampCost}`, action: 'fix', input: { kind: 'stampCard' } });
    s.day = 20;
    expect(nightBrief(s).alerts.find((x) => x.id === 'rival:loyalty')).toMatchObject({ severity: 'info' });
    s.cash = 10;
    const poor = nightViewModel(s, 'p1').brief.alerts.find((x) => x.id === 'rival:loyalty')!;
    expect(poor.fix).toBeUndefined();
  });

  it('costs walk-ins until we print a stamp card; then walk-ins are back and prices dip', () => {
    const s = run();
    s.day = quietDay(s, 15);
    const hit = computeModifiers(s);
    applyStampCardInput(s, { kind: 'stampCard', playerId: 'p1' });
    expect(s.cash).toBe(200 - RIVAL.stampCost);
    expect(s.rival?.stamps).toBe(s.day);
    const back = computeModifiers(s);
    expect(hit.traffic).toBeCloseTo(back.traffic * RIVAL.loyaltyTraffic, 6);
    expect(back.price.latte).toBeCloseTo(hit.price.latte * RIVAL.stampPrice, 6);
    // once only; the alert goes away
    applyStampCardInput(s, { kind: 'stampCard', playerId: 'p1' });
    expect(s.cash).toBe(200 - RIVAL.stampCost);
    expect(nightBrief(s).alerts.find((a) => a.id === 'rival:loyalty')).toBeUndefined();
  });

  it('night, humans, cash and launch gated; validated; morning notes; old saves have no card', () => {
    const early = run();
    early.day = 14;
    applyStampCardInput(early, { kind: 'stampCard', playerId: 'p1' });
    expect(early.rival?.stamps).toBeUndefined();
    const day = run();
    day.day = 16;
    day.phase = 'day';
    applyStampCardInput(day, { kind: 'stampCard', playerId: 'p1' });
    expect(day.rival?.stamps).toBeUndefined();
    const poor = run();
    poor.day = 16;
    poor.cash = 29;
    applyStampCardInput(poor, { kind: 'stampCard', playerId: 'p1' });
    expect(poor.rival?.stamps).toBeUndefined();
    const bot = run();
    bot.day = 16;
    bot.players[0].bot = {} as never;
    applyStampCardInput(bot, { kind: 'stampCard', playerId: 'p1' });
    expect(bot.rival?.stamps).toBeUndefined();
    expect(validateInput({ kind: 'stampCard', playerId: 'p1' })).toEqual({ kind: 'stampCard', playerId: 'p1' });
    const viaStep = run();
    viaStep.day = 16;
    const after = step(viaStep, [{ kind: 'stampCard', playerId: 'p1' }]);
    expect(after.rival?.stamps).toBe(16);

    const launch = run();
    launch.day = RIVAL.loyaltyDay;
    startDay(launch);
    expect(launch.morningNotes.join(' ')).toMatch(/launched a loyalty card today/);
    const ours = run();
    ours.day = RIVAL.loyaltyDay;
    applyStampCardInput(ours, { kind: 'stampCard', playerId: 'p1' });
    startDay(ours);
    expect(ours.morningNotes.join(' ')).toMatch(/Our stamp card is out/);

    const old = JSON.parse(JSON.stringify(run())) as GameState;
    delete old.rival;
    old.day = 16;
    expect(() => computeModifiers(old)).not.toThrow();
  });
});
