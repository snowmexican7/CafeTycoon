import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { applyGearInput, GEAR_VOTE_MIN } from './gear';
import { validateInput } from './validate';
import { gearVM } from '../ui/gearVM';
import { gearBoard } from '../ui/night';
import type { GameState, PlayerId } from './types';

const run = (n: number): GameState => {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: ['Kay', 'Mo', 'Ari', 'Jo'][i] }));
  const s = createRun({ seed: 3, hostId: 'p1', players, settings: { bots: 0 }, tier: 'stand', gear: true });
  s.phase = 'night';
  s.cash = 500;
  return s;
};
const buy = (s: GameState, by: PlayerId, gear: 'e4' | 'c1' | 'e3') => applyGearInput(s, { kind: 'gear', playerId: by, action: 'buy', gear });
const vote = (s: GameState, by: PlayerId, yes: boolean) => applyGearInput(s, { kind: 'gear', playerId: by, action: 'vote', yes });
const owns = (s: GameState, id: string) => (s.slotGear ?? []).includes(id as never);

describe('Gear G8: co-op majority vote for big buys', () => {
  it('solo: a big buy happens at once', () => {
    const s = run(1);
    buy(s, 'p1', 'e4');
    expect(owns(s, 'e4')).toBe(true);
    expect(s.gearVote).toBeUndefined();
  });

  it('co-op: a cheap buy (under $50) skips the vote', () => {
    const s = run(2);
    buy(s, 'p1', 'c1');
    expect(owns(s, 'c1')).toBe(true);
    expect(s.gearVote).toBeUndefined();
    expect(GEAR_VOTE_MIN).toBe(50);
  });

  it('co-op of 2: a big buy waits, then passes on the second yes', () => {
    const s = run(2);
    const cash = s.cash;
    buy(s, 'p1', 'e4');
    expect(owns(s, 'e4')).toBe(false);
    expect(s.gearVote).toMatchObject({ by: 'p1', gear: 'e4', yes: ['p1'], no: [] });
    vote(s, 'p1', true); // double vote ignored
    expect(s.gearVote!.yes).toEqual(['p1']);
    vote(s, 'p2', true);
    expect(owns(s, 'e4')).toBe(true);
    expect(s.cash).toBe(cash - 260);
    expect(s.gearVote).toBeUndefined();
    expect(s.gearVoteLast).toMatchObject({ passed: true });
    expect(s.gearLog?.at(-1)).toMatchObject({ gear: 'e4', action: 'buy', by: 'Kay' });
  });

  it('a tie fails (2 of 4 yes)', () => {
    const s = run(4);
    buy(s, 'p1', 'e4');
    vote(s, 'p2', true);
    expect(s.gearVote).toBeDefined(); // 2 of 4 is not a majority yet
    vote(s, 'p3', false);
    expect(s.gearVote).toBeDefined();
    vote(s, 'p4', false);
    expect(s.gearVote).toBeUndefined();
    expect(owns(s, 'e4')).toBe(false);
    expect(s.gearVoteLast).toMatchObject({ passed: false });
  });

  it('only one open proposal; the proposer can withdraw', () => {
    const s = run(3);
    buy(s, 'p1', 'e4');
    buy(s, 'p2', 'e3');
    expect(s.gearVote!.gear).toBe('e4');
    vote(s, 'p1', false);
    expect(s.gearVote).toBeUndefined();
    expect(s.gearVoteLast!.text).toMatch(/withdrew/);
  });

  it('bots and disconnected players do not count', () => {
    const s = run(3);
    s.players[2].connected = false;
    buy(s, 'p1', 'e4');
    vote(s, 'p3', true); // disconnected: ignored
    expect(s.gearVote!.yes).toEqual(['p1']);
    vote(s, 'p2', true);
    expect(owns(s, 'e4')).toBe(true);
  });

  it('review I1: the other voter drops, then the proposer withdraws: nothing is bought', () => {
    const s = run(2);
    const cash = s.cash;
    buy(s, 'p1', 'e4');
    s.players[1].connected = false; // Mo dropped without the sim noticing yet
    vote(s, 'p1', false); // Kay clicks Withdraw
    expect(owns(s, 'e4')).toBe(false);
    expect(s.cash).toBe(cash);
    expect(s.gearVote).toBeUndefined();
    expect(s.gearVoteLast).toMatchObject({ passed: false });
    expect(s.gearVoteLast!.text).toMatch(/withdrew/);
  });

  it('review I1: a leave settles the open vote at once', () => {
    const s = run(3);
    buy(s, 'p1', 'e3');
    vote(s, 'p2', false);
    expect(s.gearVote).toBeDefined(); // 1 yes, 1 no, 1 undecided
    const after = step(s, [{ kind: 'leave', playerId: 'p3' }]);
    expect(after.gearVote).toBeUndefined(); // 1 yes of 2 is not a majority and nobody can swing it
    expect(after.gearVoteLast).toMatchObject({ passed: false });
  });

  it('cash is checked when it passes', () => {
    const s = run(2);
    buy(s, 'p1', 'e4');
    s.cash = 10;
    vote(s, 'p2', true);
    expect(owns(s, 'e4')).toBe(false);
    expect(s.gearVoteLast).toMatchObject({ passed: false });
    expect(s.gearVoteLast!.text).toMatch(/enough cash/);
  });

  it('a big sale also needs a vote', () => {
    const s = run(2);
    s.slotGear = ['e4'] as never;
    const cash = s.cash;
    applyGearInput(s, { kind: 'gear', playerId: 'p2', action: 'sell', index: 0 });
    expect(s.gearVote).toMatchObject({ action: 'sell', gear: 'e4', amount: 130 });
    vote(s, 'p1', true);
    expect(s.cash).toBe(cash + 130);
  });

  it('the open vote lapses when the day starts', () => {
    const s = run(2);
    buy(s, 'p1', 'e4');
    s.slotGear = ['c1'] as never;
    startDay(s);
    expect(s.gearVote).toBeUndefined();
    expect(s.gearVoteLast).toBeUndefined();
  });

  it('validates the vote input', () => {
    expect(validateInput({ kind: 'gear', playerId: 'p1', action: 'vote', yes: true })).toMatchObject({ action: 'vote', yes: true });
    expect(validateInput({ kind: 'gear', playerId: 'p1', action: 'vote', yes: 'y' } as never)).toBeNull();
  });

  it('the board shows the vote with Yes/No to others and Withdraw to the proposer', () => {
    const s = run(2);
    buy(s, 'p1', 'e4');
    const other = gearBoard(gearVM(s, 'p2'));
    expect(other).toContain('Kay wants to buy La Marzipana Due ($260).'); // FB2 C9: E4 is La Marzipana Due
    expect(other).toContain('data-action="gear-vote" data-yes="1"');
    const mine = gearBoard(gearVM(s, 'p1'));
    expect(mine).toContain('Withdraw');
    expect(gearBoard(gearVM(run(1), 'p1'))).not.toContain('gr-vote');
  });
});
