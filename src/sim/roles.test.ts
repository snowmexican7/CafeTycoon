import { describe, it, expect } from 'vitest';
import { addCustomer, serveCustomer } from './customers';
import { restockCost } from './night';
import { createRun, startDay } from './run';
import { ROLES, roleHolders } from './roles';
import { interact } from './stations';
import { step } from './step';
import type { GameState } from './types';
import { validateInput } from './validate';
import { rolesViewModel } from '../ui/viewModels';

const run2 = () => createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }], settings: { bots: 0 } });
const pick = (s: GameState, pid: string, role: 'chef' | 'creator' | 'host' | 'manager' | null) => step(s, [{ kind: 'role', playerId: pid, role }]);

describe('barista roles (P3 B1)', () => {
  it('lets each barista take one free role at night, and drop it', () => {
    let s = run2();
    expect(s.phase).toBe('night');
    s = pick(s, 'p1', 'chef');
    s = pick(s, 'p2', 'chef'); // taken: ignored
    expect(roleHolders(s)).toEqual({ chef: 'p1' });
    s = pick(s, 'p2', 'host');
    s = pick(s, 'p1', 'manager'); // switching frees the chef
    expect(roleHolders(s)).toEqual({ manager: 'p1', host: 'p2' });
    s = pick(s, 'p2', null);
    expect(roleHolders(s)).toEqual({ manager: 'p1' });
    const vm = rolesViewModel(s, 'p2');
    expect(vm.map((r) => [r.id, r.holder, r.mine])).toEqual([['chef', null, false], ['creator', null, false], ['host', null, false], ['manager', 'K', false]]);
  });

  it('ignores role picks during the day and junk roles at the door', () => {
    let s = run2();
    startDay(s);
    s = pick(s, 'p1', 'chef');
    expect(s.players[0].role).toBeUndefined();
    expect(validateInput({ kind: 'role', playerId: 'p1', role: 'wizard' } as never)).toBeNull();
    expect(validateInput({ kind: 'role', playerId: 'p1', role: null })).toEqual({ kind: 'role', playerId: 'p1', role: null });
  });

  it("speeds or slows the machines a barista starts", () => {
    const grind = (role?: 'chef' | 'host') => {
      const s = run2();
      if (role) s.players[0].role = role;
      s.players[0].pos = { x: 1, y: 2 };
      return interact(s, 'p1').stations[0].busyTicksLeft;
    };
    expect(grind()).toBe(150);
    expect(grind('chef')).toBe(Math.round(150 * ROLES.chef.machineTime));
    expect(grind('host')).toBe(Math.round(150 * ROLES.host.machineTime));
  });

  it('changes the tip on drinks a barista hands over (Chef halves it, Host lifts it, Creator adds craft)', () => {
    const paid = (role?: 'chef' | 'host' | 'creator') => {
      const s = run2();
      startDay(s);
      if (role) s.players[0].role = role;
      const c = addCustomer(s, 'normal')!;
      const before = s.cash;
      serveCustomer(s, c, c.drink, 'p1');
      return { total: s.cash - before, tips: s.today.tips };
    };
    const base = paid();
    expect(paid('chef').tips).toBeCloseTo(base.tips * 0.5, 1);
    expect(paid('host').tips).toBeCloseTo(base.tips * 1.5, 1);
    expect(paid('creator').tips).toBeCloseTo(base.tips + 0.75, 1);
  });

  it('gives the whole crew a Manager discount on restocks', () => {
    const s = run2();
    const full = restockCost(s, 'milk', 2);
    s.players[1].role = 'manager';
    expect(restockCost(s, 'milk', 2)).toBeCloseTo(full * 0.8, 2);
  });

  it('slows the Creator and the Manager on foot', () => {
    const walk = (role?: 'creator' | 'manager') => {
      let s = run2();
      startDay(s);
      if (role) s.players[0].role = role;
      const x0 = s.players[0].pos.x;
      for (let i = 0; i < 30; i++) s = step(s, [{ kind: 'move', playerId: 'p1', x: 1, y: 0, interact: false }]);
      return s.players[0].pos.x - x0;
    };
    const base = walk();
    expect(base).toBeGreaterThan(0);
    expect(walk('creator')).toBeCloseTo(base * 0.85, 1);
    expect(walk('manager')).toBeCloseTo(base * 0.9, 1);
  });
});
