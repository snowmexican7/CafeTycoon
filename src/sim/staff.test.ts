import { describe, it, expect } from 'vitest';
import { createRun } from './run';
import { step } from './step';
import { finishDay } from './closing';
import { validateInput } from './validate';
import { profitOf } from './profit';
import { rentForDay } from './effects';
import { syncBots } from './bots/roster';
import { billsForDay, crewCount, staff, wageEach, wagesForDay, WAGE_BY_TIER } from './staff';
import { nightWarnings } from '../ui/nightWarnings';
import { nightExtras } from '../ui/live';
import { nightHtml, type NightUiState } from '../ui/night';
import { closingViewModel, nightViewModel, staffViewModel } from '../ui/viewModels';
import type { DayStats, GameState, PlayerInput } from './types';

const gearRun = (players = 1, gear = true): GameState =>
  createRun({
    seed: 7, hostId: 'p1', players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` })),
    settings: { dayLengthSec: 150, nightLengthSec: 30 }, tier: 'stand', ...(gear ? { gear: true as const } : {}),
  });
const hire = (s: GameState, by = 'p1'): GameState => step(s, [{ kind: 'staff', playerId: by, action: 'hire' }]);
const fire = (s: GameState, by = 'p1'): GameState => step(s, [{ kind: 'staff', playerId: by, action: 'fire' }]);

describe('P3 B15: hired staff and wages', () => {
  it('a solo Gear run opens with the auto crew on the books at the stand wage', () => {
    const s = gearRun();
    expect(s.phase).toBe('night');
    expect(staff(s).length).toBe(0); // bots clock in at the morning
    expect(crewCount(s)).toBe(2);
    expect(staffViewModel(s)!.crew.map((c) => c.name)).toEqual(['Bo', 'Lu']);
    expect(wageEach(s)).toBe(WAGE_BY_TIER.stand);
    expect(wagesForDay(s)).toBe(2 * WAGE_BY_TIER.stand);
    expect(billsForDay(s)).toBe(rentForDay(s) + 2 * WAGE_BY_TIER.stand);
  });

  it('classic runs pay no wages and show no staff row', () => {
    const s = gearRun(1, false);
    expect(crewCount(s)).toBe(2);
    expect(wagesForDay(s)).toBe(0);
    expect(billsForDay(s)).toBe(rentForDay(s));
    expect(staffViewModel(s)).toBeUndefined();
    expect(nightViewModel(s, 'p1').staff).toBeUndefined();
    const before = s.players.length;
    expect(hire(s).players.length).toBe(before);
  });

  it('wages scale with the shop', () => {
    const s = gearRun();
    s.tier = 'cart';
    expect(wagesForDay(s)).toBe(2 * WAGE_BY_TIER.cart);
    s.tier = 'cafe';
    expect(wagesForDay(s)).toBe(2 * WAGE_BY_TIER.cafe);
  });

  it('hire adds a bot up to the four spots; fire lets the newest go', () => {
    let s = gearRun();
    s = hire(s);
    expect(staff(s).length).toBe(3);
    expect(s.settings.bots).toBe(3);
    expect(staffViewModel(s)!.canHire).toBe(false);
    s = hire(s);
    expect(staff(s).length).toBe(3); // 1 person + 3 bots fills the bar
    s = fire(s);
    expect(staff(s).map((p) => p.id)).toEqual(['bot-1', 'bot-2']);
    s = fire(fire(s));
    expect(staff(s).length).toBe(0);
    expect(s.settings.bots).toBe(0);
    s = fire(s);
    expect(staff(s).length).toBe(0);
    expect(wagesForDay(s)).toBe(0);
    expect(staffViewModel(s)).toMatchObject({ crew: [], canHire: true, total: '$0.00' });
  });

  it('hiring is for people at night only', () => {
    let s = gearRun(2);
    expect(crewCount(s)).toBe(1);
    syncBots(s);
    s = hire(s, 'bot-1');
    expect(crewCount(s)).toBe(1);
    s = hire(s, 'nobody');
    expect(crewCount(s)).toBe(1);
    s.phase = 'day';
    s = hire(s, 'p2');
    expect(s.settings.bots).toBe('auto');
    expect(staff(s).length).toBe(1);
  });

  it('validateInput keeps only hire and fire', () => {
    expect(validateInput({ kind: 'staff', playerId: 'p1', action: 'hire' })).toEqual({ kind: 'staff', playerId: 'p1', action: 'hire' });
    expect(validateInput({ kind: 'staff', playerId: 'p1', action: 'promote' } as unknown as PlayerInput)).toBeNull();
  });

  it('closing pays the crew and the day records it', () => {
    const s = gearRun();
    syncBots(s);
    s.challenges = []; // no challenge tip muddying the till
    s.phase = 'closing';
    s.cash = 100;
    const rent = rentForDay(s);
    const before = structuredClone(s);
    const after = finishDay(s);
    const d = after.days.at(-1)!;
    expect(d.wages).toBe(2 * WAGE_BY_TIER.stand);
    expect(after.cash).toBe(100 - rent - 2 * WAGE_BY_TIER.stand);
    expect(profitOf(d)).toBe(Math.round((d.sales + d.tips - rent - d.wages!) * 100) / 100);
    const vm = closingViewModel(before, after);
    expect(vm.wages).toBe('$2.00');
  });

  it('wages can bankrupt a shop that cannot cover them', () => {
    const s = gearRun();
    syncBots(s);
    s.challenges = []; // no challenge tip muddying the till
    s.phase = 'closing';
    s.cash = rentForDay(s) + 1;
    expect(finishDay(s).bankrupt).toBe(true);
  });

  it('old days without wages keep their profit (old saves)', () => {
    const d = { day: 1, served: 3, lost: 0, sales: 20, tips: 2, rent: 10 } as DayStats;
    expect(profitOf(d)).toBe(12);
  });

  it('the night warns about rent and wages together', () => {
    const s = gearRun();
    s.cash = rentForDay(s) + 1; // enough for rent, not the wages
    const w = nightWarnings(s).find((x) => x.kind === 'cash');
    expect(w?.title).toMatch(/short on rent and wages/);
    expect(w?.detail).toMatch(/Rent and wages are \$12/);
  });

  it('the night board shows the staff row with hire and let-go buttons (Gear only)', () => {
    const ui = { tab: 'tonight', spend: 'cards', drawer: null, sig: null, pitch: { kind: 'promo', text: '' }, slotSel: null } as NightUiState;
    const s = gearRun();
    const html = nightHtml(nightViewModel(s, 'p1'), nightExtras(s, 'p1'), null, ui);
    expect(html).toContain('Hired staff');
    expect(html).toContain('🤖 Bo');
    expect(html).toContain('data-staff="hire"');
    expect(html).toContain('Let Lu go');
    const c = gearRun(1, false);
    expect(nightHtml(nightViewModel(c, 'p1'), nightExtras(c, 'p1'), null, ui)).not.toContain('Hired staff');
  });
});
