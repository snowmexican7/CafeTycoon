import { describe, it, expect } from 'vitest';
import v21 from './v2.1.0-save.fixture.json';
import v31night from './v3.1.0-night.fixture.json';
import v31week from './v3.1.0-weekend.fixture.json';
import { SNAPSHOT_VERSION, createSnapshotStore } from './snapshotStore';
import { memoryStorage } from './storageLike';
import { step } from '../sim/step';
import { scoreRun } from '../sim/score';
import { hudViewModel, nightViewModel, weekEndViewModel } from '../ui/viewModels';
import type { GameState } from '../sim/types';

/**
 * P6-5: real saves written by released builds (generated in v2.1.0 / v3.1.0 worktrees by playing seeded
 * stand-in crews), so "old saves still load" is checked against what those builds actually wrote.
 */
function load(env: unknown): GameState {
  const storage = memoryStorage();
  storage.setItem('cafetycoon.run', JSON.stringify(env));
  const s = createSnapshotStore(storage).load();
  expect(s).not.toBeNull();
  return s!;
}

/** Play from a night through the next day and back to night (stand-ins ready themselves). */
function nextNight(s: GameState): GameState {
  const days = s.days.length;
  let guard = 0;
  while (s.phase === 'night' && guard++ < 20000) s = step(s, []);
  expect(s.phase).toBe('day');
  expect(() => hudViewModel(s)).not.toThrow();
  while (s.phase !== 'night' && s.phase !== 'weekEnd' && s.phase !== 'ended' && guard++ < 400000) s = step(s, []);
  expect(s.days.length).toBe(days + 1);
  return s;
}

function roundTrip(s: GameState): void {
  const storage = memoryStorage();
  createSnapshotStore(storage).save(s);
  expect(JSON.parse(storage.getItem('cafetycoon.run')!).version).toBe(SNAPSHOT_VERSION);
  expect(createSnapshotStore(storage).load()).not.toBeNull();
}

describe('saves from released builds', () => {
  it('v2.1.0 (snapshot 22): a classic run three days in keeps playing', () => {
    expect(v21.version).toBe(22);
    let s = load(v21);
    expect(s.phase).toBe('night');
    expect(s.slots).toBeDefined(); // filled by the v24 migration
    expect(() => nightViewModel(s, s.players[0]!.id)).not.toThrow();
    s = nextNight(s);
    expect(Number.isFinite(scoreRun(s))).toBe(true);
    roundTrip(s);
  }, 60_000);

  it('v3.1.0 (snapshot 27): a Gear run mid-week plays on with the Phase 4 systems absent', () => {
    expect(v31night.version).toBe(27);
    let s = load(v31night);
    expect(s.gear).toBe(true);
    expect(s.season).toBeUndefined();
    expect(() => nightViewModel(s, s.players[0]!.id)).not.toThrow();
    s = nextNight(s);
    expect(Number.isFinite(s.cash)).toBe(true);
    roundTrip(s);
  }, 60_000);

  it('v3.1.0 (snapshot 27): a save on the week-end screen offers a season, and Keep going starts one', () => {
    let s = load(v31week);
    expect(s.phase).toBe('weekEnd');
    const vm = weekEndViewModel(s, s.hostId);
    expect(vm.season?.teaser).toContain('season');
    expect(vm.week?.n).toBe(7);
    s = step(s, [{ kind: 'weekEnd', playerId: s.hostId, choice: 'continue' }]);
    expect(s.phase).toBe('night');
    expect(s.season?.weeks).toHaveLength(1);
    s = nextNight(s);
    roundTrip(s);
  }, 60_000);
});
