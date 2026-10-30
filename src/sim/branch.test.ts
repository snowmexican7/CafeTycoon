import { describe, it, expect } from 'vitest';
import { createRun, startDay, startNight } from './run';
import { finishDay } from './closing';
import { step } from './step';
import { areaFit, BRANCH, branchAreas, branchDay, canOpenBranch } from './branch';
import { branchViewModel } from '../ui/branchView';
import { gearArea } from './gear';
import { fittingsValue, scoreRun } from './score';
import { profitOf } from './profit';
import { validateInput } from './validate';
import { nightViewModel } from '../ui/viewModels';
import { nightHtml } from '../ui/night';
import type { GameState, PlayerInput } from './types';

const night = (cash = 1000, tier: GameState['tier'] = 'cafe'): GameState => {
  const s = createRun({ seed: 11, hostId: 'p1', players: [{ id: 'p1', name: 'Kay' }], settings: { bots: 0 } });
  s.gear = true;
  s.tier = tier;
  s.cash = cash;
  startNight(s);
  return s;
};
const open = (s: GameState, area = branchAreas(s)[0]) => step(s, [{ kind: 'branch', playerId: 'p1', action: 'open', area }]);

describe('second shop (P4 B4)', () => {
  it('opens only at the café tier, with the cash, in an area other than home', () => {
    expect(open(night(1000, 'cart')).branch).toBeUndefined();
    expect(open(night(BRANCH.cost - 1)).branch).toBeUndefined();
    const home = gearArea(night());
    if (home) expect(open(night(), home).branch).toBeUndefined();
    const s = open(night());
    expect(s.branch).toMatchObject({ staff: BRANCH.staff.start, spent: BRANCH.cost, by: 'Kay' });
    expect(s.cash).toBe(1000 - BRANCH.cost);
    // Score-neutral-ish: the lease counts at half, like any fitting.
    expect(fittingsValue(s) - fittingsValue(night())).toBeCloseTo(BRANCH.cost / 2, 2);
  });

  it('review M1: a café made by createRun (tier absent) can open a branch', () => {
    const s = createRun({ seed: 11, hostId: 'p1', players: [{ id: 'p1', name: 'Kay' }], settings: { bots: 0 }, tier: 'cafe', gear: true });
    expect(s.tier).toBeUndefined();
    s.cash = 1000;
    expect(canOpenBranch(s)).toBe(true);
    s.tier = 'cart';
    expect(canOpenBranch(s)).toBe(false);
  });

  it('banks a deterministic off-screen day at closing, capped by staff, and counts it in the profit', () => {
    let s = open(night());
    s = step(s, [{ kind: 'branch', playerId: 'p1', action: 'staff', staff: 1 }]);
    expect(s.branch?.staff).toBe(1);
    const est = branchDay(s)!;
    expect(est.served).toBeLessThanOrEqual(BRANCH.perStaff);
    const a = finishDay(startDay(structuredClone(s)));
    const b = finishDay(startDay(structuredClone(s)));
    const d = a.days[a.days.length - 1];
    expect(d.branch).toEqual(b.days[b.days.length - 1].branch);
    expect(d.branch!.served).toBeLessThanOrEqual(BRANCH.perStaff);
    expect(d.branch!.profit).toBeCloseTo(d.branch!.takings - d.branch!.costs, 2);
    expect(profitOf(d)).toBeCloseTo(profitOf({ ...d, branch: undefined }) + d.branch!.profit, 2);
  });

  it('sells the lease back for half and leaves the score where it was', () => {
    const s = open(night());
    const before = scoreRun(s);
    const sold = step(s, [{ kind: 'branch', playerId: 'p1', action: 'close' }]);
    expect(sold.branch).toBeUndefined();
    expect(sold.cash).toBe(1000 - BRANCH.cost / 2);
    expect(scoreRun(sold)).toBeCloseTo(before, 2);
  });

  it('reads the menu against the area (loved families up, meh down)', () => {
    const s = night();
    for (const k of Object.keys(s.menu) as (keyof GameState['menu'])[]) s.menu[k] = false;
    s.menu.coldBrew = true;
    expect(areaFit(s, 'gym')).toBeGreaterThan(1);
    expect(areaFit(s, 'drizzleton')).toBeLessThan(1);
  });

  it('validates the input and shows the drawer once there is something to do', () => {
    expect(validateInput({ kind: 'branch', playerId: 'p1', action: 'open', area: 'moon' } as unknown as PlayerInput)).toBeNull();
    expect(validateInput({ kind: 'branch', playerId: 'p1', action: 'staff', staff: 9 })).toBeNull();
    expect(validateInput({ kind: 'branch', playerId: 'p1', action: 'staff', staff: 2 })).toEqual({ kind: 'branch', playerId: 'p1', action: 'staff', staff: 2 });
    const s = night();
    const vm = nightViewModel(s, 'p1');
    expect(vm.branch?.canOpen).toBe(true);
    const ui = { tab: 'tonight', spend: 'cards', drawer: 'branch', sig: null, pitch: { kind: 'promo', text: '' }, slotSel: null } as Parameters<typeof nightHtml>[3];
    expect(nightHtml(vm, undefined, null, ui)).toMatch(/Open here/);
    // Old saves with no branch field still load and close a day.
    const old = night();
    delete old.branch;
    expect(() => finishDay(startDay(old))).not.toThrow();
  });
});

describe('manager mode (P4 B5)', () => {
  it('sends a pack of stock over as credit that pays for branch cups first, then runs out', () => {
    let s = open(night());
    s.supplies.beans = 7;
    s = step(s, [{ kind: 'branch', playerId: 'p1', action: 'send', supply: 'beans' }]);
    expect(s.supplies.beans).toBe(0);
    const credit = (7 * 8) / 10;
    expect(s.branch?.stockCredit).toBeCloseTo(credit, 2);
    const plain = branchDay({ ...s, branch: { ...s.branch!, stockCredit: undefined } })!;
    const est = branchDay(s)!;
    expect(est.fromStock).toBeGreaterThan(0);
    expect(est.profit).toBeCloseTo(plain.profit + est.fromStock!, 2);
    const after = finishDay(startDay(s));
    expect(after.days[after.days.length - 1].branch?.fromStock).toBe(est.fromStock);
    expect(after.branch?.stockCredit ?? 0).toBeCloseTo(credit - est.fromStock!, 2);
    expect(validateInput({ kind: 'branch', playerId: 'p1', action: 'send', supply: 'pastry' })).toBeNull();
  });

  it('a Manager adds cups per barista and their supplier discount, and the drawer says so', () => {
    let s = open(night());
    s = step(s, [{ kind: 'branch', playerId: 'p1', action: 'staff', staff: 1 }]);
    const without = branchDay(s)!;
    s.players[0]!.role = 'manager';
    const withM = branchDay(s)!;
    expect(without.walked).toBeGreaterThan(0);
    expect(withM.served).toBe(Math.min(without.served + without.walked, BRANCH.perStaff + BRANCH.managerCups));
    expect(branchViewModel(s)?.manager?.name).toBe('Kay');
    const vm = nightViewModel(s, 'p1');
    const ui = { tab: 'tonight', spend: 'cards', drawer: 'branch', sig: null, pitch: { kind: 'promo', text: '' }, slotSel: null } as Parameters<typeof nightHtml>[3];
    const html = nightHtml(vm, undefined, null, ui);
    expect(html).toMatch(/is Manager/);
    expect(html).toMatch(/Send stock over/);
  });
});
