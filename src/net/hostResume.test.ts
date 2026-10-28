import { describe, it, expect } from 'vitest';
import { createRun } from '../sim/run';
import { markPeersAway } from './hostResume';

describe('markPeersAway', () => {
  it('marks every non-host player disconnected and still, leaving the host alone', () => {
    const s = createRun({ seed: 1, hostId: 'H', players: [{ id: 'H', name: 'Host' }, { id: 'P', name: 'Sam' }, { id: 'Q', name: 'Jo' }] });
    s.players[0].moveDir = { x: 1, y: 0 };
    s.players[1].moveDir = { x: 0, y: 1 };
    s.players[1].interactQueued = true;
    s.players[2].connected = false;
    const t = markPeersAway(s, 'H');
    expect(t.players.map((p) => p.connected)).toEqual([true, false, false]);
    expect(t.players[1].moveDir).toEqual({ x: 0, y: 0 });
    expect(t.players[1].interactQueued).toBe(false);
    expect(t.players[0].moveDir).toEqual({ x: 1, y: 0 });
    expect(s.players[1].connected).toBe(true); // input untouched
  });
});
