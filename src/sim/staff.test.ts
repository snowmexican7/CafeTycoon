import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../data/economy';
import { createRun, startDay } from './run';
import { step } from './step';
import { finishDay } from './closing';
import { validateInput } from './validate';
import { profitOf } from './profit';
import { rentForDay } from './effects';
import { hireWage } from './hires';
import { billsForDay, wageEach, wagesForDay, WAGE_BY_TIER } from './staff';
import { nightWarnings } from '../ui/nightWarnings';
import { nightHtml, type NightUiState } from '../ui/night';
import { nightExtras } from '../ui/live';
import { nightViewModel } from '../ui/viewModels';
import type { DayStats, GameState, PlayerInput } from './types';

const gearRun = (players = 1, gear = true, cashier = false): GameState =>
  createRun({
    seed: 7, hostId: 'p1', players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` })),
    settings: { dayLengthSec: 150, nightLengthSec: 30, ...(cashier ? { cashier } : {}) }, tier: 'stand', ...(gear ? { gear: true as const } : {}),
  });

describe('staff (bot cut 4a: no bot baristas, no crew wages)', () => {
  it('a people-only Gear run owes no wages: bills are the rent', () => {
    const s = gearRun(2);
    expect(wagesForDay(s)).toBe(0);
    expect(billsForDay(s)).toBe(rentForDay(s));
    const day = startDay(s);
    expect(day.players.some((p) => p.bot)).toBe(false);
    day.phase = 'closing';
    day.challenges = [];
    const night = finishDay(day);
    expect(night.days.at(-1)!.wages).toBeUndefined();
  });

  it('wages are the Strategist, the Marketer and the robot cashier', () => {
    const s = gearRun(1, true, true);
    s.staff = { strategist: true, marketer: true };
    expect(wagesForDay(s)).toBeCloseTo(hireWage(s, 'strategist') + hireWage(s, 'marketer') + ECONOMY.cashier.dailyCost);
  });

  it('a staff input must name its role: a bare hire or fire is refused', () => {
    expect(validateInput({ kind: 'staff', playerId: 'p1', action: 'hire' } as unknown as PlayerInput)).toBeNull();
    expect(validateInput({ kind: 'staff', playerId: 'p1', action: 'fire' } as unknown as PlayerInput)).toBeNull();
    expect(validateInput({ kind: 'staff', playerId: 'p1', action: 'promote', role: 'marketer' } as unknown as PlayerInput)).toBeNull();
    expect(validateInput({ kind: 'staff', playerId: 'p1', action: 'hire', role: 'marketer' })).toEqual({ kind: 'staff', playerId: 'p1', action: 'hire', role: 'marketer' });
    const after = step(gearRun(2), [{ kind: 'staff', playerId: 'p1', action: 'hire' } as unknown as PlayerInput]);
    expect(after.players.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(after.staff).toBeUndefined();
  });

  it('wageEach (a second-shop barista, src/sim/branch.ts) scales with the shop and is paid by the hour (B17)', () => {
    const s = gearRun();
    expect(wageEach(s)).toBe(WAGE_BY_TIER.stand);
    s.tier = 'cart';
    expect(wageEach(s)).toBe(WAGE_BY_TIER.cart);
    s.tier = 'cafe';
    expect(wageEach(s)).toBe(WAGE_BY_TIER.cafe);
    s.tier = 'stand';
    s.settings.dayLengthSec = 60;
    expect(wageEach(s)).toBe(0.4);
    s.tier = 'cafe';
    expect(wageEach(s)).toBe(2);
    s.settings.dayLengthSec = 300;
    expect(wageEach(s)).toBe(2 * WAGE_BY_TIER.cafe);
    expect(wageEach(gearRun(1, false))).toBe(0); // classic runs pay none
  });

  it('wages can bankrupt a shop that cannot cover them (a hired Strategist)', () => {
    const s = gearRun();
    s.staff = { strategist: true };
    expect(wagesForDay(s)).toBeGreaterThan(0);
    s.challenges = []; // no challenge tip muddying the till
    s.phase = 'closing';
    s.cash = rentForDay(s) + wagesForDay(s) / 2; // the rent, not the wage
    expect(finishDay(s).bankrupt).toBe(true);
    const ok = gearRun();
    ok.staff = { strategist: true };
    ok.challenges = [];
    ok.phase = 'closing';
    ok.cash = billsForDay(ok) + 1;
    expect(finishDay(ok).bankrupt).toBe(false);
  });

  it('the night warns about rent and wages together (the Strategist, the Marketer and the robot cashier)', () => {
    const s = gearRun(1, true, true);
    s.staff = { strategist: true, marketer: true };
    const bills = billsForDay(s);
    expect(bills).toBe(rentForDay(s) + hireWage(s, 'strategist') + hireWage(s, 'marketer') + ECONOMY.cashier.dailyCost);
    s.cash = rentForDay(s) + 1; // enough for rent, not the wages
    const w = nightWarnings(s).find((x) => x.kind === 'cash');
    expect(w?.title).toMatch(/short on rent and wages/);
    expect(w?.detail).toContain('Rent and wages are $' + bills);
    const plain = gearRun();
    plain.cash = rentForDay(plain) - 1; // no wages: rent alone
    expect(nightWarnings(plain).find((x) => x.kind === 'cash')?.title).not.toMatch(/wages/);
  });

  it('old days without wages keep their profit (old saves)', () => {
    const d = { day: 1, served: 3, lost: 0, sales: 20, tips: 2, rent: 10 } as DayStats;
    expect(profitOf(d)).toBe(12);
  });

  it('the night board has no barista hire row, only the specialists (Gear only)', () => {
    const ui = { tab: 'tonight', spend: 'cards', drawer: null, sig: null, pitch: { kind: 'promo', text: '' } } as NightUiState;
    const s = gearRun();
    const html = nightHtml(nightViewModel(s, 'p1'), nightExtras(s, 'p1'), null, ui);
    expect(html).not.toContain('Hired staff');
    expect(html).not.toMatch(/data-staff="(hire|fire)"(?![^>]*data-role)/);
    expect(html).toContain('data-role="strategist"');
  });
});
