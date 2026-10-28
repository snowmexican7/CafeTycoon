import { describe, it, expect } from 'vitest';
import { createRun } from './run';
import { emitLog, pruneLog } from './log';

describe('sim log', () => {
  it('emits with increasing seq and prunes after 120 ticks', () => {
    const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
    s.tick = 5;
    emitLog(s, 'pass.put', { item: 'latte' });
    emitLog(s, 'trash');
    expect(s.log.map((e) => e.seq)).toEqual([1, 2]);
    expect(s.log[1].data).toEqual({});
    s.tick = 125;
    pruneLog(s);
    expect(s.log).toHaveLength(2);
    s.tick = 126;
    pruneLog(s);
    expect(s.log).toHaveLength(0);
  });
});
