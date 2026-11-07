import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../data/economy';
import { createRun, startDay } from './run';
import { step } from './step';
import { finishDay } from './closing';
import { validateInput } from './validate';
import { profitOf } from './profit';
import { rentForDay } from './effects';
import { hireWage } from './hires';
import { billsForDay, wagesForDay } from './staff';
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
