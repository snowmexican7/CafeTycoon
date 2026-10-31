import { describe, it, expect } from 'vitest';
import { createRun } from './run';
import { emptyHandsWanted, interact, stepStations } from './stations';
import type { GameState } from './types';

const at = (s: GameState, pid: string, x: number, y: number) => {
  s.players.find((p) => p.id === pid)!.pos = { x, y };
  return s;
};
const run2 = () => createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }], settings: { bots: 0 } });

describe('stations', () => {
  it('grinds beans into grounds over 2.5 s', () => {
    let s = at(run2(), 'p1', 1, 2);
    s = interact(s, 'p1');
    expect(s.supplies.beans).toBe(19);
    expect(s.stations[0].busyTicksLeft).toBe(150);
    for (let i = 0; i < 150; i++) s = stepStations(s);
    expect(s.stations[0].output).toBe('grounds');
    s = interact(s, 'p1');
    expect(s.players[0].holding).toBe('grounds');
    expect(s.stations[0].output).toBeNull();
  });

  it('chains grounds -> espresso -> latte and consumes milk', () => {
    let s = at(run2(), 'p1', 3, 2);
    s.players[0].holding = 'grounds';
    s = interact(s, 'p1');
    expect(s.stations[1].busyTicksLeft).toBe(300);
    expect(s.players[0].holding).toBeNull();
    s.stations[1].busyTicksLeft = 1;
    s = stepStations(s);
    expect(s.stations[1].output).toBe('espresso');
    s = interact(s, 'p1');
    expect(s.players[0].holding).toBe('espresso');
    s = at(s, 'p1', 5, 2);
    s = interact(s, 'p1');
    expect(s.supplies.milk).toBe(9);
    expect(s.stations[2].busyTicksLeft).toBe(210);
  });

  it('refuses without supply, ignores wrong items, and trashes', () => {
    let s = at(run2(), 'p1', 8, 2);
    s.supplies.concentrate = 0;
    expect(interact(s, 'p1').stations[3].busyTicksLeft).toBe(0);
    s = at(run2(), 'p1', 3, 2);
    s.players[0].holding = 'latte';
    expect(interact(s, 'p1').stations[1].busyTicksLeft).toBe(0);
    s = at(s, 'p1', 10, 2);
    expect(interact(s, 'p1').players[0].holding).toBeNull();
  });

  it('applies stationSpeed modifiers', () => {
    const s = at(run2(), 'p1', 1, 2);
    s.owned.push({ itemId: 'flatBurrGrinder', effects: [{ kind: 'stationSpeed', station: 'grinder', mul: 1.4 }] });
    expect(interact(s, 'p1').stations[0].busyTicksLeft).toBe(Math.round((2.5 / 1.4) * 60));
  });

  it('gives a finished output to only one of two baristas interacting the same tick', () => {
    // Review Focus 1
    let s = at(at(run2(), 'p1', 1, 2), 'p2', 1.9, 1.5); // both within 1.1 of the grinder
    s.stations[0].output = 'grounds';
    s = interact(s, 'p1');
    s = interact(s, 'p2');
    expect([s.players[0].holding, s.players[1].holding]).toEqual(['grounds', null]);
    expect(s.stations[0].output).toBeNull();
    expect(s.supplies.beans).toBe(19); // the second press lands on an idle grinder and starts a fresh grind
    expect(s.stations[0].busyTicksLeft).toBe(150);
  });

  it('an occupied station ends with no output and is freed', () => {
    let s = run2();
    const esp = s.stations.find((st) => st.id === 'espresso')!;
    esp.busyTicksLeft = 2;
    esp.occupiedBy = 7;
    s = stepStations(stepStations(s));
    const after = s.stations.find((st) => st.id === 'espresso')!;
    expect(after.output).toBeNull();
    expect(after.occupiedBy).toBeNull();
  });

  it('E does nothing at an occupied station', () => {
    let s = at(run2(), 'p1', 3, 2);
    s.players[0].holding = 'grounds';
    s.stations.find((st) => st.id === 'espresso')!.occupiedBy = 7;
    s = interact(s, 'p1');
    expect(s.players[0].holding).toBe('grounds');
    expect(s.stations.find((st) => st.id === 'espresso')!.busyTicksLeft).toBe(0);
  });

  it('a mop carrier cannot use a station', () => {
    let s = at(run2(), 'p1', 1, 2);
    s.players[0].tool = 'mop';
    const beans = s.supplies.beans;
    s = interact(s, 'p1');
    expect(s.stations.find((st) => st.id === 'grinder')!.busyTicksLeft).toBe(0);
    expect(s.supplies.beans).toBe(beans);
  });

  it('emptyHandsWanted (public, R4): an empty-hands press at the grinder is wanted only when a customer wants grounds', () => {
    const s = run2();
    const grinder = s.stations[0];
    expect(emptyHandsWanted(s, grinder)).toBe(false); // nobody is waiting
    s.customers.push({ id: 1, drink: 'espresso', extra: undefined } as unknown as GameState['customers'][number]);
    expect(emptyHandsWanted(s, grinder)).toBe(true); // an espresso needs grounds on the way
    s.supplies.beans = 0;
    expect(emptyHandsWanted(s, grinder)).toBe(false); // nothing to grind
  });
});
