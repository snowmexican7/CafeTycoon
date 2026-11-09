import { describe, expect, it } from 'vitest';
import { createRun, startDay } from './run';
import { stationsFromSlots } from './slots';
import { interact } from './stations';
import { nearestStation } from './movement';
import { espressoGroup, pickEspressoHead } from './groupHead';
import type { GameState } from './types';

function shop(): GameState {
  const s = createRun({ seed: 4, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], tier: 'stand', gear: true });
  s.cash = 5000;
  s.slots = ['grinder', 'espresso', null, 'trash'];
  s.slotGear = ['g1', 'e4', null, 'b0'];
  s.stations = stationsFromSlots('stand', s.slots, s.slotGear);
  startDay(s);
  s.customers = [];
  s.milkOut = 8;
  s.supplies.beans = 20;
  return s;
}

const me = (s: GameState) => s.players[0]!;
const heads = (s: GameState) => s.stations.filter((x) => x.kind === 'espresso');

describe('double group-head is one interactable with room for two shots', () => {
  it('standing at the main head pulls on the free head while a shot sits on the other', () => {
    const s = shop();
    const [a, b] = heads(s);
    expect(espressoGroup(s, a!)).toHaveLength(2);
    b!.output = 'espresso';
    b!.outputSince = s.tick;
    const main = a!;
    me(s).pos = { x: main.pos.x, y: main.pos.y + 1 };
    me(s).holding = 'grounds';
    expect(nearestStation(s, me(s).pos)?.id).toBe(main.id);
    expect(pickEspressoHead(s, me(s), main).id).toBe(main.id);
    interact(s, 'p1');
    expect(main.making).toBe('espresso');
    expect(main.busyTicksLeft).toBeGreaterThan(0);
    expect(b!.output).toBe('espresso');
    expect(s.pass).toHaveLength(0);
  });

  it('empty hands at the main head pick up the shot sitting on the other head', () => {
    const s = shop();
    const [a, b] = heads(s);
    b!.output = 'espresso';
    b!.outputSince = s.tick;
    me(s).pos = { x: a!.pos.x, y: a!.pos.y + 1 };
    me(s).holding = null;
    interact(s, 'p1');
    expect(me(s).holding).toBe('espresso');
    expect(b!.output).toBeNull();
    expect(a!.busyTicksLeft).toBe(0);
  });

  it('a waiting shot does not lock the machine when the other head is free', () => {
    const s = shop();
    const [a, b] = heads(s);
    a!.output = 'espresso';
    me(s).pos = { x: a!.pos.x, y: a!.pos.y + 1 };
    me(s).holding = 'grounds';
    interact(s, 'p1');
    expect(b!.making).toBe('espresso');
    expect(a!.output).toBe('espresso');
  });
});
