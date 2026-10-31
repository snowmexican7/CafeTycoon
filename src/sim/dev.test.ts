import { describe, expect, it } from 'vitest';
import { GEAR_IDS } from '../data/gear';
import { createRun } from './run';
import { DEV_CASH } from './dev';
import { scoreRun, summarizeRun } from './score';
import { step } from './step';
import { validateInput } from './validate';
import { foldMeta } from '../storage/metaStore';
import { emptyMeta } from '../storage/metaStore';
import { createMetaStore } from '../storage/metaStore';
import { createRecordsStore } from '../storage/recordsStore';
import { createHistoryStore } from '../storage/historyStore';
import type { CreateRunOptions, GameState, PlayerInput } from './types';

const opts = (dev?: boolean): CreateRunOptions => ({
  seed: 7,
  hostId: 'p1',
  players: [{ id: 'p1', name: 'P1' }, { id: 'p2', name: 'P2' }],
  settings: { bots: 0 },
  tier: 'stand',
  gear: true,
  ...(dev === undefined ? {} : { dev }),
});
const ticks = (s: GameState, n: number, first: PlayerInput[] = []): GameState => {
  for (let i = 0; i < n; i++) s = step(s, i === 0 ? first : []);
  return s;
};
const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), size: () => m.size };
};

describe('R4 a: dev mode', () => {
  it('dev is only set when asked for', () => {
    expect('dev' in createRun(opts())).toBe(false);
    expect('dev' in createRun(opts(false))).toBe(false);
    const s = createRun(opts(true));
    expect(s.dev).toBe(true);
    expect(s.cash).toBe(DEV_CASH);
  });

  it('dev off: the run is identical to one made without the option', () => {
    let a = createRun(opts());
    let b = createRun(opts(false));
    expect(b).toEqual(a);
    a = ticks(a, 900);
    b = ticks(b, 900);
    expect(b).toEqual(a);
  });

  it('dev on: a fresh stand run grows to the cafe and buys every gear line on night 1', () => {
    let s = createRun(opts(true));
    s = step(s, [{ kind: 'grow', playerId: 'p1', tier: 'cart' }]);
    expect(s.tier).toBe('cart');
    s = step(s, [{ kind: 'grow', playerId: 'p1', tier: 'cafe' }]);
    expect(s.tier).toBe('cafe');
    expect(s.cash).toBe(DEV_CASH);
    for (const id of GEAR_IDS) {
      s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: id }]); // two crew: $50+ is a proposal ...
      s = step(s, [{ kind: 'gear', playerId: 'p2', action: 'vote', yes: true }]); // ... and the second yes carries it
      expect(s.gearVote).toBeUndefined();
      if (id === 'e6') expect(s.gearVoteLast).toMatchObject({ passed: true }); // the $800 vote carries: cash never fails it
      // (with no steamer line since C9, d5b takes the sixth slot; d4b finds none: room, not cash)
      expect(s.cash).toBeGreaterThanOrEqual(DEV_CASH);
    }
    // the top of every ladder went in (Double Trouble is $800), one machine per slot
    const top = (s.slotGear ?? []).filter(Boolean).sort();
    expect(top).toEqual(['b0', 'c5', 'd4', 'd5b', 'e6', 'g3']);
    // the same night-1 buys without dev are out of reach
    const poor = step(step(createRun(opts()), []), [{ kind: 'gear', playerId: 'p1', action: 'buy', gear: 'e6' }]);
    expect((poor.slotGear ?? []).includes('e6')).toBe(false);
  });

  it('cash is topped up after every spend (restock, hire) and at each night start', () => {
    let s = createRun(opts(true));
    s = step(s, [{ kind: 'restock', playerId: 'p1', supply: 'beans', packs: 5 }]);
    expect(s.cash).toBe(DEV_CASH);
    // run a whole day: the next night starts at the top-up again, whatever rent did
    for (let i = 0; i < 60 * 600 && s.day < 2; i++) s = step(s, []);
    expect(s.phase).toBe('night');
    expect(s.day).toBe(2);
    expect(s.cash).toBeGreaterThanOrEqual(DEV_CASH); // rent came out, the day's takings went in, the top-up covers the rest
  });

  it('the top-up is not income: score, takings and season targets ignore it', () => {
    let s = createRun(opts(true));
    expect(scoreRun(s)).toBe(0);
    s = step(s, [{ kind: 'grow', playerId: 'p1', tier: 'cart' }]);
    expect(s.cash).toBe(DEV_CASH);
    // money was spent, so the score is the (negative) resale-adjusted cost, never plus the top-up
    expect(scoreRun(s)).toBeLessThanOrEqual(0);
    expect(s.today.sales).toBe(0);
    expect(summarizeRun(s, '2026-10-30').dev).toBe(true);
    expect('dev' in summarizeRun(createRun(opts()), '2026-10-30')).toBe(false);
  });

  it('a dev run writes nothing to meta, records or history', () => {
    const s = createRun(opts(true));
    s.phase = 'ended';
    s.days = Array.from({ length: 7 }, (_, i) => ({ ...s.today, day: i + 1, served: 50 }));
    expect(foldMeta(emptyMeta(), s)).toEqual({ meta: emptyMeta(), newly: [] });
    const storage = memory();
    expect(createMetaStore(storage).record(s)).toEqual([]);
    createRecordsStore(storage).record(s, [], '2026-10-30', 100);
    createHistoryStore(storage).append(summarizeRun(s, '2026-10-30'));
    expect(storage.size()).toBe(0);
    // the same run without dev does fold
    delete s.dev;
    expect(foldMeta(emptyMeta(), s).meta.weeks).toBe(1);
  });

  describe('paused night', () => {
    const pause = (paused: boolean, playerId = 'p1'): PlayerInput => ({ kind: 'devPause', playerId, paused });

    it('the night timer stays put while paused, and counts again when resumed', () => {
      let s = createRun(opts(true));
      s = step(s, [pause(true)]);
      expect(s.devPaused).toBe(true);
      const left = s.phaseTicksLeft;
      s = ticks(s, 5000);
      expect(s.phase).toBe('night');
      expect(s.phaseTicksLeft).toBe(left);
      s = step(s, [pause(false)]);
      expect('devPaused' in s).toBe(false);
      s = ticks(s, 10);
      expect(s.phaseTicksLeft).toBe(left - 11); // the resume tick counts too
    });

    it('Ready still opens the shop while paused, and the pause clears at day start', () => {
      let s = createRun(opts(true));
      s = step(s, [pause(true)]);
      s = ticks(s, 100);
      s = step(s, [{ kind: 'ready', playerId: 'p1' }, { kind: 'ready', playerId: 'p2' }]);
      expect(s.phase).toBe('day');
      expect(s.devPaused).toBeUndefined();
    });

    it('a paused relaxed night stays put too (last call does not run)', () => {
      let s = createRun({ ...opts(true), settings: { bots: 0, nightLengthSec: 0 } });
      s = step(s, [pause(true), { kind: 'ready', playerId: 'p1' }]);
      s = ticks(s, 60 * 40);
      expect(s.phase).toBe('night');
    });

    it('the weekEnd screen can be paused as well', () => {
      let s = createRun(opts(true));
      s.phase = 'weekEnd';
      s = step(s, [pause(true)]);
      expect(s.devPaused).toBe(true);
    });

    it('refuses non-host, non-dev, and day-time pauses', () => {
      let s = createRun(opts(true));
      s = step(s, [pause(true, 'p2')]);
      expect(s.devPaused).toBeUndefined();
      const off = step(createRun(opts()), [pause(true)]);
      expect(off.devPaused).toBeUndefined();
      const day = createRun(opts(true));
      day.phase = 'day';
      expect(step(day, [pause(true)]).devPaused).toBeUndefined();
    });

    it('validateInput: paused must be a boolean', () => {
      expect(validateInput({ kind: 'devPause', playerId: 'p1', paused: true })).toEqual({ kind: 'devPause', playerId: 'p1', paused: true });
      expect(validateInput({ kind: 'devPause', playerId: 'p1', paused: 'yes' } as never)).toBeNull();
      expect(validateInput({ kind: 'devPause', playerId: 'p1' } as never)).toBeNull();
    });
  });
});
