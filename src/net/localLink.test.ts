import { describe, it, expect } from 'vitest';
import { createLocalLink, wantsLocalLink } from './localLink';

const tick = () => new Promise((r) => setTimeout(r, 30));

describe('local BroadcastChannel link', () => {
  it('only turns on with ?link=local', () => {
    expect(wantsLocalLink('?link=local')).toBe(true);
    expect(wantsLocalLink('')).toBe(false);
    expect(wantsLocalLink('?link=trystero')).toBe(false);
  });

  it('joins, delivers broadcast and targeted messages, and reports leaves', async () => {
    const a = createLocalLink('TEST1', 'a');
    const joinedA: string[] = [];
    a.onPeerJoin((p) => joinedA.push(p));
    const got: [string, unknown, string][] = [];
    const b = createLocalLink('TEST1', 'b');
    const c = createLocalLink('TEST1', 'c');
    for (const [n, l] of [['b', b], ['c', c]] as const) l.onMessage('snap', (d, from) => got.push([n, d, from]));
    const other = createLocalLink('OTHER', 'z');
    await tick();
    expect(joinedA.sort()).toEqual(['b', 'c']);
    expect(other.peers()).toEqual([]);
    a.send('snap', { n: 1 });
    a.send('snap', { n: 2 }, 'c');
    await tick();
    expect(got).toEqual([['b', { n: 1 }, 'a'], ['c', { n: 1 }, 'a'], ['c', { n: 2 }, 'a']]);
    const left: string[] = [];
    a.onPeerLeave((p) => left.push(p));
    b.leave();
    await tick();
    expect(left).toEqual(['b']);
    expect(a.peers()).toEqual(['c']);
    for (const l of [a, c, other]) l.leave();
  });
});
