import { describe, it, expect } from 'vitest';
import fixture from './phase1-save.fixture.json';
import { SNAPSHOT_VERSION, createSnapshotStore } from './snapshotStore';
import { memoryStorage } from './storageLike';
import { step } from '../sim/step';
import { scoreRun } from '../sim/score';
import { nightViewModel, hudViewModel } from '../ui/viewModels';
import type { GameState } from '../sim/types';

/**
 * B12: a real save written by the `phase1-final` build (snapshot v3, night after day 1,
 * generated in a phase1-final worktree). Phase 2 must pick it up and keep playing.
 */
describe('Phase 1 save migration', () => {
  it('loads a phase1-final save and plays the next day and night', () => {
    const storage = memoryStorage();
    storage.setItem('cafetycoon.run', JSON.stringify(fixture));
    expect(fixture.version).toBe(3);
    let s = createSnapshotStore(storage).load() as GameState;
    expect(s).not.toBeNull();
    expect(s.phase).toBe('night');
    expect(s.crew).toBeDefined();
    expect(() => nightViewModel(s, 'p1')).not.toThrow();
    const ids = s.players.filter((p) => !p.bot).map((p) => p.id);
    s = step(s, ids.map((id) => ({ kind: 'ready' as const, playerId: id })));
    let guard = 0;
    while (s.phase !== 'day' && guard++ < 5000) s = step(s, []);
    expect(s.phase).toBe('day');
    expect(() => hudViewModel(s)).not.toThrow();
    while ((s.phase === 'day' || s.phase === 'closing') && guard++ < 200000) s = step(s, []);
    expect(s.phase).toBe('night');
    expect(s.days.length).toBe(2);
    expect(Number.isFinite(scoreRun(s))).toBe(true);
    createSnapshotStore(storage).save(s);
    expect(JSON.parse(storage.getItem('cafetycoon.run')!).version).toBe(SNAPSHOT_VERSION);
  }, 30_000);
});
