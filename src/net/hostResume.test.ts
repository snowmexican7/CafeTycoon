import { describe, it, expect } from 'vitest';
import { createRun, startDay, startNight } from '../sim/run';
import { applyNightInput, stepNight } from '../sim/night';
import { markPeersAway } from './hostResume';

describe('markPeersAway', () => {
  it('marks every non-host player disconnected and still, leaving the host alone', () => {
    const s = createRun({ seed: 1, hostId: 'H', players: [{ id: 'H', name: 'Host' }, { id: 'P', name: 'Sam' }, { id: 'Q', name: 'Jo' }] });
    s.players[0].moveDir = { x: 1, y: 0 };
    s.players[1].moveDir = { x: 0, y: 1 };
    s.players[1].heldDir = { x: 0, y: 1 };
    s.players[1].interactQueued = true;
    s.players[2].connected = false;
    const t = markPeersAway(s, 'H');
    expect(t.players.map((p) => p.connected)).toEqual([true, false, false]);
    expect(t.players[1].moveDir).toEqual({ x: 0, y: 0 });
    expect(t.players[1].interactQueued).toBe(false);
    expect([t.players[1].heldDir, t.players[1].moveDir]).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
    expect(t.players[0].moveDir).toEqual({ x: 1, y: 0 });
    expect(s.players[1].connected).toBe(true); // input untouched
  });
});

describe('host resume with bots', () => {
  it('Review Focus 4: resume keeps bots connected', () => {
    const day = startDay(createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }] }));
    expect(day.players.map((p) => p.id)).toEqual(['p1', 'p2', 'bot-1']);
    const t = markPeersAway(day, 'p1');
    expect(t.players.map((p) => [p.id, p.connected])).toEqual([
      ['p1', true],
      ['p2', false],
      ['bot-1', true],
    ]);
    let night = startNight(t);
    night = applyNightInput(night, { kind: 'ready', playerId: 'p1' });
    const morning = stepNight(night);
    expect(morning.phase).toBe('day');
    expect(morning.players.filter((p) => p.bot).map((p) => p.id)).toEqual(['bot-1', 'bot-2']);
  });
});
