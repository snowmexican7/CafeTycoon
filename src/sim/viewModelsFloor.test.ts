import { describe, it, expect } from 'vitest';
import { hudViewModel } from '../ui/viewModels';
import { createRun, startDay } from './run';

describe('hud floor', () => {
  it('hud shows messes, mop, cleanliness, stuns and cleaning', () => {
    const s = startDay(createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }], settings: { bots: 0 } }));
    s.messes = [
      { id: 4, kind: 'spill', x: 3, y: 4, amount: 1 },
      { id: 7, kind: 'grounds', x: 8, y: 2, amount: 0.5 },
    ];
    s.cleanliness = 72.6;
    s.mop = { pos: { x: 3.5, y: 4 }, heldBy: 'p2' };
    const [p1, p2] = s.players;
    p1.stunTicksLeft = 61;
    p2.tool = 'mop';
    p2.cleaningTicksLeft = 90;
    p2.cleaningMess = 4;
    const vm = hudViewModel(s);
    expect(vm.messes).toEqual([
      { id: 4, kind: 'spill', x: 3, y: 4, amount: 1 },
      { id: 7, kind: 'grounds', x: 8, y: 2, amount: 0.5 },
    ]);
    expect(vm.cleanliness).toBe(73);
    expect(vm.mop).toEqual({ x: 3.5, y: 4, heldBy: 'p2' });
    expect(vm.stuns).toEqual([{ playerId: 'p1', secondsLeft: 2 }]);
    expect(vm.cleaning).toEqual([{ playerId: 'p2', secondsLeft: 2 }]);

    p1.stunTicksLeft = 0;
    p2.cleaningTicksLeft = 0;
    s.messes = [];
    s.mop = { pos: { x: 11, y: 7 }, heldBy: null };
    const idle = hudViewModel(s);
    expect(idle.messes).toEqual([]);
    expect(idle.stuns).toEqual([]);
    expect(idle.cleaning).toEqual([]);
    expect(idle.mop).toEqual({ x: 11, y: 7, heldBy: null });
  });
});
